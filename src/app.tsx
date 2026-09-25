import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Batch, BatchDoc, Rec, RecordDoc, Source } from './types';
import { DOC_CAP, ARCHIVE_CHUNK, PLACEHOLDER_VALUES } from './constants';
import { clampInt, errCode, local, randomId, saveErrorCopy } from './util';
import { preparePhoto } from './image';
import { READ_OFF_CODES, readErrorCopy, readNameplate, type Extraction, type ReadProgress, type Tier } from './extract';
import * as store from './store';
import { buildXlsx } from './export/xlsx';
import { buildDocx } from './export/docx';
import { buildCsv } from './export/csv';
import { exportBaseName, notesText } from './export/common';
import {
  BatchesScreen,
  CameraScreen,
  ConfirmScreen,
  ExtractingScreen,
  ListScreen,
  SetupScreen,
  Sheets,
  Toasts,
} from './views';
import type { Draft, Sheet, StoredDraft, Toast } from './ui-types';

// ------------------------------------------------------------------ runtime

interface Caps {
  status: 'loading' | 'ready' | 'nostorage';
  db: DB | null;
  assets: Claude.Assets | null;
  sample: typeof Claude.sample | null;
  downloads: typeof Claude.downloads | null;
  user: typeof Claude.user | null;
  uid: string | null;
  canWrite: boolean;
  isAdmin: boolean;
  imagesOK: boolean;
}

const INITIAL_CAPS: Caps = {
  status: 'loading',
  db: null,
  assets: null,
  sample: null,
  downloads: null,
  user: null,
  uid: null,
  canWrite: true,
  isAdmin: false,
  imagesOK: false,
};

async function capability<T>(name: string): Promise<T | null> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c || typeof c.use !== 'function') return null;
  try {
    return ((await c.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

const LAST_KEY = 'fc.lastBatch';
const DRAFT_KEY = 'fc.draft';

type Screen = 'boot' | 'batches' | 'setup' | 'list' | 'camera' | 'extracting' | 'confirm';

function useMedia(q: string): boolean {
  const [m, setM] = useState(() => (typeof matchMedia === 'function' ? matchMedia(q).matches : false));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}

function blankDraft(key: string, batchId: string, source: Source, shownNo: number): Draft {
  const noplate = source === 'noplate';
  return {
    key,
    batchId,
    mode: 'new',
    recId: null,
    no: '',
    shownNo,
    origNo: null,
    brand: noplate ? 'Unknown' : '',
    model: noplate ? 'No Nameplate' : '',
    serial: noplate ? 'No Nameplate' : '',
    type: '',
    typeReason: '',
    typeFromAI: false,
    color: '',
    colorHint: null,
    notes: noplate ? ['Nameplate worn off'] : [],
    freeNotes: '',
    source,
    photo: null,
    origPhoto: null,
    photoUrl: null,
    photoState: 'none',
    photoNote: null,
    read: { state: 'none' },
    by: null,
    createdAt: null,
  };
}

export function blobUrl(id: string | null | undefined): string | null {
  return id && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? '/_blob/' + id : null;
}

function normSerial(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '');
}

function uploadErrorCopy(code: string): string {
  switch (code) {
    case 'quota_or_state':
      return 'Photo storage is full, so this photo wasn’t kept. The unit still saves.';
    case 'too_large':
      return 'Photo too large to keep. The unit still saves.';
    case 'not_granted':
    case 'capability_disabled':
      return 'Photos aren’t kept at your access level. The unit still saves.';
    default:
      return 'Photo upload failed. The unit still saves; retake to try again.';
  }
}

// ------------------------------------------------------------------ app

function App() {
  const [caps, setCaps] = useState<Caps>(INITIAL_CAPS);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);
  const [recordsLive, setRecordsLive] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>('boot');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [extract, setExtract] = useState<{ key: string; url: string; progress: ReadProgress } | null>(null);
  const [saving, setSaving] = useState<null | 'saving' | 'uploading'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rereading, setRereading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [photoUsage, setPhotoUsage] = useState<Claude.assets.Usage | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [pendingDraft, setPendingDraft] = useState<StoredDraft | null>(null);
  const [busyOp, setBusyOp] = useState(false);
  const wide = useMedia('(min-width: 980px)');

  const batch = useMemo(() => batches.find((b) => b.id === batchId) || null, [batches, batchId]);

  // Refs mirror state for async handlers.
  const capsRef = useRef(caps);
  capsRef.current = caps;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const batchRef = useRef(batch);
  batchRef.current = batch;
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const camInput = useRef<HTMLInputElement>(null);
  const galInput = useRef<HTMLInputElement>(null);
  const pickPurpose = useRef<'capture' | 'retake' | 'attach'>('capture');
  const photoBlob = useRef<Blob | null>(null);
  const upl = useRef<{ key: string; seq: number; p: Promise<string | null> } | null>(null);
  const seqRef = useRef(0);
  const deadKeys = useRef(new Set<string>());
  const readCtl = useRef<AbortController | null>(null);
  const deletingBatch = useRef<string | null>(null);
  const reconciled = useRef<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((msg: string, ms = 5200) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), ms);
  }, []);

  const showToast = useCallback((t: Toast, ms = 1300) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const patchDraft = useCallback((key: string, fn: (d: Draft) => Draft) => {
    setDraft((d) => (d && d.key === key ? fn(d) : d));
  }, []);

  // ---------------------------------------------------------------- capabilities
  useEffect(() => {
    let alive = true;
    (async () => {
      const [db, assets, sample, downloads, user] = await Promise.all([
        capability<DB>('db'),
        capability<Claude.Assets>('assets'),
        capability<typeof Claude.sample>('sample'),
        capability<typeof Claude.downloads>('downloads'),
        capability<typeof Claude.user>('user'),
      ]);
      if (!alive) return;
      let uid: string | null = null;
      let canWrite = true;
      let isAdmin = false;
      if (user) {
        try {
          isAdmin = (await user.canEdit()) || (await user.isOwner());
        } catch {
          isAdmin = false;
        }
        try {
          uid = await user.id();
        } catch {
          uid = null;
        }
        try {
          const w = await user.can('data.write');
          if (w === false) canWrite = false;
        } catch {
          /* keep default */
        }
      }
      let imagesOK = false;
      if (sample) {
        try {
          const lim = await sample.limits();
          imagesOK = !!lim.images;
        } catch {
          imagesOK = false;
        }
      }
      if (!alive) return;
      setCaps({
        status: db ? 'ready' : 'nostorage',
        db,
        assets,
        sample,
        downloads,
        user,
        uid,
        canWrite: canWrite && !!db,
        isAdmin: isAdmin && !!db,
        imagesOK,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---------------------------------------------------------------- batches (live)
  useEffect(() => {
    const db = caps.db;
    if (!db) return;
    const unsub = db
      .collection('batches')
      .orderBy('updatedAt', 'desc')
      .limit(1000)
      .onSnapshot(
        (snap) => {
          setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as BatchDoc) })));
          setBatchesLoaded(true);
        },
        (e) => {
          if (errCode(e) === 'unavailable') window.setTimeout(() => setEpoch((n) => n + 1), 2000);
          else setCaps((c) => ({ ...c, status: 'nostorage', canWrite: false }));
        },
      );
    return unsub;
  }, [caps.db, epoch]);

  // ---------------------------------------------------------------- records of the open batch (live)
  const archivedFlag = !!batch?.archived;
  useEffect(() => {
    const db = caps.db;
    setRecords([]);
    setRecordsLoaded(false);
    setRecordsLive(false);
    setExpanded(null);
    if (!db || !batchId) return;
    const onErr = (e: DbError) => {
      if (errCode(e) === 'unavailable') window.setTimeout(() => setEpoch((n) => n + 1), 2000);
    };
    if (archivedFlag) {
      return store.archiveCol(db, batchId).onSnapshot((snap) => {
        const recs = snap.docs.flatMap((d) => ((d.data()?.records as unknown as Rec[]) || []));
        setRecords(store.sortRecs(recs));
        setRecordsLoaded(true);
        setRecordsLive(!snap.metadata.fromCache);
      }, onErr);
    }
    return store.recordsCol(db, batchId).onSnapshot((snap) => {
      const recs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as RecordDoc) }));
      setRecords(store.sortRecs(recs));
      setRecordsLoaded(true);
      setRecordsLive(!snap.metadata.fromCache && !snap.metadata.hasPendingWrites);
    }, onErr);
  }, [caps.db, batchId, archivedFlag, epoch]);

  // Repair the batch's summary counts once per visit, from live records.
  useEffect(() => {
    const db = caps.db;
    if (!db || !batch || !recordsLive || !caps.canWrite || batch.archived || batch.status !== 'open') return;
    if (reconciled.current === batch.id) return;
    reconciled.current = batch.id;
    store.reconcileBatch(db, batch, records).catch(() => {});
  }, [caps.db, caps.canWrite, batch, records, recordsLive]);

  // Resolve display names for "logged by" (never stored).
  useEffect(() => {
    const user = caps.user;
    const ids = [...new Set(records.map((r) => r.by).filter((x): x is string => !!x))];
    if (!user || !ids.length) return;
    let alive = true;
    user
      .profiles(ids)
      .then((ps) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        for (const id of ids) m[id] = ps[id]?.name || '';
        setNames(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [caps.user, records]);

  // Photo storage meter (housekeeping read, once per visit to the batch list).
  useEffect(() => {
    if (screen !== 'batches' || !caps.assets || photoUsage) return;
    caps.assets
      .list()
      .then((r) => setPhotoUsage(r.usage))
      .catch(() => {});
  }, [screen, caps.assets, photoUsage]);

  // ---------------------------------------------------------------- boot routing
  useEffect(() => {
    if (screen !== 'boot') return;
    if (caps.status === 'nostorage') {
      setScreen('setup');
      return;
    }
    if (!batchesLoaded) return;
    const last = local.get<string>(LAST_KEY);
    const lb = batches.find((b) => b.id === last);
    if (lb && lb.status === 'open') {
      setBatchId(lb.id);
      setScreen('list');
    } else if (batches.length) setScreen('batches');
    else setScreen('setup');
  }, [screen, caps.status, batchesLoaded, batches]);

  // Batch removed elsewhere while open here (only once it has been seen in a snapshot).
  const seenBatch = useRef<string | null>(null);
  useEffect(() => {
    if (!batchId || !batchesLoaded) return;
    if (batches.some((b) => b.id === batchId)) {
      seenBatch.current = batchId;
      return;
    }
    if (seenBatch.current !== batchId || deletingBatch.current === batchId) return;
    seenBatch.current = null;
    setBatchId(null);
    setDraft(null);
    setSheet(null);
    setScreen('batches');
    flash('That batch was deleted on another device.');
  }, [batches, batchId, batchesLoaded, flash]);

  // Unsent draft for this batch (per-device convenience).
  useEffect(() => {
    if (!batchId) {
      setPendingDraft(null);
      return;
    }
    const sd = local.get<StoredDraft>(DRAFT_KEY);
    setPendingDraft(sd && sd.batchId === batchId && !draftRef.current ? sd : null);
  }, [batchId]);

  useEffect(() => {
    if (!draft) return;
    const t = window.setTimeout(() => {
      const { photoUrl: _u, key: _k, ...rest } = draft;
      local.set(DRAFT_KEY, { batchId: draft.batchId, savedAt: Date.now(), draft: rest } satisfies StoredDraft);
    }, 500);
    return () => window.clearTimeout(t);
  }, [draft]);

  // Scroll a just-saved unit into view.
  useEffect(() => {
    if (!scrollTo || screen !== 'list') return;
    const el = document.getElementById('rec-' + scrollTo);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setScrollTo(null);
    }
  }, [scrollTo, records, screen]);

  // ---------------------------------------------------------------- derived
  const dupNos = useMemo(() => {
    const seen = new Map<number, number>();
    for (const r of records) seen.set(r.no, (seen.get(r.no) || 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([no]) => no));
  }, [records]);

  const dupSerialOf = useMemo(() => {
    if (!draft) return null;
    const s = normSerial(draft.serial);
    if (!s || PLACEHOLDER_VALUES.has(draft.serial.trim().toLowerCase())) return null;
    const hit = records.find((r) => r.id !== draft.recId && normSerial(r.serial || '') === s);
    return hit ? hit.no : null;
  }, [draft, records]);

  const suggestedStart = useMemo(() => {
    const recent = [...batches].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!recent) return { start: 1, from: null as string | null };
    return { start: Math.max(1, recent.nextNumber || 1), from: recent.name };
  }, [batches]);

  const capacity = useMemo(() => {
    let docs = batches.length;
    for (const b of batches) docs += b.archived ? Math.ceil((b.count || 0) / ARCHIVE_CHUNK) : b.count || 0;
    return { docs, pct: docs / DOC_CAP };
  }, [batches]);

  // Guards the on-screen next number against a snapshot that hasn't caught up with our own save.
  const lastSaved = useRef<{ batchId: string; no: number; at: number } | null>(null);
  const liveNext = (b: Batch | null): number => {
    if (!b) return 1;
    const ls = lastSaved.current;
    if (ls && ls.batchId === b.id && Date.now() - ls.at < 15000) return Math.max(b.nextNumber, ls.no + 1);
    return b.nextNumber;
  };

  const writable = caps.canWrite && caps.status === 'ready';
  const batchOpen = !!batch && batch.status === 'open';

  // ---------------------------------------------------------------- navigation
  const openBatch = (id: string) => {
    setBatchId(id);
    local.set(LAST_KEY, id);
    setSheet(null);
    setScreen('list');
  };

  const goBatches = () => {
    setSheet(null);
    setScreen('batches');
    setPhotoUsage(null);
  };

  const beginBatch = async (name: string, start: number) => {
    const db = capsRef.current.db;
    if (!db) return;
    setBusyOp(true);
    try {
      const nb = await store.createBatch(db, name.trim(), start, capsRef.current.uid);
      setBatches((bs) => (bs.some((x) => x.id === nb.id) ? bs : [nb, ...bs]));
      openBatch(nb.id);
    } catch (e) {
      if (errCode(e) === 'invalid_argument') setCaps((c) => ({ ...c, canWrite: false }));
      flash(saveErrorCopy(e));
    } finally {
      setBusyOp(false);
    }
  };

  // ---------------------------------------------------------------- photos
  const openCamera = (purpose: 'capture' | 'retake') => {
    pickPurpose.current = purpose;
    camInput.current?.click();
  };
  const openGallery = (purpose: 'capture' | 'retake' | 'attach') => {
    pickPurpose.current = purpose;
    galInput.current?.click();
  };

  const startUpload = (key: string, blob: Blob) => {
    const seq = ++seqRef.current;
    const assets = capsRef.current.assets;
    if (!assets) {
      upl.current = { key, seq, p: Promise.resolve(null) };
      return;
    }
    const type = /^image\/(jpeg|png|webp|gif)$/.test(blob.type) ? blob.type : 'image/jpeg';
    const p = assets.upload(blob, { type }).then(
      (r) => {
        const cur = upl.current;
        if (!cur || cur.seq !== seq || deadKeys.current.has(key)) {
          assets.delete(r.id).catch(() => {});
          return null;
        }
        patchDraft(key, (d) => ({ ...d, photo: r.id, photoState: 'stored', photoNote: null }));
        return r.id;
      },
      (e) => {
        if (upl.current?.seq === seq)
          patchDraft(key, (d) => ({ ...d, photoState: 'failed', photoNote: uploadErrorCopy(errCode(e)) }));
        return null;
      },
    );
    upl.current = { key, seq, p };
  };

  const applyExtraction = (key: string, ex: Extraction) => {
    patchDraft(key, (d) => {
      if (ex.notAPlate)
        return {
          ...d,
          read: { state: 'notplate', tier: ex.tier, message: 'No nameplate found in this photo. Retake it, or type the values.' },
        };
      const takeType = !!ex.type && (!d.type || d.typeFromAI);
      return {
        ...d,
        brand: ex.brand || d.brand,
        model: ex.model || d.model,
        serial: ex.serial || d.serial,
        type: takeType ? ex.type : d.type,
        typeReason: takeType ? ex.typeReason : d.typeReason,
        typeFromAI: takeType ? true : d.typeFromAI,
        colorHint: ex.color ? { color: ex.color, reason: ex.colorReason } : null,
        read: { state: 'ok', tier: ex.tier, low: ex.low },
      };
    });
  };

  const runRead = async (key: string, blob: Blob, url: string, tier: Tier, fullScreen: boolean) => {
    const c = capsRef.current;
    if (!c.sample || !c.imagesOK) {
      patchDraft(key, (d) => ({
        ...d,
        read: { state: 'unavailable', message: 'Plate reading isn’t available in this view. Type the values from the photo.' },
      }));
      if (fullScreen) setScreen('confirm');
      return;
    }
    readCtl.current?.abort();
    const ctl = new AbortController();
    readCtl.current = ctl;
    if (fullScreen) {
      setExtract({ key, url, progress: { brand: false, model: false, serial: false } });
      setScreen('extracting');
    } else setRereading(true);
    try {
      const ex = await readNameplate(c.sample, blob, tier, ctl.signal, (p) => {
        if (fullScreen) setExtract((x) => (x && x.key === key ? { ...x, progress: p } : x));
      });
      applyExtraction(key, ex);
    } catch (e) {
      const code = errCode(e);
      if (READ_OFF_CODES.has(code)) setCaps((cs) => ({ ...cs, imagesOK: false }));
      patchDraft(key, (d) => ({
        ...d,
        read: code === 'cancelled' ? { state: 'skipped' } : { state: 'error', message: readErrorCopy(code) },
      }));
    } finally {
      if (readCtl.current === ctl) readCtl.current = null;
      setRereading(false);
      if (fullScreen) setScreen((s) => (s === 'extracting' && draftRef.current?.key === key ? 'confirm' : s));
    }
  };

  const handlePhoto = async (file: File, purpose: 'capture' | 'retake' | 'attach') => {
    const b = batchRef.current;
    if (!b) return;
    let prep;
    try {
      prep = await preparePhoto(file);
    } catch {
      flash('That file isn’t a photo that can be read. Use a JPEG or PNG.');
      return;
    }
    photoBlob.current = prep.blob;
    const stateFor = capsRef.current.assets ? ('uploading' as const) : ('unstored' as const);
    const noteFor = capsRef.current.assets ? null : 'Photos aren’t kept at your access level. The unit still saves.';
    let key: string;
    const cur = draftRef.current;
    if (purpose === 'capture' || !cur) {
      key = randomId(10);
      const d = blankDraft(key, b.id, 'photo', liveNext(b));
      d.photoUrl = prep.url;
      d.photoState = stateFor;
      d.photoNote = noteFor;
      setDraft(d);
      setSaveError(null);
    } else {
      key = cur.key;
      // The photo being replaced: drop it unless the saved record still points at it.
      if (cur.photo && cur.photo !== cur.origPhoto) capsRef.current.assets?.delete(cur.photo).catch(() => {});
      if (cur.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(cur.photoUrl);
      patchDraft(key, (d) => ({
        ...d,
        photoUrl: prep.url,
        photo: null,
        photoState: stateFor,
        photoNote: noteFor,
        source: purpose === 'retake' ? 'photo' : d.source,
      }));
    }
    startUpload(key, prep.blob);
    if (purpose === 'attach') return;
    await runRead(key, prep.blob, prep.url, 'quick', true);
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handlePhoto(file, pickPurpose.current);
  };

  const reread = () => {
    const d = draftRef.current;
    if (!d || !photoBlob.current || !d.photoUrl) return;
    void runRead(d.key, photoBlob.current, d.photoUrl, 'default', false);
  };

  const stopRead = () => readCtl.current?.abort();

  // ---------------------------------------------------------------- drafts
  const startManual = (source: 'manual' | 'noplate') => {
    const b = batchRef.current;
    if (!b) return;
    photoBlob.current = null;
    setDraft(blankDraft(randomId(10), b.id, source, liveNext(b)));
    setSaveError(null);
    setScreen('confirm');
  };

  const discardDraftUploads = (d: Draft, keep: string | null) => {
    deadKeys.current.add(d.key);
    const assets = capsRef.current.assets;
    if (assets && d.photo && d.photo !== keep && d.photo !== d.origPhoto) assets.delete(d.photo).catch(() => {});
    upl.current = null;
  };

  const endDraft = (d: Draft, keep: string | null) => {
    discardDraftUploads(d, keep);
    if (d.photoUrl?.startsWith('blob:')) {
      const u = d.photoUrl;
      window.setTimeout(() => URL.revokeObjectURL(u), 3000);
    }
    readCtl.current?.abort();
    photoBlob.current = null;
    local.del(DRAFT_KEY);
    setPendingDraft(null);
    setDraft(null);
    setExtract(null);
    setSaveError(null);
  };

  const cancelDraft = () => {
    const d = draftRef.current;
    if (d) endDraft(d, null);
    setSheet(null);
    setScreen('list');
  };

  const editRecord = (r: Rec) => {
    photoBlob.current = null;
    setDraft({
      key: randomId(10),
      batchId: batchRef.current?.id || '',
      mode: 'edit',
      recId: r.id,
      no: String(r.no),
      shownNo: null,
      origNo: r.no,
      brand: r.brand || '',
      model: r.model || '',
      serial: r.serial || '',
      type: r.type || '',
      typeReason: r.typeReason || '',
      typeFromAI: false,
      color: r.color || '',
      colorHint: null,
      notes: [...(r.notes || [])],
      freeNotes: r.freeNotes || '',
      source: r.source,
      photo: r.photo,
      origPhoto: r.photo,
      photoUrl: blobUrl(r.photo),
      photoState: r.photo ? 'stored' : 'none',
      photoNote: null,
      read: { state: 'none' },
      by: r.by,
      createdAt: r.createdAt,
    });
    setSaveError(null);
    setScreen('confirm');
  };

  const resumePending = () => {
    const sd = pendingDraft;
    if (!sd) return;
    photoBlob.current = null;
    const d: Draft = {
      ...sd.draft,
      key: randomId(10),
      shownNo: sd.draft.mode === 'new' ? liveNext(batchRef.current) : null,
      photoUrl: blobUrl(sd.draft.photo),
      photoState: sd.draft.photo ? 'stored' : 'none',
      read: sd.draft.read.state === 'ok' ? sd.draft.read : { state: 'none' },
    };
    setPendingDraft(null);
    setDraft(d);
    setScreen('confirm');
  };

  const discardPending = () => {
    const sd = pendingDraft;
    const assets = capsRef.current.assets;
    if (sd && assets && sd.draft.photo && sd.draft.photo !== sd.draft.origPhoto) assets.delete(sd.draft.photo).catch(() => {});
    local.del(DRAFT_KEY);
    setPendingDraft(null);
  };

  const save = async (next: boolean) => {
    const d = draftRef.current;
    const b = batchRef.current;
    const db = capsRef.current.db;
    if (!d || !b || !db || saving) return;
    setSaveError(null);
    let photo = d.photo;
    if (upl.current && upl.current.key === d.key && d.photoState === 'uploading') {
      setSaving('uploading');
      photo = await upl.current.p.catch(() => null);
    }
    setSaving('saving');
    try {
      const fields = {
        type: d.type,
        typeReason: d.type ? d.typeReason : '',
        brand: d.brand.trim(),
        model: d.model.trim(),
        serial: d.serial.trim(),
        color: d.color,
        notes: d.notes,
        freeNotes: d.freeNotes.trim(),
        source: d.source,
        photo,
      };
      let savedNo: number;
      let savedId: string;
      if (d.mode === 'new') {
        const res = await store.commitNewRecord(db, b.id, d.shownNo ?? liveNext(b), { ...fields, by: capsRef.current.uid });
        savedNo = res.no;
        savedId = res.id;
        lastSaved.current = { batchId: b.id, no: res.no, at: Date.now() };
        if (res.renumberedFrom != null)
          flash(`Saved as #${res.no}. #${res.renumberedFrom} was just taken on another device — label this unit #${res.no}.`, 9000);
        else showToast({ kind: 'saved', title: 'Saved', detail: `Unit #${res.no} written` });
      } else {
        const no = clampInt(d.no, 0) ?? d.origNo ?? 0;
        await store.updateRecord(db, b.id, d.recId!, { ...fields, no });
        if (d.origPhoto && d.origPhoto !== photo) capsRef.current.assets?.delete(d.origPhoto).catch(() => {});
        savedNo = no;
        savedId = d.recId!;
        showToast({ kind: 'saved', title: 'Updated', detail: `Unit #${no} saved` });
      }
      if (d.photoState === 'failed' || (d.photoUrl && !photo && d.mode === 'new' && capsRef.current.assets))
        flash(`Unit #${savedNo} saved without its photo.`);
      endDraft(d, photo);
      setExpanded(null);
      setScrollTo(savedId);
      setScreen(next ? 'camera' : 'list');
    } catch (e) {
      const code = errCode(e);
      if (code === 'invalid_argument' && d.mode === 'edit' && !recordsRef.current.some((r) => r.id === d.recId)) {
        setSaveError('This unit was deleted on another device. Cancel to go back, or save it again as a new unit from the list.');
      } else {
        if (code === 'invalid_argument') setCaps((c) => ({ ...c, canWrite: false }));
        setSaveError(saveErrorCopy(e));
      }
    } finally {
      setSaving(null);
    }
  };

  const confirmDeleteRecord = (r: Rec) => {
    setSheet({
      kind: 'confirm',
      title: `Delete unit #${r.no}?`,
      body: `${[r.brand, r.type].filter(Boolean).join(' · ') || 'This unit'} and its photo will be removed from every device. This can’t be undone.`,
      action: 'Delete unit',
      danger: true,
      run: async () => {
        const db = capsRef.current.db;
        const b = batchRef.current;
        if (!db || !b) return;
        setSheet(null);
        try {
          const remaining = recordsRef.current.filter((x) => x.id !== r.id);
          await store.deleteRecord(db, b.id, r, remaining);
          if (r.photo) capsRef.current.assets?.delete(r.photo).catch(() => {});
          const d = draftRef.current;
          if (d && d.recId === r.id) {
            endDraft(d, d.origPhoto);
            setScreen('list');
          }
          flash(`Unit #${r.no} deleted.`, 3000);
        } catch (e) {
          flash(saveErrorCopy(e));
        }
      },
    });
  };

  // ---------------------------------------------------------------- batch operations
  const runLong = async (title: string, op: (p: store.Progress) => Promise<void>, doneMsg: string) => {
    setBusyOp(true);
    setSheet({ kind: 'progress', title, done: 0, total: 1 });
    try {
      await op((done, total) => setSheet((s) => (s && s.kind === 'progress' ? { ...s, done, total } : s)));
      setSheet(null);
      flash(doneMsg, 3500);
    } catch (e) {
      setSheet(null);
      flash(saveErrorCopy(e));
    } finally {
      setBusyOp(false);
    }
  };

  const closeBatch = () => {
    const b = batchRef.current;
    if (!b) return;
    setSheet({
      kind: 'confirm',
      title: 'Close this batch?',
      body: `${b.name} (${recordsRef.current.length} units) becomes read-only and is packed into a few storage slots. Export still works, and you can reopen it anytime.`,
      action: 'Close batch',
      run: () => {
        const db = capsRef.current.db;
        if (!db) return;
        void runLong('Closing batch', (p) => store.closeBatch(db, b.id, p), `${b.name} closed.`);
      },
    });
  };

  const reopenBatch = () => {
    const b = batchRef.current;
    const db = capsRef.current.db;
    if (!b || !db) return;
    void runLong('Reopening batch', (p) => store.reopenBatch(db, b.id, p), `${b.name} reopened.`);
  };

  const deleteBatch = () => {
    const b = batchRef.current;
    if (!b) return;
    const n = recordsRef.current.length;
    setSheet({
      kind: 'confirm',
      title: `Delete “${b.name}”?`,
      body: `This removes the batch, its ${n} unit${n === 1 ? '' : 's'} and their photos from every device. Export first if you need a copy. This can’t be undone.`,
      action: 'Delete batch',
      danger: true,
      run: () => {
        const db = capsRef.current.db;
        if (!db) return;
        deletingBatch.current = b.id;
        void runLong(
          'Deleting batch',
          async (p) => {
            await store.deleteBatch(db, capsRef.current.assets, b.id, p);
            if (local.get<string>(LAST_KEY) === b.id) local.del(LAST_KEY);
            setBatchId(null);
            setScreen('batches');
          },
          `${b.name} deleted.`,
        ).finally(() => {
          deletingBatch.current = null;
        });
      },
    });
  };

  const saveBatchMeta = async (name: string, nextNumber: number) => {
    const b = batchRef.current;
    const db = capsRef.current.db;
    if (!b || !db) return;
    try {
      await store.updateBatchMeta(db, b.id, { name: name.trim() || b.name, nextNumber });
      setSheet(null);
      flash('Batch updated.', 2500);
    } catch (e) {
      flash(saveErrorCopy(e));
    }
  };

  const doExport = async (ext: 'xlsx' | 'csv' | 'docx') => {
    const b = batchRef.current;
    const downloads = capsRef.current.downloads;
    if (!b) return;
    if (!downloads) {
      flash('Downloads aren’t available in this view. Open the page in Claude to export.');
      return;
    }
    const input = { batch: b, records: recordsRef.current, exportedAt: new Date(), names };
    const filename = `${exportBaseName(b.name, recordsRef.current)}.${ext}`;
    const data =
      ext === 'xlsx'
        ? new Blob([buildXlsx(input)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        : ext === 'docx'
          ? new Blob([buildDocx(input)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
          : new Blob([buildCsv(input)], { type: 'text/csv' });
    setSheet(null);
    try {
      const r = await downloads.save({ filename, data });
      if (r.status === 'saved')
        showToast({ kind: 'exported', title: 'Downloaded', detail: filename, sub: `${recordsRef.current.length} records exported` }, 1800);
    } catch (e) {
      const code = errCode(e);
      if (code === 'declined') return;
      if (code === 'rate_limited') flash('A download is already waiting for you. Finish that one first.');
      else if (code === 'extension_not_enabled' || code === 'rejected_extension') flash(`.${ext} files can’t be saved here. Try another format.`);
      else flash('Couldn’t save the file here. Try again, or open the page in Claude on a computer.');
    }
  };

  // ---------------------------------------------------------------- render
  const liveNo = liveNext(batch);
  const stats = useMemo(
    () => ({
      count: records.length,
      noPlate: records.filter((r) => r.source === 'noplate').length,
      withNotes: records.filter((r) => notesText(r)).length,
    }),
    [records],
  );

  let body: React.ReactNode = null;
  if (screen === 'boot' || screen === 'setup') {
    body = (
      <SetupScreen
        status={caps.status === 'loading' || (screen === 'boot' && !batchesLoaded) ? 'loading' : caps.status === 'nostorage' ? 'nostorage' : writable ? 'ready' : 'readonly'}
        hasBatches={batches.length > 0}
        suggestedStart={suggestedStart.start}
        continuesFrom={suggestedStart.from}
        busy={busyOp}
        onBack={goBatches}
        onBegin={beginBatch}
      />
    );
  } else if (screen === 'batches') {
    body = (
      <BatchesScreen
        batches={batches}
        writable={writable}
        photoUsage={photoUsage}
        capacity={capacity}
        onOpen={openBatch}
        onNew={() => setScreen('setup')}
      />
    );
  } else if (screen === 'list' && batch) {
    body = (
      <ListScreen
        batch={batch}
        records={records}
        loaded={recordsLoaded}
        wide={wide}
        writable={writable}
        names={names}
        dupNos={dupNos}
        expanded={expanded}
        pendingDraft={pendingDraft}
        onToggle={(id) => setExpanded((x) => (x === id ? null : id))}
        onBack={goBatches}
        onMenu={() => setSheet({ kind: 'menu' })}
        onCapture={() => openCamera('capture')}
        onNoPlate={() => startManual('noplate')}
        onManual={() => startManual('manual')}
        onEdit={editRecord}
        onDelete={confirmDeleteRecord}
        onPhoto={(url, caption) => setSheet({ kind: 'photo', url, caption })}
        onExport={() => setSheet({ kind: 'export' })}
        onReopen={reopenBatch}
        onResume={resumePending}
        onDiscard={discardPending}
      />
    );
  } else if (screen === 'camera' && batch) {
    body = (
      <CameraScreen
        unitNo={liveNo}
        onCancel={() => setScreen('list')}
        onShutter={() => openCamera('capture')}
        onGallery={() => openGallery('capture')}
        onNoPlate={() => startManual('noplate')}
      />
    );
  } else if (screen === 'extracting' && extract) {
    body = (
      <ExtractingScreen
        unitNo={liveNo}
        photoUrl={extract.url}
        progress={extract.progress}
        onSkip={stopRead}
        onCancel={cancelDraft}
      />
    );
  } else if (screen === 'confirm' && draft && batch) {
    body = (
      <ConfirmScreen
        draft={draft}
        unitNo={liveNo}
        wide={wide}
        saving={saving}
        saveError={saveError}
        dupSerialOf={dupSerialOf}
        canReread={!!photoBlob.current && !!caps.sample && caps.imagesOK && draft.source === 'photo'}
        rereading={rereading}
        loggedBy={draft.by ? names[draft.by] || '' : ''}
        onChange={(patch) => patchDraft(draft.key, (d) => ({ ...d, ...patch }))}
        onCancel={cancelDraft}
        onRetake={() => openCamera('retake')}
        onAttach={() => openGallery('attach')}
        onReread={reread}
        onStopRead={stopRead}
        onOpenType={() => setSheet({ kind: 'type' })}
        onPhoto={(url, caption) => setSheet({ kind: 'photo', url, caption })}
        onSave={save}
        onDelete={() => {
          const r = records.find((x) => x.id === draft.recId);
          if (r) confirmDeleteRecord(r);
        }}
      />
    );
  } else if (batchId && !batch && !batchesLoaded) {
    body = (
      <div className="screen">
        <div className="loading-note">Opening batch…</div>
      </div>
    );
  } else {
    // Batch vanished or not yet loaded: fall back to the list of batches.
    body = (
      <BatchesScreen
        batches={batches}
        writable={writable}
        photoUsage={photoUsage}
        capacity={capacity}
        onOpen={openBatch}
        onNew={() => setScreen('setup')}
      />
    );
  }

  return (
    <div className={'app' + (wide ? ' wide' : '')}>
      {body}
      <Sheets
        sheet={sheet}
        batch={batch}
        records={records}
        stats={stats}
        writable={writable}
        isAdmin={caps.isAdmin}
        batchOpen={batchOpen}
        draft={draft}
        busy={busyOp}
        onClose={() => setSheet(null)}
        onPickType={(t) => {
          if (draft) patchDraft(draft.key, (d) => ({ ...d, type: t, typeReason: 'manual', typeFromAI: false }));
          setSheet(null);
        }}
        onExportMenu={() => setSheet({ kind: 'export' })}
        onExport={doExport}
        onEditBatch={() => setSheet({ kind: 'editBatch' })}
        onSaveBatch={saveBatchMeta}
        onAllBatches={goBatches}
        onNewBatch={() => {
          setSheet(null);
          setScreen('setup');
        }}
        onCloseBatch={closeBatch}
        onReopenBatch={() => {
          setSheet(null);
          reopenBatch();
        }}
        onDeleteBatch={deleteBatch}
      />
      <Toasts toast={toast} notice={notice} onDismiss={() => setNotice(null)} />
      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={onFileChosen} />
      <input ref={galInput} type="file" accept="image/*" hidden onChange={onFileChosen} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

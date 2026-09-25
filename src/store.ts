// All database writes live here. Layout in the artifact's db:
//   batches/{batchId}                      BatchDoc
//   batches/{batchId}/records/{recordId}   RecordDoc   (open batches: one doc per unit)
//   batches/{batchId}/archive/{a000..}     {i, records: Rec[]}  (closed batches, compacted)
// Unit numbers are assigned under a short lease on the batch doc so two
// devices saving into the same batch never get the same number.

import type { Batch, BatchDoc, Rec, RecordDoc } from './types';
import { ARCHIVE_CHUNK } from './constants';
import { errCode, randomId, sleep } from './util';

export const TAB_ID = 'tab_' + randomId(12);

export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (errCode(e) !== 'unavailable') throw e;
    await sleep(300 + Math.random() * 500);
    return fn();
  }
}

export const batchDoc = (db: DB, id: string) => db.doc(`batches/${id}`);
export const recordsCol = (db: DB, id: string) => db.collection(`batches/${id}/records`);
export const archiveCol = (db: DB, id: string) => db.collection(`batches/${id}/archive`);

type Json = Record<string, unknown>;
const J = (o: object) => o as unknown as Json;

async function lease(ref: DocumentReference): Promise<boolean> {
  const deadline = Date.now() + 15000;
  for (;;) {
    let r: AcquireResult;
    try {
      r = await retryOnce(() => ref.acquire({ holder: TAB_ID, ttlMs: 8000 }));
    } catch (e) {
      const c = errCode(e);
      if (c === 'capability_removed' || c === 'capability_disabled') return false; // runtime without leases
      throw e;
    }
    if (r.acquired) return true;
    if (Date.now() > deadline) throw { code: 'busy' };
    const wait = r.expiresAt ? Date.parse(r.expiresAt) - Date.now() : 600;
    await sleep(Math.min(Math.max(wait, 150), 2500) + Math.random() * 250);
  }
}

/** Leases have no release verb; renewing with the minimum TTL frees it within a second. */
function release(ref: DocumentReference) {
  ref.acquire({ holder: TAB_ID, ttlMs: 1000 }).catch(() => {});
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<unknown>, onEach?: () => void) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const it = items[i++];
      await fn(it);
      onEach?.();
    }
  });
  await Promise.all(workers);
}

function span(recs: { no: number }[]) {
  if (!recs.length) return { firstUnit: null, lastUnit: null };
  const nos = recs.map((r) => r.no);
  return { firstUnit: Math.min(...nos), lastUnit: Math.max(...nos) };
}

export function sortRecs<T extends { no: number; createdAt: number }>(recs: T[]): T[] {
  return [...recs].sort((a, b) => a.no - b.no || a.createdAt - b.createdAt);
}

// ---------------------------------------------------------------- batches

export async function createBatch(db: DB, name: string, startNumber: number, by: string | null): Promise<Batch> {
  const ref = db.collection('batches').doc();
  const now = Date.now();
  const body: BatchDoc = {
    name,
    startNumber,
    nextNumber: startNumber,
    status: 'open',
    archived: false,
    count: 0,
    firstUnit: null,
    lastUnit: null,
    createdAt: now,
    updatedAt: now,
    createdBy: by,
  };
  await retryOnce(() => ref.set(J(body)));
  return { id: ref.id, ...body };
}

export async function updateBatchMeta(db: DB, id: string, patch: { name?: string; nextNumber?: number }) {
  const ref = batchDoc(db, id);
  const held = await lease(ref);
  try {
    await retryOnce(() => ref.update({ ...patch, updatedAt: Date.now() }));
  } finally {
    if (held) release(ref);
  }
}

/** Keeps the batch's summary fields in line with its live records (absolute values, idempotent). */
export async function reconcileBatch(db: DB, b: Batch, recs: Rec[]) {
  const s = span(recs);
  if (b.count === recs.length && b.firstUnit === s.firstUnit && b.lastUnit === s.lastUnit) return;
  await retryOnce(() => batchDoc(db, b.id).update({ count: recs.length, ...s }));
}

// ---------------------------------------------------------------- records

export type NewRecordBody = Omit<RecordDoc, 'no' | 'createdAt' | 'updatedAt' | 'renumberedFrom'>;

export async function commitNewRecord(
  db: DB,
  batchId: string,
  expectedNo: number,
  body: NewRecordBody,
): Promise<{ id: string; no: number; renumberedFrom: number | null }> {
  const bref = batchDoc(db, batchId);
  const held = await lease(bref);
  try {
    const snap = await retryOnce(() => bref.get());
    if (!snap.exists) throw { code: 'batch_gone' };
    const b = snap.data() as unknown as BatchDoc;
    if (b.status === 'closed') throw { code: 'batch_closed' };
    const no = Number.isFinite(b.nextNumber) ? b.nextNumber : expectedNo;
    const renumberedFrom = no !== expectedNo ? expectedNo : null;
    const now = Date.now();
    const rref = recordsCol(db, batchId).doc();
    const rec: RecordDoc = { ...body, no, createdAt: now, updatedAt: now, renumberedFrom };
    await retryOnce(() => rref.set(J(rec)));
    await retryOnce(() =>
      bref.update({
        nextNumber: no + 1,
        updatedAt: now,
        count: (b.count || 0) + 1,
        firstUnit: b.firstUnit == null ? no : Math.min(b.firstUnit, no),
        lastUnit: b.lastUnit == null ? no : Math.max(b.lastUnit, no),
      }),
    );
    return { id: rref.id, no, renumberedFrom };
  } finally {
    if (held) release(bref);
  }
}

export async function updateRecord(db: DB, batchId: string, recId: string, patch: Partial<RecordDoc>) {
  await retryOnce(() =>
    db.doc(`batches/${batchId}/records/${recId}`).update(J({ ...patch, updatedAt: Date.now() })),
  );
  await retryOnce(() => batchDoc(db, batchId).update({ updatedAt: Date.now() })).catch(() => {});
}

export async function deleteRecord(db: DB, batchId: string, rec: Rec, remaining: Rec[]) {
  await retryOnce(() => db.doc(`batches/${batchId}/records/${rec.id}`).delete());
  await retryOnce(() =>
    batchDoc(db, batchId).update({ count: remaining.length, ...span(remaining), updatedAt: Date.now() }),
  ).catch(() => {});
}

// ---------------------------------------------------------------- lifecycle

function chunks(recs: Rec[]): Rec[][] {
  const out: Rec[][] = [];
  let cur: Rec[] = [];
  let size = 0;
  for (const r of recs) {
    const s = JSON.stringify(r).length;
    if (cur.length && (cur.length >= ARCHIVE_CHUNK || size + s > 180_000)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

const chunkId = (i: number) => 'a' + String(i).padStart(3, '0');

export type Progress = (done: number, total: number) => void;

/** Close = lock the batch, then compact its records into a few archive docs
 *  (the artifact db holds 5,000 docs; a closed batch of 150 units uses 2). */
export async function closeBatch(db: DB, batchId: string, onProgress: Progress) {
  const bref = batchDoc(db, batchId);
  const held = await lease(bref);
  try {
    await retryOnce(() => bref.update({ status: 'closed', updatedAt: Date.now() }));
  } finally {
    if (held) release(bref);
  }
  const snap = await retryOnce(() => recordsCol(db, batchId).get());
  const recs = sortRecs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as RecordDoc) })));
  const parts = chunks(recs);
  const total = parts.length + recs.length + 1;
  let done = 0;
  const tick = () => onProgress(++done, total);

  for (let i = 0; i < parts.length; i++) {
    await retryOnce(() => archiveCol(db, batchId).doc(chunkId(i)).set({ i, records: parts[i] as unknown as Json[] }));
    tick();
  }
  const existing = await retryOnce(() => archiveCol(db, batchId).get());
  const keep = new Set(parts.map((_, i) => chunkId(i)));
  for (const d of existing.docs) {
    if (!keep.has(d.id)) await retryOnce(() => archiveCol(db, batchId).doc(d.id).delete());
  }
  await retryOnce(() =>
    bref.update({ archived: true, status: 'closed', count: recs.length, ...span(recs), updatedAt: Date.now() }),
  );
  tick();
  await pool(recs, 4, (r) => retryOnce(() => recordsCol(db, batchId).doc(r.id).delete()), tick);
}

export async function reopenBatch(db: DB, batchId: string, onProgress: Progress) {
  const snap = await retryOnce(() => archiveCol(db, batchId).get());
  const recs = sortRecs(snap.docs.flatMap((d) => ((d.data()?.records as unknown as Rec[]) || [])));
  const total = recs.length + snap.docs.length + 1;
  let done = 0;
  const tick = () => onProgress(++done, total);
  await pool(
    recs,
    4,
    (r) => {
      const { id, ...body } = r;
      return retryOnce(() => recordsCol(db, batchId).doc(id).set(J(body)));
    },
    tick,
  );
  await retryOnce(() =>
    batchDoc(db, batchId).update({ status: 'open', archived: false, count: recs.length, ...span(recs), updatedAt: Date.now() }),
  );
  tick();
  for (const d of snap.docs) {
    await retryOnce(() => archiveCol(db, batchId).doc(d.id).delete());
    tick();
  }
}

/** Deletes every record doc, archive doc and photo of a batch, then the batch. */
export async function deleteBatch(db: DB, assets: Claude.Assets | null, batchId: string, onProgress: Progress) {
  const [live, arch] = await Promise.all([
    retryOnce(() => recordsCol(db, batchId).get()),
    retryOnce(() => archiveCol(db, batchId).get()),
  ]);
  const photos = new Set<string>();
  for (const d of live.docs) {
    const p = (d.data() as unknown as RecordDoc | undefined)?.photo;
    if (p) photos.add(p);
  }
  for (const d of arch.docs) {
    for (const r of ((d.data()?.records as unknown as Rec[]) || [])) if (r.photo) photos.add(r.photo);
  }
  const total = live.docs.length + arch.docs.length + photos.size + 1;
  let done = 0;
  const tick = () => onProgress(++done, total);
  await pool(live.docs, 4, (d) => retryOnce(() => recordsCol(db, batchId).doc(d.id).delete()), tick);
  await pool(arch.docs, 2, (d) => retryOnce(() => archiveCol(db, batchId).doc(d.id).delete()), tick);
  if (assets) {
    await pool([...photos], 3, (id) => assets.delete(id).catch(() => null), tick);
  }
  await retryOnce(() => batchDoc(db, batchId).delete());
  tick();
}

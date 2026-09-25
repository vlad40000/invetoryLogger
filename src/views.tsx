import React, { useEffect, useId, useRef, useState } from 'react';
import type { Batch, Rec } from './types';
import { APPLIANCE_TYPES, COLORS, NOTE_CHIPS, SOURCE_LABEL } from './constants';
import { clampInt, fmtBytes, fmtDay, fmtTime } from './util';
import type { ReadProgress } from './extract';
import { exportBaseName, notesText } from './export/common';
import type { Draft, Sheet, StoredDraft, Toast } from './ui-types';

export type { Draft, Sheet, Toast } from './ui-types';

const SWATCH: Record<string, { swatch: string; bd: string }> = Object.fromEntries(
  COLORS.map((c) => [c.name, { swatch: c.swatch, bd: c.bd }]),
);

function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  const s = SWATCH[color];
  if (!s) return null;
  return <span className="sw" style={{ width: size, height: size, background: s.swatch, borderColor: s.bd }} aria-hidden="true" />;
}

function Brackets({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <>
      <span className={`bk tl ${size}`} />
      <span className={`bk tr ${size}`} />
      <span className={`bk bl ${size}`} />
      <span className={`bk br ${size}`} />
    </>
  );
}

function BrandLine() {
  return (
    <div className="brandline">
      <span className="brand-sq" aria-hidden="true" />
      <span>Field Capture</span>
    </div>
  );
}

// ================================================================== setup

export function SetupScreen(p: {
  status: 'loading' | 'ready' | 'nostorage' | 'readonly';
  hasBatches: boolean;
  suggestedStart: number;
  continuesFrom: string | null;
  busy: boolean;
  onBack: () => void;
  onBegin: (name: string, start: number) => void;
}) {
  const [name, setName] = useState('');
  const [start, setStart] = useState(String(p.suggestedStart));
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setStart(String(p.suggestedStart));
  }, [p.suggestedStart]);
  const n = clampInt(start, 0);
  const ready = p.status === 'ready';
  const can = ready && !!name.trim() && n != null && !p.busy;
  const status =
    p.status === 'loading'
      ? 'Connecting to storage…'
      : p.status === 'nostorage'
        ? 'Storage isn’t available in this view. Open this page in Claude to save batches.'
        : p.status === 'readonly'
          ? 'You have view-only access. Ask the owner for Contributor access to start batches.'
          : '';
  const begin = () => {
    if (can) p.onBegin(name, n!);
  };
  return (
    <div className="screen">
      <div className="setup-top">
        {p.hasBatches && (
          <button className="back" onClick={p.onBack}>
            ‹ All batches
          </button>
        )}
        <BrandLine />
        <h1 className="title">
          Inventory
          <br />
          Logger
        </h1>
        <p className="lede">Photograph appliance nameplates. Extract brand, model, serial. Export to spreadsheet.</p>
      </div>
      <div className="scroll">
        <div className="setup-body">
          <label className="label" htmlFor="batch-name">
            ▌ Batch name
          </label>
          <input
            id="batch-name"
            className="input big"
            type="text"
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. Riverbend Apartments"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') document.getElementById('start-no')?.focus();
            }}
          />
          <label className="label gap" htmlFor="start-no">
            ▌ Starting unit number
          </label>
          <div className="start-row">
            <input
              id="start-no"
              className="input num"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={start}
              onChange={(e) => {
                touched.current = true;
                setStart(e.target.value.replace(/[^0-9]/g, ''));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') begin();
              }}
            />
            <div className="aside">
              {p.continuesFrom && !touched.current
                ? `Continues the count from ${p.continuesFrom}. Change it anytime from the batch menu.`
                : 'Sequence counts up automatically. Change it anytime from the batch menu.'}
            </div>
          </div>
          <div className="howto">
            <div className="eyebrow">How it works</div>
            <ol>
              {[
                ['1', 'Photograph the nameplate'],
                ['2', 'Confirm brand, model, serial'],
                ['3', 'Pick color, appliance type, notes'],
                ['→', 'Save. Counter advances. Every device sees it. Export anytime.'],
              ].map(([k, t]) => (
                <li key={k}>
                  <span className={'step' + (k === '→' ? ' go' : '')}>{k}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div className="foot">
        {status && (
          <div className={'status' + (p.status === 'loading' ? '' : ' warn')} role="status">
            {status}
          </div>
        )}
        <button className="btn-primary tall" disabled={!can} onClick={begin}>
          <span>{p.busy ? 'Creating…' : 'Begin inventory'}</span>
          <span className="mono arrow">→</span>
        </button>
      </div>
    </div>
  );
}

// ================================================================== batches

export function BatchesScreen(p: {
  batches: Batch[];
  writable: boolean;
  photoUsage: Claude.assets.Usage | null;
  capacity: { docs: number; pct: number };
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const open = p.batches.filter((b) => b.status === 'open');
  const closed = p.batches.filter((b) => b.status !== 'open');
  const row = (b: Batch) => {
    const range =
      b.count && b.firstUnit != null && b.lastUnit != null
        ? b.firstUnit === b.lastUnit
          ? `#${b.firstUnit}`
          : `#${b.firstUnit}–#${b.lastUnit}`
        : null;
    return (
      <button key={b.id} className="batch-row" onClick={() => p.onOpen(b.id)}>
        <div className="br-main">
          <div className="br-name">{b.name || 'Untitled batch'}</div>
          <div className="br-meta mono">
            {range ? `${range} · ${b.count} unit${b.count === 1 ? '' : 's'}` : `No units yet · next #${b.nextNumber}`}
          </div>
        </div>
        <div className="br-side">
          <span className={'chip' + (b.status === 'open' ? ' open' : ' closed')}>{b.status === 'open' ? 'Open' : 'Closed'}</span>
          <span className="br-date">{fmtDay(b.updatedAt)}</span>
        </div>
      </button>
    );
  };
  const u = p.photoUsage;
  return (
    <div className="screen">
      <div className="batches-top">
        <BrandLine />
        <h1 className="title sm">Inventory Logger</h1>
      </div>
      <div className="section-head">
        <span className="label">▌ Batches</span>
        {p.writable && (
          <button className="btn-mini strong" onClick={p.onNew}>
            + New batch
          </button>
        )}
      </div>
      <div className="scroll">
        <div className="batch-list">
          {!p.batches.length && <div className="empty-note">No batches yet.</div>}
          {open.length > 0 && <div className="group-label">Open · {open.length}</div>}
          {open.map(row)}
          {closed.length > 0 && <div className="group-label">Closed · {closed.length}</div>}
          {closed.map(row)}
        </div>
      </div>
      <div className="batches-foot">
        {u && u.maxBytes > 0 && (
          <span>
            Photos <b className="mono">{fmtBytes(u.bytes)}</b> of {fmtBytes(u.maxBytes)}
          </span>
        )}
        <span className={p.capacity.pct > 0.8 ? 'warn' : ''}>
          Unit storage <b className="mono">{Math.round(p.capacity.pct * 100)}%</b>
          {p.capacity.pct > 0.6 ? ' · close finished batches to free space' : ' used'}
        </span>
      </div>
    </div>
  );
}

// ================================================================== list

function RecordDetail(p: {
  r: Rec;
  name: string;
  writable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPhoto: (url: string, caption: string) => void;
}) {
  const r = p.r;
  const url = r.photo && /^[A-Za-z0-9_-]{8,64}$/.test(r.photo) ? '/_blob/' + r.photo : null;
  const notes = notesText(r);
  return (
    <div className="detail-body">
      <div className="detail-cols">
        <dl className="detail-rows">
          <div>
            <dt>Serial</dt>
            <dd className="mono">{r.serial || '—'}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd className="mono">{r.model || '—'}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{r.type || '—'}</dd>
          </div>
          {notes && (
            <div>
              <dt>Notes</dt>
              <dd>{notes}</dd>
            </div>
          )}
        </dl>
        {url && (
          <button className="thumb" onClick={() => p.onPhoto(url, `Unit #${r.no} · ${r.brand || ''} ${r.model || ''}`.trim())} aria-label={`Open photo of unit #${r.no}`}>
            <img src={url} alt="" loading="lazy" />
          </button>
        )}
      </div>
      <div className="detail-meta mono">
        {SOURCE_LABEL[r.source]} · logged {fmtTime(r.createdAt)} · {fmtDay(r.createdAt)}
        {p.name ? ` · ${p.name}` : ''}
        {r.renumberedFrom != null ? ` · shown as #${r.renumberedFrom} when captured` : ''}
      </div>
      {p.writable && (
        <div className="detail-actions">
          <button className="btn-mini" onClick={p.onEdit}>
            Edit
          </button>
          <button className="btn-mini danger" onClick={p.onDelete}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function ListScreen(p: {
  batch: Batch;
  records: Rec[];
  loaded: boolean;
  wide: boolean;
  writable: boolean;
  names: Record<string, string>;
  dupNos: Set<number>;
  expanded: string | null;
  pendingDraft: StoredDraft | null;
  onToggle: (id: string) => void;
  onBack: () => void;
  onMenu: () => void;
  onCapture: () => void;
  onNoPlate: () => void;
  onManual: () => void;
  onEdit: (r: Rec) => void;
  onDelete: (r: Rec) => void;
  onPhoto: (url: string, caption: string) => void;
  onExport: () => void;
  onReopen: () => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const b = p.batch;
  const closed = b.status !== 'open';
  const canCapture = p.writable && !closed;
  const detail = (r: Rec) => (
    <RecordDetail
      r={r}
      name={(r.by && p.names[r.by]) || ''}
      writable={canCapture}
      onEdit={() => p.onEdit(r)}
      onDelete={() => p.onDelete(r)}
      onPhoto={p.onPhoto}
    />
  );
  const flags = (r: Rec) => (
    <>
      {p.dupNos.has(r.no) && <span className="flag">Dup</span>}
      {r.source === 'noplate' && <span className="flag soft">No plate</span>}
    </>
  );

  let content: React.ReactNode;
  if (!p.loaded) content = <div className="loading-note">Loading units…</div>;
  else if (!p.records.length)
    content = (
      <div className="empty">
        <div className="empty-plate">
          <Brackets size="sm" />
          <span className="mono">
            NAME
            <br />
            PLATE
          </span>
        </div>
        <div className="empty-title">{closed ? 'This batch has no units' : 'Ready to log the first unit'}</div>
        {!closed && (
          <div className="empty-sub">
            Counter starts at <span className="mono">#{b.nextNumber}</span>. Tap capture below to photograph a nameplate.
          </div>
        )}
      </div>
    );
  else if (p.wide)
    content = (
      <table className="rtable">
        <thead>
          <tr>
            <th>No.</th>
            <th>Appliance type</th>
            <th>Brand</th>
            <th>Model</th>
            <th>Serial</th>
            <th>Color</th>
            <th>Notes</th>
            <th>Logged</th>
          </tr>
        </thead>
        <tbody>
          {p.records.map((r) => {
            const open = p.expanded === r.id;
            return (
              <React.Fragment key={r.id}>
                <tr
                  id={'rec-' + r.id}
                  className={'trow' + (open ? ' open' : '')}
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={() => p.onToggle(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      p.onToggle(r.id);
                    }
                  }}
                >
                  <td className="mono strong nowrap">
                    #{r.no} {flags(r)}
                  </td>
                  <td>{r.type || '—'}</td>
                  <td>{r.brand || '—'}</td>
                  <td className="mono">{r.model || '—'}</td>
                  <td className="mono">{r.serial || '—'}</td>
                  <td className="nowrap">
                    <Swatch color={r.color} /> {r.color || '—'}
                  </td>
                  <td className="notes-cell">{notesText(r)}</td>
                  <td className="mono muted nowrap">
                    {fmtDay(r.createdAt)} {fmtTime(r.createdAt)}
                  </td>
                </tr>
                {open && (
                  <tr className="tdetail">
                    <td colSpan={8}>{detail(r)}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    );
  else
    content = (
      <div>
        <div className="col-head grid3">
          <div>No.</div>
          <div>Appliance · Model</div>
          <div className="r">Color</div>
        </div>
        {p.records.map((r) => {
          const open = p.expanded === r.id;
          return (
            <div key={r.id} id={'rec-' + r.id} className={'rec' + (open ? ' open' : '')}>
              <button className="rec-row grid3" aria-expanded={open} onClick={() => p.onToggle(r.id)}>
                <div className="rec-no mono">
                  #{r.no}
                  <div className="rec-flags">{flags(r)}</div>
                </div>
                <div className="rec-main">
                  <div className="rec-title">{[r.brand, r.type].filter(Boolean).join(' · ') || '—'}</div>
                  <div className="rec-model mono">{r.model || '—'}</div>
                </div>
                <div className="rec-color">
                  <div className="cc">
                    <Swatch color={r.color} />
                    <span>{r.color || '—'}</span>
                  </div>
                  <div className="caret mono">{open ? '▲' : '▼'}</div>
                </div>
              </button>
              {open && detail(r)}
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="screen">
      <header className="list-head">
        <div className="lh-row">
          <button className="back eyebrow" onClick={p.onBack}>
            ‹ All batches
          </button>
          <button className="kebab" onClick={p.onMenu} aria-label="Batch menu">
            <span />
            <span />
            <span />
          </button>
        </div>
        <div className="lh-name">{b.name}</div>
        <div className="lh-stats">
          <span className="stat">
            <b className="mono">{p.records.length}</b> records
          </span>
          {!closed && (
            <>
              <span className="vr" />
              <span className="stat">
                next <b className="mono">#{b.nextNumber}</b>
              </span>
            </>
          )}
          {closed && <span className="chip closed">Closed</span>}
          {!p.writable && <span className="chip">View only</span>}
        </div>
      </header>
      {p.pendingDraft && canCapture && (
        <div className="banner" role="status">
          <span>
            Unsaved unit from {fmtTime(p.pendingDraft.savedAt)}
            {p.pendingDraft.draft.model ? ` · ${p.pendingDraft.draft.model}` : ''}
          </span>
          <span className="banner-btns">
            <button className="btn-mini strong" onClick={p.onResume}>
              Resume
            </button>
            <button className="btn-mini" onClick={p.onDiscard}>
              Discard
            </button>
          </span>
        </div>
      )}
      <div className="scroll list-body">{content}</div>
      <footer className={'actionbar' + (p.wide ? ' wide' : '')}>
        {canCapture ? (
          <>
            <button className="btn-capture" onClick={p.onCapture}>
              <span className="lens" aria-hidden="true">
                <span />
              </span>
              <span>Capture #{b.nextNumber}</span>
            </button>
            <div className="pair">
              <button className="btn-outline" onClick={p.onNoPlate}>
                No Nameplate
              </button>
              <button className="btn-outline" onClick={p.onManual}>
                Manual Entry
              </button>
            </div>
          </>
        ) : (
          <div className="pair">
            <button className="btn-outline" onClick={p.onExport} disabled={!p.records.length}>
              Export
            </button>
            {closed && p.writable ? (
              <button className="btn-outline" onClick={p.onReopen}>
                Reopen batch
              </button>
            ) : (
              <button className="btn-outline" onClick={p.onBack}>
                All batches
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

// ================================================================== camera launcher

export function CameraScreen(p: {
  unitNo: number;
  onCancel: () => void;
  onShutter: () => void;
  onGallery: () => void;
  onNoPlate: () => void;
}) {
  return (
    <div className="screen dark">
      <div className="dark-top">
        <button className="btn-text light" onClick={p.onCancel}>
          ✕ Cancel
        </button>
        <div className="unit-live">
          <span className="rec-dot" aria-hidden="true" />
          <span className="mono">UNIT #{p.unitNo}</span>
        </div>
      </div>
      <div className="viewfinder">
        <div className="vf-glow" />
        <div className="vf-lines" />
        <button className="frame" onClick={p.onShutter} aria-label={`Open camera for unit #${p.unitNo}`}>
          <Brackets />
          <span className="frame-text">
            <span className="vf-label">Fill the frame</span>
            <span className="vf-sub mono">
              BRAND · MODEL · SERIAL
              <br />
              sharp, no glare
            </span>
          </span>
        </button>
      </div>
      <div className="tips">
        <span className="i">i</span>
        <span>Your camera opens next. AI reads the plate.</span>
      </div>
      <div className="controls">
        <button className="ctl" onClick={p.onGallery}>
          <span className="ctl-box">▦</span>
          <span className="ctl-label">Gallery</span>
        </button>
        <button className="shutter" onClick={p.onShutter} aria-label={`Take photo for unit #${p.unitNo}`}>
          <span />
        </button>
        <button className="ctl" onClick={p.onNoPlate}>
          <span className="ctl-box mono">✕</span>
          <span className="ctl-label">No plate</span>
        </button>
      </div>
    </div>
  );
}

// ================================================================== extracting

export function ExtractingScreen(p: {
  unitNo: number;
  photoUrl: string;
  progress: ReadProgress;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const steps: [keyof ReadProgress, string][] = [
    ['brand', 'BRAND'],
    ['model', 'MODEL'],
    ['serial', 'SERIAL'],
  ];
  const active = steps.find(([k]) => !p.progress[k])?.[0];
  return (
    <div className="screen dark">
      <div className="dark-top">
        <button className="btn-text light" onClick={p.onCancel}>
          ✕ Cancel
        </button>
        <div className="mono unit-plain">UNIT #{p.unitNo}</div>
      </div>
      <div className="extract-body">
        <div className="plate-card">
          <img src={p.photoUrl} alt="Nameplate photo being read" />
          <span className="scanline" />
          <Brackets size="sm" />
        </div>
        <div className="extract-copy">
          <div className="reading" aria-live="polite">
            Reading nameplate…
          </div>
          <div className="stepdots">
            {steps.map(([k, label]) => (
              <span key={k} className={'sd' + (p.progress[k] ? ' done' : k === active ? ' active' : '')}>
                <i />
                {label}
              </span>
            ))}
          </div>
          <div className="bar">
            <span />
          </div>
          <div className="model-tag mono">Vision AI</div>
          <button className="btn-text light skip" onClick={p.onSkip}>
            Type it in instead
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================== confirm / edit

function Field(p: { label: string; htmlFor?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={'field ' + (p.className || '')}>
      <div className="field-head">
        {p.htmlFor ? (
          <label className="label" htmlFor={p.htmlFor}>
            ▌ {p.label}
          </label>
        ) : (
          <span className="label">▌ {p.label}</span>
        )}
        {p.right}
      </div>
      {p.children}
    </div>
  );
}

export function ConfirmScreen(p: {
  draft: Draft;
  unitNo: number;
  wide: boolean;
  saving: null | 'saving' | 'uploading';
  saveError: string | null;
  dupSerialOf: number | null;
  canReread: boolean;
  rereading: boolean;
  loggedBy: string;
  onChange: (patch: Partial<Draft>) => void;
  onCancel: () => void;
  onRetake: () => void;
  onAttach: () => void;
  onReread: () => void;
  onStopRead: () => void;
  onOpenType: () => void;
  onPhoto: (url: string, caption: string) => void;
  onSave: (next: boolean) => void;
  onDelete: () => void;
}) {
  const d = p.draft;
  const edit = d.mode === 'edit';
  const low = new Set(d.read.low || []);
  const readOk = d.read.state === 'ok';
  const unlow = (f: string) => (low.has(f) ? { read: { ...d.read, low: (d.read.low || []).filter((x) => x !== f) } } : {});
  const hasContent = !!(d.brand.trim() || d.model.trim() || d.serial.trim() || d.type);
  const noValid = !edit || clampInt(d.no, 0) != null;
  const canSave = hasContent && noValid && !p.saving;
  const nRead = [d.brand, d.model, d.serial].filter((x) => x.trim()).length;

  let label = 'No photo';
  let detail = 'Manual entry. Fill in the fields below.';
  if (edit) {
    label = `Editing unit #${d.origNo}`;
    detail = d.createdAt ? `Logged ${fmtDay(d.createdAt)}, ${fmtTime(d.createdAt)}${p.loggedBy ? ` by ${p.loggedBy}` : ''}.` : '';
  } else if (d.read.state === 'ok') {
    label = '✓ Extracted from nameplate';
    detail = low.size
      ? `AI read ${nRead} of 3 fields. Check the flagged ${low.size === 1 ? 'field' : 'fields'} against the photo.`
      : `AI read ${nRead} of 3 fields. Confirm or edit.`;
  } else if (d.read.state === 'notplate' || d.read.state === 'error') {
    label = d.read.state === 'notplate' ? '✕ No plate in photo' : 'Couldn’t read the plate';
    detail = d.read.message || '';
  } else if (d.read.state === 'skipped' || d.read.state === 'unavailable') {
    label = 'Photo attached';
    detail = d.read.message || 'Type the values from the photo.';
  } else if (d.source === 'noplate') {
    label = '✕ No nameplate present';
    detail = 'Brand, model, serial set to “No Nameplate”. Pick the type below.';
  } else if (d.photoUrl) {
    label = 'Photo attached';
    detail = 'Manual entry. Fill in the fields below.';
  }

  const photoTag =
    d.photoState === 'uploading' ? 'Uploading' : d.photoState === 'failed' ? 'Not saved' : d.photoState === 'unstored' ? 'Not kept' : '';

  return (
    <div className="screen">
      <div className="cf-head">
        <button className="btn-text" onClick={p.onCancel}>
          ✕ Cancel
        </button>
        <div className="mono unit-plain dark-ink">{edit ? `EDIT #${d.origNo}` : `UNIT #${p.unitNo}`}</div>
        <div className="spacer60" />
      </div>
      <div className="scroll">
        <div className="form">
          <div className="cf-photo-row">
            {d.photoUrl ? (
              <button
                className="cf-thumb"
                onClick={() => p.onPhoto(d.photoUrl!, edit ? `Unit #${d.origNo}` : `Unit #${p.unitNo}`)}
                aria-label="Open photo"
              >
                <img src={d.photoUrl} alt="" />
                {photoTag && <span className={'ptag' + (d.photoState === 'failed' ? ' bad' : '')}>{photoTag}</span>}
              </button>
            ) : (
              <div className="cf-nophoto mono">
                NO
                <br />
                PHOTO
              </div>
            )}
            <div className="cf-ext">
              <div>
                <div className="eyebrow">{label}</div>
                <div className="cf-detail">{detail}</div>
              </div>
              <div className="cf-btns">
                {d.source === 'photo' && (
                  <button className="btn-mini" onClick={p.onRetake}>
                    Retake
                  </button>
                )}
                {p.canReread &&
                  (p.rereading ? (
                    <button className="btn-mini strong" onClick={p.onStopRead}>
                      Reading… stop
                    </button>
                  ) : (
                    <button className="btn-mini" onClick={p.onReread} title="Slower, more careful read">
                      Re-read carefully
                    </button>
                  ))}
                {d.source !== 'photo' && (
                  <button className="btn-mini" onClick={p.onAttach}>
                    {d.photoUrl ? 'Replace photo' : 'Add photo'}
                  </button>
                )}
              </div>
            </div>
          </div>
          {!edit && d.shownNo != null && p.unitNo !== d.shownNo && (
            <div className="inline-note" role="alert">
              The count moved on another device. This unit will save as #{p.unitNo}, not #{d.shownNo}. Label it #{p.unitNo}.
            </div>
          )}
          {d.photoNote && <div className="inline-note">{d.photoNote}</div>}

          {edit && (
            <Field label="Unit number" htmlFor="f-no" right={<span className="hint">relabels this unit</span>}>
              <input
                id="f-no"
                className="input mono num-wide"
                type="text"
                inputMode="numeric"
                value={d.no}
                onChange={(e) => p.onChange({ no: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </Field>
          )}

          <Field
            label="Brand"
            htmlFor="f-brand"
            right={
              readOk && d.brand ? (
                low.has('brand') ? <span className="hint warn">check · hard to read</span> : <span className="hint ok">✓ Read</span>
              ) : null
            }
          >
            <input
              id="f-brand"
              className={'input' + (low.has('brand') ? ' lowconf' : '')}
              type="text"
              value={d.brand}
              autoComplete="off"
              placeholder="Brand from nameplate"
              onChange={(e) => p.onChange({ brand: e.target.value, ...unlow('brand') })}
            />
          </Field>

          <Field
            label="Model"
            htmlFor="f-model"
            right={low.has('model') ? <span className="hint warn">check · hard to read</span> : <span className="hint">text · preserves zeros</span>}
          >
            <input
              id="f-model"
              className={'input mono' + (low.has('model') ? ' lowconf' : '')}
              type="text"
              value={d.model}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Model number"
              onChange={(e) => p.onChange({ model: e.target.value, ...unlow('model') })}
            />
          </Field>

          <Field
            label="Serial"
            htmlFor="f-serial"
            right={
              <span className="mini-actions">
                <button className="btn-mini" onClick={() => p.onChange({ serial: 'No Serial', ...unlow('serial') })}>
                  No serial
                </button>
                <button className="btn-mini" onClick={() => p.onChange({ serial: 'Unreadable', ...unlow('serial') })}>
                  Unreadable
                </button>
              </span>
            }
          >
            <input
              id="f-serial"
              className={'input mono' + (low.has('serial') ? ' lowconf' : '')}
              type="text"
              value={d.serial}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Serial number"
              onChange={(e) => p.onChange({ serial: e.target.value, ...unlow('serial') })}
            />
            {low.has('serial') && <div className="field-note warn">Check the serial against the photo; part of it was hard to read.</div>}
            {p.dupSerialOf != null && <div className="field-note warn">Same serial as unit #{p.dupSerialOf} in this batch.</div>}
          </Field>

          <Field
            label="Color"
            right={
              d.colorHint && d.color !== d.colorHint.color ? (
                <button className="hint link" onClick={() => p.onChange({ color: d.colorHint!.color })}>
                  suggested: {d.colorHint.color}
                  {d.colorHint.reason ? ` · ${d.colorHint.reason}` : ''}
                </button>
              ) : (
                <span className="hint">user-supplied</span>
              )
            }
          >
            <div className="chips colors" role="radiogroup" aria-label="Color">
              {COLORS.map((c) => {
                const on = d.color === c.name;
                const suggested = !on && d.colorHint?.color === c.name;
                return (
                  <button
                    key={c.name}
                    role="radio"
                    aria-checked={on}
                    className={'chip-btn color' + (on ? ' on' : '') + (suggested ? ' suggested' : '')}
                    onClick={() => p.onChange({ color: on ? '' : c.name })}
                  >
                    <span className="sw lg" style={{ background: c.swatch, borderColor: c.bd }} aria-hidden="true" />
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="Appliance Type"
            right={
              d.type && d.typeFromAI && d.typeReason ? <span className="hint ok">✓ from model · {d.typeReason}</span> : null
            }
          >
            <button className="input select" onClick={p.onOpenType}>
              {d.type ? <span>{d.type}</span> : <span className="placeholder">Choose appliance type…</span>}
              <span className="mono">▾</span>
            </button>
          </Field>

          <Field label="Notes" right={<span className="hint">optional · defects only</span>}>
            <div className="chips notes">
              {NOTE_CHIPS.map((n) => {
                const on = d.notes.includes(n);
                return (
                  <button
                    key={n}
                    className={'chip-btn note' + (on ? ' on' : '')}
                    aria-pressed={on}
                    onClick={() => p.onChange({ notes: on ? d.notes.filter((x) => x !== n) : [...d.notes, n] })}
                  >
                    <span className="mono">{on ? '✓' : '+'}</span> {n}
                  </button>
                );
              })}
            </div>
            <textarea
              id="f-notes"
              className="input area"
              rows={2}
              value={d.freeNotes}
              placeholder="Other condition notes…"
              aria-label="Other condition notes"
              onChange={(e) => p.onChange({ freeNotes: e.target.value })}
            />
          </Field>
          <div className="form-end" />
        </div>
      </div>
      <div className="savebar">
        {p.saveError && (
          <div className="save-error" role="alert">
            {p.saveError}
          </div>
        )}
        {!hasContent && !p.saveError && <div className="save-hint">Add a brand, model, serial or type to save.</div>}
        <div className="savebtns">
          {edit ? (
            <>
              <button className="btn-outline danger" onClick={p.onDelete} disabled={!!p.saving}>
                Delete
              </button>
              <button className="btn-primary" onClick={() => p.onSave(false)} disabled={!canSave}>
                {p.saving === 'uploading' ? 'Uploading photo…' : p.saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-outline" onClick={() => p.onSave(false)} disabled={!canSave}>
                Save
                <br />& close
              </button>
              <button className="btn-primary" onClick={() => p.onSave(true)} disabled={!canSave}>
                <span>{p.saving === 'uploading' ? 'Uploading photo…' : p.saving ? 'Saving…' : 'Save & capture next'}</span>
                {!p.saving && <span className="mono arrow">→</span>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================== sheets

function SheetFrame(p: { onClose: () => void; children: React.ReactNode; labelledBy: string; tall?: boolean; accent?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]);
  return (
    <div className="overlay" onClick={p.onClose}>
      <div
        className={'sheet' + (p.tall ? ' tall' : '') + (p.accent ? ' accent' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={p.labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {p.children}
      </div>
    </div>
  );
}

function MenuItem(p: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; danger?: boolean; iconClass?: string }) {
  return (
    <button className={'menu-item' + (p.danger ? ' danger' : '')} onClick={p.onClick}>
      <span className={'mi-icon ' + (p.iconClass || '')}>{p.icon}</span>
      <span>
        <span className="mi-title">{p.title}</span>
        <span className="mi-sub">{p.sub}</span>
      </span>
    </button>
  );
}

function EditBatchSheet(p: { batch: Batch; onClose: () => void; onSave: (name: string, next: number) => void }) {
  const [name, setName] = useState(p.batch.name);
  const [next, setNext] = useState(String(p.batch.nextNumber));
  const [saving, setSaving] = useState(false);
  const n = clampInt(next, 0);
  const id = useId();
  return (
    <SheetFrame onClose={p.onClose} labelledBy={id}>
      <div className="sheet-head">
        <div className="eyebrow">Edit batch</div>
        <div className="sheet-title" id={id}>
          Name and counter
        </div>
      </div>
      <div className="sheet-body">
        <label className="label" htmlFor="eb-name">
          ▌ Batch name
        </label>
        <input id="eb-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <label className="label gap" htmlFor="eb-next">
          ▌ Next unit number
        </label>
        <input
          id="eb-next"
          className="input mono num-wide"
          inputMode="numeric"
          value={next}
          onChange={(e) => setNext(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <div className="field-note">The next capture on every device gets this number.</div>
      </div>
      <div className="sheet-btns">
        <button className="btn-outline" onClick={p.onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={n == null || !name.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await p.onSave(name, n!);
            setSaving(false);
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </SheetFrame>
  );
}

export function Sheets(p: {
  sheet: Sheet | null;
  batch: Batch | null;
  records: Rec[];
  stats: { count: number; noPlate: number; withNotes: number };
  writable: boolean;
  isAdmin: boolean;
  batchOpen: boolean;
  draft: Draft | null;
  busy: boolean;
  onClose: () => void;
  onPickType: (t: string) => void;
  onExportMenu: () => void;
  onExport: (ext: 'xlsx' | 'csv' | 'docx') => void;
  onEditBatch: () => void;
  onSaveBatch: (name: string, next: number) => Promise<void> | void;
  onAllBatches: () => void;
  onNewBatch: () => void;
  onCloseBatch: () => void;
  onReopenBatch: () => void;
  onDeleteBatch: () => void;
}) {
  const s = p.sheet;
  const titleId = useId();
  if (!s) return null;
  const b = p.batch;

  if (s.kind === 'photo')
    return (
      <div className="photo-view" onClick={p.onClose} role="dialog" aria-modal="true" aria-label={s.caption}>
        <img src={s.url} alt={s.caption} />
        <div className="pv-bar">
          <span className="mono">{s.caption}</span>
          <button className="btn-text light" onClick={p.onClose}>
            ✕ Close
          </button>
        </div>
      </div>
    );

  if (s.kind === 'progress')
    return (
      <div className="overlay">
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="sheet-head">
            <div className="eyebrow">Working</div>
            <div className="sheet-title" id={titleId}>
              {s.title}
            </div>
          </div>
          <div className="sheet-body">
            <div className="pbar">
              <span style={{ width: `${Math.round((100 * s.done) / Math.max(1, s.total))}%` }} />
            </div>
            <div className="field-note mono">
              {s.done} of {s.total} steps · keep this page open
            </div>
          </div>
        </div>
      </div>
    );

  if (s.kind === 'confirm')
    return (
      <SheetFrame onClose={p.onClose} labelledBy={titleId} accent>
        <div className="confirm-body">
          <div className="sheet-title" id={titleId}>
            {s.title}
          </div>
          <p className="confirm-text">{s.body}</p>
          <div className="sheet-btns flush">
            <button className="btn-outline" onClick={p.onClose}>
              Cancel
            </button>
            <button className={'btn-primary' + (s.danger ? ' danger' : '')} onClick={s.run} disabled={p.busy}>
              {s.action}
            </button>
          </div>
        </div>
      </SheetFrame>
    );

  if (s.kind === 'type')
    return (
      <SheetFrame onClose={p.onClose} labelledBy={titleId} tall>
        <div className="sheet-head row">
          <div>
            <div className="eyebrow">Appliance Type</div>
            <div className="sheet-title" id={titleId}>
              Choose category
            </div>
          </div>
          <button className="btn-text" onClick={p.onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-scroll">
          {APPLIANCE_TYPES.map((g) => (
            <div key={g.group}>
              <div className="type-group">{g.group}</div>
              {g.items.map((t) => {
                const sel = p.draft?.type === t;
                return (
                  <button key={t} className={'type-item' + (sel ? ' sel' : '')} onClick={() => p.onPickType(t)}>
                    <span>{t}</span>
                    {sel && <span className="sel-tag">✓ Selected</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="form-end" />
        </div>
      </SheetFrame>
    );

  if (!b) return null;

  if (s.kind === 'editBatch') return <EditBatchSheet batch={b} onClose={p.onClose} onSave={p.onSaveBatch} />;

  if (s.kind === 'export') {
    const base = exportBaseName(b.name, p.records);
    const opts: { ext: 'xlsx' | 'csv' | 'docx'; title: string; sub: string }[] = [
      { ext: 'xlsx', title: 'Excel workbook (.xlsx)', sub: 'Primary · text-format model/serial, summary sheet' },
      { ext: 'csv', title: 'CSV (.csv)', sub: 'Flat export, same columns' },
      { ext: 'docx', title: 'Word document (.docx)', sub: 'Landscape table, formatted report' },
    ];
    return (
      <SheetFrame onClose={p.onClose} labelledBy={titleId}>
        <div className="sheet-head ink">
          <div className="eyebrow">Export</div>
          <div className="sheet-title mono-ish" id={titleId}>
            {base}
          </div>
          <div className="sheet-sub">{p.records.length} records · model &amp; serial stored as text</div>
        </div>
        {opts.map((o) => (
          <button key={o.ext} className="menu-item" onClick={() => p.onExport(o.ext)} disabled={!p.records.length}>
            <span className="file-ico">
              <span className="dog" />
              <span className="mono">{o.ext}</span>
            </span>
            <span className="grow">
              <span className="mi-title">{o.title}</span>
              <span className="mi-sub">{o.sub}</span>
            </span>
            <span className="mono dl">↓</span>
          </button>
        ))}
        <div className="form-end" />
      </SheetFrame>
    );
  }

  // menu
  const st = p.stats;
  return (
    <SheetFrame onClose={p.onClose} labelledBy={titleId}>
      <div className="sheet-head">
        <div className="eyebrow" id={titleId}>
          {b.name}
        </div>
        <div className="menu-stats">
          <div>
            <b className="mono">{st.count}</b>
            <span>Records</span>
          </div>
          <div>
            <b className="mono">{st.noPlate}</b>
            <span>No plate</span>
          </div>
          <div>
            <b className="mono">{st.withNotes}</b>
            <span>w/ notes</span>
          </div>
        </div>
      </div>
      <MenuItem icon=".xlsx" iconClass="solid mono small" title="Export inventory" sub="XLSX · CSV · DOCX" onClick={p.onExportMenu} />
      {p.writable && p.batchOpen && (
        <MenuItem
          icon="#"
          iconClass="mono"
          title="Edit batch · counter"
          sub={`Currently: ${b.name} · next #${b.nextNumber}`}
          onClick={p.onEditBatch}
        />
      )}
      <MenuItem icon="≡" iconClass="mono" title="All batches" sub="Switch batches or look up past ones" onClick={p.onAllBatches} />
      {p.writable && (
        <MenuItem icon="+" iconClass="mono" title="Start new batch" sub="This batch stays saved" onClick={p.onNewBatch} />
      )}
      {p.writable &&
        (p.batchOpen ? (
          <MenuItem icon="✓" iconClass="mono" title="Close batch" sub="Locks editing, frees storage. Reopen anytime." onClick={p.onCloseBatch} />
        ) : (
          <MenuItem icon="↺" iconClass="mono" title="Reopen batch" sub="Unlock to add or edit units" onClick={p.onReopenBatch} />
        ))}
      {p.writable && p.isAdmin && (
        <MenuItem
          icon="✕"
          iconClass="mono danger"
          danger
          title="Delete batch"
          sub={`Removes ${st.count} record${st.count === 1 ? '' : 's'} and photos everywhere`}
          onClick={p.onDeleteBatch}
        />
      )}
      <div className="form-end" />
    </SheetFrame>
  );
}

// ================================================================== toasts

export function Toasts(p: { toast: Toast | null; notice: string | null; onDismiss: () => void }) {
  return (
    <>
      {p.toast && (
        <div className="toast-wrap" aria-live="polite">
          <div className="toast">
            {p.toast.kind === 'saved' && <div className="tick">✓</div>}
            <div className="toast-title">{p.toast.title}</div>
            <div className="toast-detail mono">{p.toast.detail}</div>
            {p.toast.sub && <div className="toast-sub">{p.toast.sub}</div>}
          </div>
        </div>
      )}
      {p.notice && (
        <div className="notice" role="status">
          <span>{p.notice}</span>
          <button className="btn-text light" onClick={p.onDismiss} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

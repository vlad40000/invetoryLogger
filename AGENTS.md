# AGENTS.md — Appliance Inventory Logger

Handoff for any IDE agent (Antigravity/Gemini, Claude, Cursor, …). Read this whole file before changing code.

## What it is

A phone-first field-capture app for appliance intake batches (e.g. a whole apartment complex):

1. Photograph an appliance nameplate.
2. Gemini (standalone) or the native Artifact vision runtime reads brand, model, serial; infers appliance type from the model prefix and color from a model suffix when obvious.
3. The crew confirms or corrects the values, then picks color, type, and defect notes.
4. Save. The unit number advances. Every device sees the batch live.
5. Export the batch as XLSX (text-format model/serial and a summary sheet), CSV, or DOCX (landscape report).

It is built from two design sources in `design/reference/`, which are specs and are not built:

- `Appliance_Inventory.dc.html`: the Claude Design version and the richer spec (type picker, note chips, save & next, export sheet).
- `figma-make-App.tsx`: the Figma Make "Build this" export.

The UI keeps that visual language: paper `#F4F2ED`, ink `#0F0F0E`, signal `#E8472C`, IBM Plex Sans and Mono, square corners.

## Status

Verified in headless Chromium against a mock runtime (`npm test`):

- Create a batch, then capture, read, confirm, and save & next.
- No-nameplate and manual entry.
- Edit and delete a unit.
- Close a batch (compaction), then reopen it.
- XLSX export.
- A two-device unit-number race.

The generated XLSX/DOCX/CSV files were validated with openpyxl and python-docx, and they render in LibreOffice.

**Not verified yet:**

- The handoff to a real phone's camera. It uses `<input type="file" capture="environment">`.
- Gemini's read of real nameplates in standalone mode. The prompt is in `src/extract.ts`.
- Any real backend, because none exists yet. See the next section.

## ⚠ Runtime dependency — read first

The page never calls a server directly. It reaches storage, photos, vision sampling, downloads, and identity only through `window.claude.use(name)`. That is the claude.ai Artifact runtime contract; the types are in `src/cap-types/` (contract 0.2.58).

- **Inside a claude.ai artifact:** it works with no backend.
- **Anywhere else:** `window.claude` is undefined. The page shows "Storage isn't available in this view" and saves nothing.

To run it standalone, pick one of the two options under **Standalone deployment**.

### The complete runtime surface the app uses

This is the full list. A shim only needs these.

| Capability | Calls made by the app | Notes |
|---|---|---|
| `db` | `doc(path).get()` / `.set(obj)` / `.update(obj)` / `.delete()` / `.acquire({holder, ttlMs})` / `.onSnapshot(next, err)`; `collection(path).doc(id?)` / `.get()` / `.orderBy(field, 'asc'\|'desc')` / `.limit(n)` / `.onSnapshot(next, err)` | Snapshot: `{docs:[{id, exists, data(), metadata:{fromCache, hasPendingWrites}}], metadata}`. `update` on a missing doc must reject `{code:'invalid_argument'}`. Transient failure → `{code:'unavailable'}`. |
| `assets` | `upload(blob, {type})` → `{id, url, sizeBytes, contentType}`; `list()` → `{usage:{files, bytes, maxFiles, maxBytes}}`; `delete(id)` | Stored photos render from **`/_blob/<id>`**, which the host must serve. |
| `sample` | `sample.json(prompt, {images: Blob, modelTier: 'quick'\|'default', signal, onText})` → parsed JSON; `sample.limits()` → `{images?: {...}}` | `quick` is used for the first read and `default` for "Re-read carefully". Abort must reject `{code:'cancelled'}`. |
| `downloads` | `save({filename, data: Blob})` → `{status:'saved'}` | Reject `{code:'declined'}` if the user cancels. |
| `user` | `id()`, `can('data.write')`, `canEdit()`, `isOwner()`, `profiles(ids)` → `{[id]: {name}}` | Only ids are stored. Names are resolved at render time. |

`test/mock-claude.js` implements exactly this surface in memory. It is the best executable reference for a shim.

## Commands

```bash
npm install                 # Node ≥ 20
npm run build               # → dist/appliance-inventory.html (single self-contained page)
npm run preview             # http://localhost:5173 with the MOCK runtime (data resets on reload)
npm test                    # typecheck + export files + e2e walk + two-device race (Playwright/Chromium)
npx playwright install chromium   # once, if Playwright has no browser yet
```

`npm run preview` also prints a LAN address so you can open it on a phone. With the mock, each device keeps its own data; real sync needs a backend.

## File map

```
src/app.tsx        App state, capability init, live subscriptions, every handler (capture→read→save, edit, delete, batch ops, export)
src/views.tsx      All screens and sheets (presentational): Setup, Batches, List/Table, Camera launcher, Extracting, Confirm/Edit, Menu, Export, Type picker, toasts
src/store.ts       Every db write: lease, unit numbering, record CRUD, close→compact, reopen, delete batch
src/extract.ts     Vision prompt, response normalization, error copy
src/image.ts       Photo decode + EXIF orientation + downscale (1800 px long edge, JPEG q0.82)
src/export/        Dependency-free ZIP writer + XLSX / DOCX / CSV builders (common.ts = shared columns)
src/constants.ts   Appliance types (grouped), colors, note chips, caps
src/types.ts       Stored shapes: BatchDoc, RecordDoc
src/ui-types.ts    Draft / Sheet / Toast
src/util.ts        ids, localStorage wrapper, formatting, error copy
src/styles.css     Design tokens + all styles (single light theme by design)
src/cap-types/     claude.ai runtime type definitions
build.mjs          esbuild → one HTML file; React 18.3.1 UMD loaded from cdnjs, everything else inline
scripts/preview.mjs  Local server + mock runtime (also used by the e2e tests)
test/              mock-claude.js, walk.mjs (e2e), multidevice.mjs, export-test.ts, plate.jpg
design/reference/  Original Claude Design + Figma Make sources (spec only)
```

## Data model (artifact `db`)

```
batches/{batchId}                      BatchDoc  {name, startNumber, nextNumber, status:'open'|'closed', archived,
                                                  count, firstUnit, lastUnit, createdAt, updatedAt, createdBy}
batches/{batchId}/records/{recordId}   RecordDoc {no, type, typeReason, brand, model, serial, color, notes[], freeNotes,
                                                  source:'photo'|'manual'|'noplate', photo (asset id|null),
                                                  createdAt, updatedAt, by (user id|null), renumberedFrom (number|null)}
batches/{batchId}/archive/a000…        {i, records: Rec[]}   ← closed batches only
```

Timestamps are epoch milliseconds.

### Invariants (do not break)

- **Model and serial are always strings.** Leading zeros and dotted numbers such as `110.27102310` must survive. The XLSX writer stores them as inline-string cells with number format `@`.
- **Unit numbering is atomic per batch.** `store.commitNewRecord` takes a short lease on the batch doc, reads `nextNumber`, writes the record, and bumps `nextNumber`. If another device took the number shown on screen:
  - the confirm screen warns live;
  - the record saves under the next free number, with `renumberedFrom` set;
  - a notice tells the crew to relabel.
- **Close means lock plus compact.** Closing packs records into chunks of 150 or fewer, because the artifact db caps at 5,000 documents per artifact. Reopen expands them back. Readers pick `records` or `archive` from `batch.archived`.
- **Photos are stored by asset id only.** The display URL is always `/_blob/<id>`. Delete the asset when its record is deleted, its photo is replaced, or its draft is cancelled.
- **No names are stored.** `by` holds an opaque user id; names come from `user.profiles()` at render time.
- **localStorage holds per-device conveniences only** (always wrapped in try/catch):
  - `fc.lastBatch`: reopens the last batch;
  - `fc.draft`: an unsent draft, offered as "Resume".

## Standalone deployment (Vercel + Neon Postgres + Vercel Blob + Gemini API)

### Option A (recommended first): a runtime shim, with no UI changes

Add a script that defines `window.claude = { use(name) }` over your own API, and load it before the app bundle. In `build.mjs`, emit `<script src="/runtime-shim.js"></script>` before the React tags. `test/mock-claude.js` shows the shape; swap its in-memory parts for `fetch` calls.

**Endpoints.** All endpoints take and return JSON unless noted, and all require a session cookie.

```
POST   /api/session            {passcode}          → sets HttpOnly cookie (HMAC-signed); GET /api/me → {id, name, isOwner, canEdit}
GET    /api/db/doc?path=P                          → {exists, data|null}
PUT    /api/db/doc             {path, data}        → 204   replace (create if missing)
PATCH  /api/db/doc             {path, data}        → 204 | 404 → shim rejects {code:'invalid_argument'}
                                                     merge: nested objects merge recursively; arrays/scalars replace
DELETE /api/db/doc?path=P                          → 204   idempotent
GET    /api/db/query?collection=C[&orderBy=F&dir=asc|desc][&limit=N] → {docs:[{id, data}]}   (default order: id asc)
POST   /api/db/acquire         {path, holder, ttlMs} → {acquired, expiresAt}   (ttl clamped 1000–600000 ms)
POST   /api/assets             raw body, Content-Type image/jpeg|png|webp|gif, ≤ 20 MB → {id, url, sizeBytes, contentType}
GET    /api/assets                                 → {usage:{files, bytes, maxFiles, maxBytes}}
DELETE /api/assets/:id                             → {deleted}
GET    /_blob/:id              → 302 to the Vercel Blob URL (vercel.json rewrite → /api/assets/:id)
POST   /api/sample             multipart: prompt, tier (quick|default), image → {text}
```

**How the shim behaves:**

- **`onSnapshot`:** poll the doc or query every 3 s while the tab is visible, and immediately after any local write. Call `next` only when the serialized result changed, with `metadata: {fromCache:false, hasPendingWrites:false}`.
- **Error mapping:**
  - network or 5xx → `{code:'unavailable'}` (the app retries once)
  - 404 on PATCH → `invalid_argument`
  - 413 → `too_large`
  - 429 → `rate_limited`
- **`sample.json`:** POST to `/api/sample`, call `onText({text, delta:text})` once, then parse tolerantly (whole text, then a fenced block, then the first `{…}`). Abort the fetch through `signal` and reject `{code:'cancelled'}`. `limits()` → `{maxPromptBytes:65536, images:{maxCount:1, maxInputBytes:20e6, mediaTypes:['image/jpeg','image/png','image/webp','image/gif']}}`.
- **`downloads.save`:** create an object URL, click a temporary `<a download>`, and resolve `{status:'saved'}`. Outside the artifact sandbox this works normally.
- **`user`:** get the id from `/api/me`. `can('data.write')` is `true` for signed-in users. `profiles(ids)` maps known ids to names.

**Server-side sample call.** Use the Google Gen AI SDK:

- SDK: `@google/genai`
- API key: `GEMINI_API_KEY`
- model: `gemini-3.8-flash` for both `quick` and `default` initially; override with `GEMINI_QUICK_MODEL` / `GEMINI_DEFAULT_MODEL` if needed
- `maxOutputTokens: 1024`, `responseMimeType: 'application/json'`
- contents: inline base64 image part plus the existing client prompt
- return `{text}`

Keep the prompt in the client (`src/extract.ts`) so both runtimes share it.

**Neon schema:**

```sql
create table docs (
  path       text primary key,            -- e.g. batches/abc/records/xyz
  parent     text not null,               -- collection path, e.g. batches/abc/records
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index docs_parent_idx on docs (parent);

create table leases (
  path       text primary key,
  holder     text not null,
  expires_at timestamptz not null
);

create table assets (
  id           text primary key,
  url          text not null,
  pathname     text not null,
  content_type text not null,
  size_bytes   integer not null,
  created_at   timestamptz not null default now()
);
```

```sql
-- acquire: returns a row only when granted (free, expired, or same holder)
insert into leases (path, holder, expires_at)
values ($1, $2, now() + ($3 || ' milliseconds')::interval)
on conflict (path) do update set holder = excluded.holder, expires_at = excluded.expires_at
  where leases.expires_at < now() or leases.holder = excluded.holder
returning expires_at;
-- no row → busy: select expires_at from leases where path = $1

-- query (jsonb orders numbers numerically)
select path, data from docs where parent = $1 order by data -> $2 desc nulls last, path limit $3;
```

**Environment variables:** `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`, `APP_PASSCODE`, `OWNER_PASSCODE`, `SESSION_SECRET`.

Postgres has no 5,000-document cap. Compaction on close stays harmless and can be removed later.

### Option B (long term): native relational tables

Replace these `src/store.ts` functions 1:1 with REST calls: `createBatch`, `commitNewRecord`, `updateRecord`, `deleteRecord`, `updateBatchMeta`, `closeBatch`, `reopenBatch`, `deleteBatch`. Then replace the two `onSnapshot` subscriptions in `app.tsx` (batches and records) with polling hooks.

```sql
create table batches (
  id uuid primary key default gen_random_uuid(), name text not null,
  start_number int not null, next_number int not null, status text not null default 'open',
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table inventory_units (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  unit_no int not null, type text, type_reason text, brand text, model text, serial text,
  color text, notes text[] default '{}', free_notes text, source text not null,
  photo_url text, created_by text, renumbered_from int,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (batch_id, unit_no)
);
-- numbering, in the same transaction as the insert:
update batches set next_number = next_number + 1, updated_at = now()
 where id = $1 and status = 'open' returning next_number - 1 as unit_no;
```

Choose Option B when inventory needs to join other Postgres data, such as parts or BOM tables keyed by model number.

## Conventions

- TypeScript strict. Run `npm run typecheck` before building.
- Exporters stay dependency-free. `src/export/zip.ts` writes STORE-method zips, and Excel, Word and LibreOffice all accept them.
- Styling goes through the tokens at the top of `src/styles.css`. The theme is a single, deliberate light theme for daylight field use.
- Inputs use a 16 px font so iOS does not zoom on focus.
- Do not rename stored fields without migrating existing data.

## Known gaps and next steps

1. Standalone backend (Option A above).
2. Offline capture: saves need a connection today. A photo and draft outbox in IndexedDB would cover dead zones.
3. Bulk import: shoot plates with the phone's own camera and upload many at once later.
4. The "Delete batch" restriction to admins is UI-only. Enforce it server-side in Option A/B.
5. Tune the vision prompt on real plates (`src/extract.ts`).

# Appliance Inventory Logger

This is a phone-first field-capture app. You photograph an appliance nameplate, Claude reads the brand, model and serial, and you confirm the values and save. The unit counter advances automatically. Batches stay retrievable across devices, and you can export any batch as XLSX, CSV or DOCX.

```bash
npm install
npm run build      # → dist/appliance-inventory.html
npm run preview    # http://localhost:5173 (mock runtime, data resets on reload)
npm test           # typecheck, export files, end-to-end + two-device tests
```

The built page gets its storage, photo storage and Claude reading from the claude.ai Artifact runtime (`window.claude.use`). Outside Claude it needs a small backend (a Postgres/Neon database, Vercel Blob for photos, and the Anthropic API). **AGENTS.md** has the full handoff: architecture, data model, invariants, and the exact shim, endpoint and SQL spec for deploying it standalone.

## Standalone runtime shim

This snapshot now includes the first standalone-deployment step from `AGENTS.md` Option A:

- `src/runtime-shim.js` implements the exact `window.claude.use(...)` surface used by the app over `/api/...` endpoints.
- `build.mjs` emits `dist/runtime-shim.js` and a deployable `dist/index.html`, and loads the shim before React.
- The shim is inert when a real Claude Artifact runtime or the local mock runtime already exists.
- `npm run test:shim` verifies capability wiring and that an existing runtime is never replaced.

The server endpoints themselves are **not** included yet. Until `/api/me`, `/api/db/*`, `/api/assets*`, and `/api/sample` exist, a standalone deployment will load the UI but cannot persist, sync, upload, or read nameplates. The original claude.ai Artifact and local mock-preview behavior remains unchanged.

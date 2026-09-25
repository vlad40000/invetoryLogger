// GET    /api/db/doc?path=P            → { exists, data|null }
// PUT    /api/db/doc  { path, data }   → 204  (replace / create)
// PATCH  /api/db/doc  { path, data }   → 204  (merge) | 404 → { code:'invalid_argument' }
// DELETE /api/db/doc?path=P            → 204  (idempotent)
import { sql } from '../_lib/db.js';
import { requireSession } from '../_lib/session.js';

function deepMerge(target, patch) {
  if (typeof target !== 'object' || target === null) return patch;
  if (typeof patch !== 'object' || patch === null) return patch;
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = deepMerge(target[k], v);
  }
  return out;
}

function parentPath(path) {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      const path = req.query.path;
      if (!path) return res.status(400).json({ error: 'path is required', code: 'invalid_argument' });

      const rows = await sql`SELECT data FROM docs WHERE path = ${path}`;
      if (rows.length === 0) return res.status(200).json({ exists: false, data: null });
      return res.status(200).json({ exists: true, data: rows[0].data });
    }

    if (req.method === 'PUT') {
      const { path, data } = req.body;
      if (!path || data === undefined) return res.status(400).json({ error: 'path and data are required', code: 'invalid_argument' });

      const parent = parentPath(path);
      await sql`
        INSERT INTO docs (path, parent, data, updated_at)
        VALUES (${path}, ${parent}, ${JSON.stringify(data)}, now())
        ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
      return res.status(204).end();
    }

    if (req.method === 'PATCH') {
      const { path, data } = req.body;
      if (!path || data === undefined) return res.status(400).json({ error: 'path and data are required', code: 'invalid_argument' });

      const existing = await sql`SELECT data FROM docs WHERE path = ${path}`;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Document does not exist', code: 'invalid_argument' });
      }

      const merged = deepMerge(existing[0].data, data);
      await sql`UPDATE docs SET data = ${JSON.stringify(merged)}, updated_at = now() WHERE path = ${path}`;
      return res.status(204).end();
    }

    if (req.method === 'DELETE') {
      const path = req.query.path;
      if (!path) return res.status(400).json({ error: 'path is required', code: 'invalid_argument' });

      await sql`DELETE FROM docs WHERE path = ${path}`;
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[db/doc]', err);
    return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
  }
}

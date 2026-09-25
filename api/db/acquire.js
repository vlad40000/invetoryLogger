// POST /api/db/acquire  { path, holder, ttlMs }
// → { acquired: true, expiresAt: <ISO> }   — when the lease is granted
// → { acquired: false, expiresAt: <ISO> }  — when the lease is held by another holder
//
// Implements: insert-on-conflict with guard that the existing lease is either
// expired or owned by the same holder. If no row is returned, the lock is busy.
import { sql } from '../_lib/db.js';
import { requireSession } from '../_lib/session.js';

const MIN_TTL = 1_000;
const MAX_TTL = 600_000;

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { path, holder, ttlMs } = req.body || {};
  if (!path || !holder || ttlMs == null) {
    return res.status(400).json({ error: 'path, holder, and ttlMs are required', code: 'invalid_argument' });
  }

  const clampedTtl = Math.min(MAX_TTL, Math.max(MIN_TTL, Number(ttlMs)));

  try {
    // Try to acquire or renew the lease atomically.
    const rows = await sql`
      INSERT INTO leases (path, holder, expires_at)
      VALUES (${path}, ${holder}, now() + (${clampedTtl} || ' milliseconds')::interval)
      ON CONFLICT (path) DO UPDATE
        SET holder = EXCLUDED.holder,
            expires_at = EXCLUDED.expires_at
        WHERE leases.expires_at < now()
           OR leases.holder = EXCLUDED.holder
      RETURNING expires_at
    `;

    if (rows.length > 0) {
      return res.status(200).json({ acquired: true, expiresAt: rows[0].expires_at });
    }

    // Lease is held by someone else — return busy info.
    const busy = await sql`SELECT expires_at FROM leases WHERE path = ${path}`;
    return res.status(200).json({
      acquired: false,
      expiresAt: busy.length > 0 ? busy[0].expires_at : null,
    });
  } catch (err) {
    console.error('[db/acquire]', err);
    return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
  }
}

// GET    /_blob/:id  → 302 redirect to the Vercel Blob URL
// DELETE /api/assets/:id → { deleted: true }
//
// This file handles both because vercel.json rewrites /_blob/:id → /api/assets/[id]
import { del } from '@vercel/blob';
import { sql } from '../_lib/db.js';
import { requireSession } from '../_lib/session.js';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return;

    try {
      const rows = await sql`SELECT url FROM assets WHERE id = ${id}`;
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      return res.redirect(302, rows[0].url);
    } catch (err) {
      console.error('[assets/id GET]', err);
      return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
    }
  }

  if (req.method === 'DELETE') {
    const session = requireSession(req, res);
    if (!session) return;

    try {
      const rows = await sql`SELECT url, pathname FROM assets WHERE id = ${id}`;
      if (rows.length === 0) return res.status(200).json({ deleted: false });

      await del(rows[0].url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      await sql`DELETE FROM assets WHERE id = ${id}`;

      return res.status(200).json({ deleted: true });
    } catch (err) {
      console.error('[assets/id DELETE]', err);
      return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
    }
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}

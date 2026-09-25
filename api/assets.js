// POST   /api/assets   raw body, Content-Type image/*  → { id, url, sizeBytes, contentType }
// GET    /api/assets                                   → { usage: { files, bytes, maxFiles, maxBytes } }
import { put } from '@vercel/blob';
import { sql } from './_lib/db.js';
import { requireSession } from './_lib/session.js';
import crypto from 'node:crypto';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILES = 5000;

// Vercel Blob has no hard file count limit but we mirror the spec surface.
const MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB soft cap for display

export const config = {
  api: {
    bodyParser: false, // We handle the raw body ourselves.
  },
};

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || 'image/jpeg';
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(contentType.split(';')[0].trim())) {
        return res.status(415).json({ error: 'Unsupported media type', code: 'invalid_argument' });
      }

      const body = await readBody(req);
      if (body.length > MAX_FILE_BYTES) {
        return res.status(413).json({ error: 'File too large (max 20 MB)', code: 'too_large' });
      }

      const id = crypto.randomUUID();
      const ext = contentType.split('/')[1].replace('jpeg', 'jpg').replace('+', '');
      const pathname = `appliance-photos/${id}.${ext}`;

      const blob = await put(pathname, body, {
        access: 'public',
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      await sql`
        INSERT INTO assets (id, url, pathname, content_type, size_bytes)
        VALUES (${id}, ${blob.url}, ${pathname}, ${contentType}, ${body.length})
      `;

      return res.status(200).json({
        id,
        url: `/_blob/${id}`,
        sizeBytes: body.length,
        contentType,
      });
    }

    if (req.method === 'GET') {
      const [countRow] = await sql`SELECT COUNT(*)::int AS files, COALESCE(SUM(size_bytes), 0)::bigint AS bytes FROM assets`;
      return res.status(200).json({
        usage: {
          files: countRow.files,
          bytes: Number(countRow.bytes),
          maxFiles: MAX_FILES,
          maxBytes: MAX_BYTES,
        },
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[assets]', err);
    return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
  }
}

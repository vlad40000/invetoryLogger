// GET /api/db/query?collection=C[&orderBy=F&dir=asc|desc][&limit=N]
// → { docs: [{ id, path, data }] }
import { sql } from '../_lib/db.js';
import { requireSession } from '../_lib/session.js';

function lastSegment(path) {
  return path.split('/').filter(Boolean).at(-1) || '';
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const collection = req.query.collection;
  if (!collection) return res.status(400).json({ error: 'collection is required', code: 'invalid_argument' });

  const orderBy = req.query.orderBy || null;
  const dir = req.query.dir === 'desc' ? 'desc' : 'asc';
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

  try {
    let rows;

    if (orderBy && limit != null) {
      if (dir === 'desc') {
        rows = await sql`
          SELECT path, data FROM docs
          WHERE parent = ${collection}
          ORDER BY data->${orderBy} DESC NULLS LAST, path
          LIMIT ${limit}
        `;
      } else {
        rows = await sql`
          SELECT path, data FROM docs
          WHERE parent = ${collection}
          ORDER BY data->${orderBy} ASC NULLS LAST, path
          LIMIT ${limit}
        `;
      }
    } else if (orderBy) {
      if (dir === 'desc') {
        rows = await sql`
          SELECT path, data FROM docs
          WHERE parent = ${collection}
          ORDER BY data->${orderBy} DESC NULLS LAST, path
        `;
      } else {
        rows = await sql`
          SELECT path, data FROM docs
          WHERE parent = ${collection}
          ORDER BY data->${orderBy} ASC NULLS LAST, path
        `;
      }
    } else if (limit != null) {
      rows = await sql`
        SELECT path, data FROM docs
        WHERE parent = ${collection}
        ORDER BY path
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT path, data FROM docs
        WHERE parent = ${collection}
        ORDER BY path
      `;
    }

    return res.status(200).json({
      docs: rows.map((r) => ({ id: lastSegment(r.path), path: r.path, data: r.data })),
    });
  } catch (err) {
    console.error('[db/query]', err);
    return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
  }
}

// GET /api/me → { id, name, isOwner, canEdit }
import { requireSession } from './_lib/session.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const session = requireSession(req, res);
  if (!session) return;
  return res.status(200).json(session);
}

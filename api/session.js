// POST /api/session  { passcode } → sets HttpOnly session cookie
// GET  /api/session  → { id, name, isOwner, canEdit }  (alias for /api/me)
import { buildSetCookie, requireSession } from './_lib/session.js';
import crypto from 'node:crypto';

const PASSCODE = process.env.APP_PASSCODE;
if (!PASSCODE) throw new Error('APP_PASSCODE environment variable is required');

// Deterministic user id derived from the passcode (shared single-user mode).
// In a multi-user deployment you would look users up in a table.
const OWNER_ID = crypto.createHash('sha256').update('owner:' + PASSCODE).digest('hex').slice(0, 24);

export default function handler(req, res) {
  if (req.method === 'POST') {
    const { passcode } = req.body || {};
    if (typeof passcode !== 'string' || passcode.trim() !== PASSCODE) {
      return res.status(401).json({ error: 'Invalid passcode', code: 'unauthorized' });
    }
    const payload = { id: OWNER_ID, name: 'Owner', isOwner: true, canEdit: true };
    res.setHeader('Set-Cookie', buildSetCookie(payload));
    return res.status(200).json(payload);
  }

  if (req.method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return;
    return res.status(200).json(session);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method Not Allowed' });
}

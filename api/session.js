// POST /api/session  { passcode } → sets HttpOnly session cookie
// GET  /api/session  → { id, name, isOwner, canEdit }  (alias for /api/me)
import { buildSetCookie, requireSession } from './_lib/session.js';
import crypto from 'node:crypto';

const CREW_PASSCODE = process.env.APP_PASSCODE;
const OWNER_PASSCODE = process.env.OWNER_PASSCODE;
if (!CREW_PASSCODE) throw new Error('APP_PASSCODE environment variable is required');
if (!OWNER_PASSCODE) throw new Error('OWNER_PASSCODE environment variable is required');
if (CREW_PASSCODE === OWNER_PASSCODE) {
  throw new Error('OWNER_PASSCODE must be different from APP_PASSCODE');
}

function sameSecret(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function userId(role, passcode) {
  return crypto.createHash('sha256').update(`${role}:${passcode}`).digest('hex').slice(0, 24);
}

export default function handler(req, res) {
  if (req.method === 'POST') {
    const { passcode } = req.body || {};
    if (typeof passcode !== 'string') {
      return res.status(401).json({ error: 'Invalid passcode', code: 'unauthorized' });
    }

    const trimmed = passcode.trim();
    const isOwner = sameSecret(trimmed, OWNER_PASSCODE);
    const isCrew = !isOwner && sameSecret(trimmed, CREW_PASSCODE);
    if (!isOwner && !isCrew) {
      return res.status(401).json({ error: 'Invalid passcode', code: 'unauthorized' });
    }

    const payload = {
      id: userId(isOwner ? 'owner' : 'crew', isOwner ? OWNER_PASSCODE : CREW_PASSCODE),
      name: isOwner ? 'Owner' : 'Field Crew',
      isOwner,
      canEdit: true,
    };
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

// Shared session helpers: sign/verify HttpOnly HMAC-SHA-256 cookies.
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error('SESSION_SECRET environment variable is required');

const COOKIE_NAME = 'session';
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Parse the session cookie from a Vercel request.
 * Returns the payload object or null if missing/invalid.
 */
export function getSession(req) {
  const raw = req.headers['cookie'] || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name.trim() === COOKIE_NAME) {
      return verify(decodeURIComponent(rest.join('=')));
    }
  }
  return null;
}

/**
 * Build the Set-Cookie header value for a signed session.
 */
export function buildSetCookie(payload) {
  const token = encodeURIComponent(sign(payload));
  const expires = new Date(Date.now() + COOKIE_TTL_MS).toUTCString();
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

/**
 * Require a valid session on a Vercel API route.
 * Returns the session payload or sends 401 and returns null.
 */
export function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    return null;
  }
  return session;
}

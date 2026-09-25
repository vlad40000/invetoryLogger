export function randomId(len = 20): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Per-viewer conveniences only (last batch, unsent draft). Never load-bearing. */
export const local = {
  get<T>(key: string): T | null {
    try {
      const v = window.localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: fine */
    }
  },
  del(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function errCode(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) return String((e as { code: unknown }).code);
  return 'unknown';
}

/** Viewer-facing copy for store / capability failures. */
export function saveErrorCopy(e: unknown): string {
  switch (errCode(e)) {
    case 'busy':
      return 'Another device is saving to this batch right now. Tap save again in a moment.';
    case 'batch_gone':
      return 'This batch was deleted on another device.';
    case 'batch_closed':
      return 'This batch was closed on another device. Reopen it from the menu to add units.';
    case 'quota_exceeded':
      return 'Storage is full. Close finished batches from their menu to compact them, then save again.';
    case 'invalid_argument':
      return 'Your access to this page is view-only, so changes can’t be saved.';
    case 'resource_exhausted':
    case 'rate_limited':
      return 'Too many saves at once. Wait a few seconds and tap save again.';
    case 'revoked':
    case 'not_granted':
    case 'capability_disabled':
      return 'Storage isn’t available in this view anymore. Reload the page.';
    default:
      return 'Couldn’t reach storage. Check your connection, then tap save again. Nothing typed here is lost.';
  }
}

export function clampInt(v: string | number, min = 0, max = 9999999): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

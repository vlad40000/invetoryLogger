import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../src/runtime-shim.js', import.meta.url), 'utf8');

function jsonResponse(body, status = 200) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? {} : { 'content-type': 'application/json' },
  });
}

function makeContext(fetchImpl, { visible = false, pollMs = 3000 } = {}) {
  const requests = [];
  const listeners = new Map();
  const location = {
    pathname: '/',
    search: '',
    hash: '',
    replaced: null,
    replace(value) { this.replaced = value; },
  };
  const context = {
    console,
    Blob,
    FormData,
    Response,
    URL,
    URLSearchParams,
    crypto,
    setTimeout,
    clearTimeout,
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method || 'GET' });
      return fetchImpl(String(url), init);
    },
    document: {
      visibilityState: visible ? 'visible' : 'hidden',
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type) { listeners.delete(type); },
      createElement() { return { style: {}, click() {}, remove() {} }; },
      body: { appendChild() {} },
    },
    window: {
      __CLAUDE_SHIM_POLL_MS__: pollMs,
      location,
    },
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, requests, listeners, location };
}

const responses = new Map([
  ['/api/me', { id: 'u1', name: 'Test User', canEdit: true, isOwner: true }],
  ['/api/db/doc?path=batches%2Fb1', { exists: true, data: { name: 'Batch 1' } }],
  ['/api/db/query?collection=batches&orderBy=createdAt&dir=desc&limit=5', {
    docs: [{ id: 'b1', path: 'batches/b1', data: { name: 'Batch 1' } }],
  }],
]);

const basic = makeContext(async (url, init) => {
  if (url === '/api/db/doc' && init.method === 'PUT') return jsonResponse(null, 204);
  if (responses.has(url)) return jsonResponse(responses.get(url));
  return jsonResponse({ error: 'missing' }, 404);
});

assert.equal(typeof basic.context.window.claude?.use, 'function');
const user = await basic.context.window.claude.use('user');
assert.equal(await user.id(), 'u1');
assert.equal(await user.can('data.write'), true);

const db = await basic.context.window.claude.use('db');
const snap = await db.doc('batches/b1').get();
assert.equal(snap.exists, true);
assert.equal(snap.data().name, 'Batch 1');
await db.doc('batches/b2').set({ name: 'Batch 2' });
const query = await db.collection('batches').orderBy('createdAt', 'desc').limit(5).get();
assert.equal(query.size, 1);
assert.equal(query.docs[0].id, 'b1');

const existing = { use: async () => 'original' };
const existingContext = {
  ...basic.context,
  window: { claude: existing },
};
existingContext.window.window = existingContext.window;
vm.createContext(existingContext);
vm.runInContext(code, existingContext);
assert.equal(existingContext.window.claude, existing, 'shim must not replace an existing Artifact runtime');

assert(basic.requests.some((r) => r.url === '/api/me'));
assert(basic.requests.some((r) => r.url.includes('/api/db/doc?path=')));

// Regression: remote edits to an existing document must change the snapshot fingerprint.
let remoteName = 'Before';
const live = makeContext(async (url) => {
  if (url === '/api/db/doc?path=batches%2Fb1') {
    return jsonResponse({ exists: true, data: { name: remoteName } });
  }
  return jsonResponse({ error: 'missing' }, 404);
}, { visible: true, pollMs: 5 });

const liveDb = await live.context.window.claude.use('db');
const seen = [];
const unsubscribe = liveDb.doc('batches/b1').onSnapshot((s) => seen.push(s.data()?.name));
await new Promise((resolve) => setTimeout(resolve, 12));
remoteName = 'After remote edit';
await new Promise((resolve) => setTimeout(resolve, 24));
unsubscribe();
assert(seen.includes('Before'), 'initial document snapshot should arrive');
assert(seen.includes('After remote edit'), 'polling must surface a remote edit with the same document id');

// Regression: 401 is an authentication state, not generic storage unavailability.
const auth = makeContext(async () => jsonResponse({ error: 'Unauthorized', code: 'unauthorized' }, 401));
const authUser = await auth.context.window.claude.use('user');
await assert.rejects(() => authUser.id(), (err) => err?.code === 'unauthorized');
assert.match(auth.location.replaced || '', /^\/login\.html\?next=/);

console.log('runtime shim contract: ok');

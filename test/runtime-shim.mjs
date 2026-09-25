import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../src/runtime-shim.js', import.meta.url), 'utf8');
const requests = [];
const listeners = new Map();

const responses = new Map([
  ['/api/me', { id: 'u1', name: 'Test User', canEdit: true, isOwner: true }],
  ['/api/db/doc?path=batches%2Fb1', { exists: true, data: { name: 'Batch 1' } }],
  ['/api/db/query?collection=batches&orderBy=createdAt&dir=desc&limit=5', { docs: [{ id: 'b1', path: 'batches/b1', data: { name: 'Batch 1' } }] }],
]);

function response(body, status = 200) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: body == null ? {} : { 'content-type': 'application/json' },
  });
}

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
    const key = String(url);
    requests.push({ url: key, method: init.method || 'GET' });
    if (key === '/api/db/doc' && init.method === 'PUT') return response(null, 204);
    if (responses.has(key)) return response(responses.get(key));
    return response({ error: 'missing' }, 404);
  },
  document: {
    visibilityState: 'hidden',
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    createElement() { return { style: {}, click() {}, remove() {} }; },
    body: { appendChild() {} },
  },
  window: {},
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(code, context);

assert.equal(typeof context.window.claude?.use, 'function');
const user = await context.window.claude.use('user');
assert.equal(await user.id(), 'u1');
assert.equal(await user.can('data.write'), true);

const db = await context.window.claude.use('db');
const snap = await db.doc('batches/b1').get();
assert.equal(snap.exists, true);
assert.equal(snap.data().name, 'Batch 1');
await db.doc('batches/b2').set({ name: 'Batch 2' });
const query = await db.collection('batches').orderBy('createdAt', 'desc').limit(5).get();
assert.equal(query.size, 1);
assert.equal(query.docs[0].id, 'b1');

const existing = { use: async () => 'original' };
const secondContext = { ...context, window: { claude: existing } };
vm.createContext(secondContext);
vm.runInContext(code, secondContext);
assert.equal(secondContext.window.claude, existing, 'shim must not replace an existing Artifact runtime');

assert(requests.some((r) => r.url === '/api/me'));
assert(requests.some((r) => r.url.includes('/api/db/doc?path=')));
console.log('runtime shim contract: ok');

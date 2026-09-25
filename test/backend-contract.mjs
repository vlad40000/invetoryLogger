import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const jsFiles = [
  'api/_lib/db.js',
  'api/_lib/session.js',
  'api/session.js',
  'api/me.js',
  'api/db/doc.js',
  'api/db/query.js',
  'api/db/acquire.js',
  'api/assets.js',
  'api/assets/[id].js',
  'api/sample.js',
];
for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + file, import.meta.url))], { stdio: 'pipe' });
}

process.env.SESSION_SECRET = 'test-secret-0123456789-test-secret-0123456789';
const session = await import('../api/_lib/session.js?contract-test');
const cookieHeader = session.buildSetCookie({ id: 'u1', name: 'Crew', isOwner: false, canEdit: true });
const parsed = session.getSession({ headers: { cookie: cookieHeader } });
assert.equal(parsed?.id, 'u1');
assert.equal(parsed?.isOwner, false);
const tampered = cookieHeader.replace(/session=([^;])/, 'session=x');
assert.equal(session.getSession({ headers: { cookie: tampered } }), null);

const doc = read('api/db/doc.js');
assert.match(doc, /SET data = jsonb_deep_merge\(data,/);
assert.match(doc, /RETURNING path/);
assert.doesNotMatch(doc, /const existing = await sql/);
assert.match(doc, /isBatchRoot\(path\) && !session\.isOwner/);

const migration = read('scripts/setup-db.mjs');
assert.match(migration, /CREATE OR REPLACE FUNCTION jsonb_deep_merge/);
assert.match(migration, /FULL JOIN jsonb_each\(patch\)/);

const query = read('api/db/query.js');
assert.match(query, /ORDER BY data->\$\{orderBy\} DESC NULLS LAST, path/);
assert.match(query, /ORDER BY data->\$\{orderBy\} ASC NULLS LAST, path/);
assert.match(query, /ORDER BY path/);

const acquire = read('api/db/acquire.js');
assert.match(acquire, /ON CONFLICT \(path\) DO UPDATE/);
assert.match(acquire, /leases\.expires_at < now\(\)/);
assert.match(acquire, /leases\.holder = EXCLUDED\.holder/);

const sessionRoute = read('api/session.js');
assert.match(sessionRoute, /OWNER_PASSCODE/);
assert.match(sessionRoute, /OWNER_PASSCODE must be different from APP_PASSCODE/);
assert.match(sessionRoute, /isOwner,/);

const assets = read('api/assets.js');
for (const field of ['id', 'url', 'sizeBytes', 'contentType']) assert.match(assets, new RegExp('\\b' + field + '\\b'));
for (const field of ['files', 'bytes', 'maxFiles', 'maxBytes']) assert.match(assets, new RegExp('\\b' + field + '\\b'));

const assetById = read('api/assets/[id].js');
assert.match(assetById, /if \(req\.method === 'GET'\)[\s\S]*requireSession\(req, res\)/);

const sample = read('api/sample.js');
assert.match(sample, /GoogleGenAI/);
assert.match(sample, /GEMINI_API_KEY/);
assert.match(sample, /gemini-3\\.8-flash/);
assert.match(sample, /responseMimeType: 'application\\/json'/);
assert.match(sample, /status === 429/);
assert.match(sample, /code: 'rate_limited'/);

const vercel = JSON.parse(read('vercel.json'));
assert.equal(vercel.buildCommand, 'npm run build');
assert.equal(vercel.outputDirectory, 'dist');
assert(vercel.rewrites.some((r) => r.source === '/_blob/:id' && r.destination === '/api/assets/:id'));

const build = read('build.mjs');
assert.match(build, /readFileSync\('src\/login\.html'/);
assert.match(build, /writeFileSync\('dist\/login\.html', loginHtml\)/);

const login = read('src/login.html');
assert.match(login, /new URLSearchParams\(window\.location\.search\)/);
assert.match(login, /!requested\.startsWith\('\/\/'\)/);

console.log('standalone backend contract: ok');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.dependencies['@google/genai'], '2.24.0');
assert.equal(pkg.dependencies['@anthropic-ai/sdk'], undefined);

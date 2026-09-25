// Local preview of dist/appliance-inventory.html with the MOCK Claude runtime
// (test/mock-claude.js). Data lives in the page's memory and resets on reload;
// photos are held by this server. Use it to click through the UI and to run
// the e2e tests. It is not a backend — see AGENTS.md → Standalone deployment.
//
//   npm run preview            → http://localhost:5173
//   PORT=8080 npm run preview
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const file = (p) => new URL(p, root);

const FONT_PKGS = [
  ['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600, 700]],
  ['IBM Plex Mono', 'ibm-plex-mono', [400, 500, 600]],
];
const hasLocalFonts = () => existsSync(file('node_modules/@fontsource/ibm-plex-sans/package.json'));

function pageHtml() {
  let html = readFileSync(file('dist/appliance-inventory.html'), 'utf8');
  html = html
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react\/[\d.]+\/umd\/react\.production\.min\.js/, '/vendor/react.js')
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react-dom\/[\d.]+\/umd\/react-dom\.production\.min\.js/, '/vendor/react-dom.js');
  if (hasLocalFonts()) html = html.replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]*/, '/vendor/fonts.css');
  // Mirrors the skeleton claude.ai wraps around an artifact page.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#fafaf7}img{max-width:100%}[hidden]{display:none!important}</style><script src="/mock-claude.js"></script></head><body>${html}</body></html>`;
}

function fontsCss() {
  return FONT_PKGS.flatMap(([fam, pkg, weights]) =>
    weights.map(
      (w) =>
        `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(/vendor/fonts/${pkg}/${w}.woff2) format('woff2')}`,
    ),
  ).join('\n');
}

export function startPreview({ port = Number(process.env.PORT || 5173), host = process.env.HOST || '0.0.0.0' } = {}) {
  const blobs = new Map(); // id -> {type, body}

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(200, 'text/html; charset=utf-8', pageHtml());
      if (url.pathname === '/mock-claude.js') return send(200, 'text/javascript', readFileSync(file('test/mock-claude.js')));
      if (url.pathname === '/vendor/react.js') return send(200, 'text/javascript', readFileSync(file('node_modules/react/umd/react.production.min.js')));
      if (url.pathname === '/vendor/react-dom.js') return send(200, 'text/javascript', readFileSync(file('node_modules/react-dom/umd/react-dom.production.min.js')));
      if (url.pathname === '/vendor/fonts.css') return send(200, 'text/css', fontsCss());
      const fm = url.pathname.match(/^\/vendor\/fonts\/([\w-]+)\/(\d+)\.woff2$/);
      if (fm) return send(200, 'font/woff2', readFileSync(file(`node_modules/@fontsource/${fm[1]}/files/${fm[1]}-latin-${fm[2]}-normal.woff2`)));

      // Mock asset store used by test/mock-claude.js (stands in for the `assets` capability).
      if (url.pathname === '/__mock/assets' && req.method === 'POST') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const id = randomBytes(16).toString('hex');
          blobs.set(id, { type: req.headers['content-type'] || 'application/octet-stream', body: Buffer.concat(chunks) });
          send(200, 'application/json', JSON.stringify({ id }));
        });
        return;
      }
      const am = url.pathname.match(/^\/__mock\/assets\/([0-9a-f]+)$/);
      if (am && req.method === 'DELETE') return send(200, 'application/json', JSON.stringify({ deleted: blobs.delete(am[1]) }));
      if (url.pathname === '/__mock/assets' && req.method === 'GET') {
        const bytes = [...blobs.values()].reduce((s, b) => s + b.body.length, 0);
        return send(200, 'application/json', JSON.stringify({ files: blobs.size, bytes }));
      }
      const bm = url.pathname.match(/^\/_blob\/([0-9a-f]+)$/);
      if (bm) {
        const b = blobs.get(bm[1]);
        return b ? send(200, b.type, b.body) : send(404, 'text/plain', 'not found');
      }
      return send(404, 'text/plain', 'not found');
    } catch (e) {
      return send(500, 'text/plain', String(e && e.message ? e.message : e));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({ server, port: actual, url: `http://localhost:${actual}/`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(file('dist/appliance-inventory.html'))) {
    console.error('dist/appliance-inventory.html missing — run `npm run build` first.');
    process.exit(1);
  }
  const { port, url } = await startPreview();
  console.log(`Preview (mock runtime, data resets on reload): ${url}`);
  for (const addrs of Object.values(networkInterfaces()))
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) console.log(`  on your network: http://${a.address}:${port}/`);
}

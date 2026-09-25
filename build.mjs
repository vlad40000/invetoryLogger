// Bundles src/app.tsx into one self-contained artifact page.
// React/ReactDOM come from cdnjs (pinned UMD); everything else is inline.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const globals = {
  name: 'globals',
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react-dom\/client)$/ }, (a) => ({ path: a.path, namespace: 'g' }));
    b.onLoad({ filter: /.*/, namespace: 'g' }, (a) => ({
      contents: `module.exports = ${a.path === 'react' ? 'window.React' : 'window.ReactDOM'};`,
      loader: 'js',
    }));
  },
};

const result = await esbuild.build({
  entryPoints: ['src/app.tsx'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  plugins: [globals],
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/styles.css', 'utf8');
const REACT = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';
const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';

const html = `<title>Appliance Inventory Logger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>
<div id="root"></div>
<script src="/runtime-shim.js"></script>
<script src="${REACT}"></script>
<script src="${REACT_DOM}"></script>
<script>
${js}
</script>
`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/appliance-inventory.html', html);
writeFileSync('dist/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`);
copyFileSync('src/runtime-shim.js', 'dist/runtime-shim.js');
console.log(`dist/appliance-inventory.html  ${(html.length / 1024).toFixed(1)} KB (js ${(js.length / 1024).toFixed(1)} KB)`);

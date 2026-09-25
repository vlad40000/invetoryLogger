// Two-device race: another viewer takes the next unit number while this one is
// on the confirm screen. Expect a live warning, then a save under the next
// free number with a relabel notice, and no duplicate numbers.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startPreview } from '../scripts/preview.mjs';

const OUT = process.argv[2] || 'test/out/walk';
mkdirSync(OUT, { recursive: true });
const preview = await startPreview({ port: 0, host: '127.0.0.1' });
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const expect = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
};

try {
  await p.goto(preview.url);
  await p.fill('#batch-name', 'Oak Ridge');
  await p.fill('#start-no', '200');
  await p.getByRole('button', { name: /Begin inventory/ }).click();
  await p.getByRole('button', { name: /Manual Entry/ }).click();
  await p.fill('#f-brand', 'Whirlpool');
  await p.fill('#f-model', 'WTW5000DW2');

  // "Other device" saves unit #200 straight into the store.
  await p.evaluate(async () => {
    const db = await window.claude.use('db');
    const bp = [...window.__docs.keys()].find((k) => k.split('/').length === 2);
    const b = window.__docs.get(bp);
    await db.collection(bp + '/records').doc('otherdev1').set({
      no: b.nextNumber, brand: 'LG', model: 'WM3900HWA', serial: '909KW0AB7723', type: 'Front Load Washer',
      typeReason: 'WM prefix', color: 'White', notes: [], freeNotes: '', source: 'photo', photo: null,
      createdAt: Date.now(), updatedAt: Date.now(), by: 'u_other', renumberedFrom: null,
    });
    await db.doc(bp).update({ nextNumber: b.nextNumber + 1, count: 1, firstUnit: b.nextNumber, lastUnit: b.nextNumber, updatedAt: Date.now() });
  });
  const warn = p.locator('.inline-note[role=alert]');
  await warn.waitFor();
  expect(/save as #201, not #200/.test(await warn.textContent()), 'live renumber warning');
  await p.screenshot({ path: `${OUT}/md-confirm.png` });
  await p.getByRole('button', { name: /Save & close/ }).click();
  await p.locator('.notice').waitFor();
  expect(/Saved as #201/.test(await p.locator('.notice').textContent()), 'relabel notice after save');
  const nos = await p.locator('.rec-no').allTextContents();
  expect(JSON.stringify(nos.map((s) => s.trim())) === '["#200","#201"]', 'no duplicate unit numbers: ' + nos.join(','));
  expect(!errors.length, 'no page errors:\n' + errors.join('\n'));
  console.log('multi-device race passed');
} finally {
  await browser.close();
  await preview.close();
}

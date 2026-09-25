// End-to-end pass through the main flows against the mock runtime, phone then
// desktop width, with a screenshot per step.  npm run test:e2e
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startPreview } from '../scripts/preview.mjs';

const OUT = process.argv[2] || 'test/out/walk';
mkdirSync(OUT, { recursive: true });
const preview = await startPreview({ port: 0, host: '127.0.0.1' });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push('console: ' + m.text());
});

const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const pick = async (trigger) => {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), trigger()]);
  await fc.setFiles('test/plate.jpg');
};
const expect = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
};

try {
  await p.goto(preview.url);
  await p.getByRole('button', { name: /Begin inventory/ }).waitFor();
  await shot('01-setup');
  await p.fill('#batch-name', 'Riverbend Apartments');
  await p.fill('#start-no', '101');
  await p.getByRole('button', { name: /Begin inventory/ }).click();
  await p.getByRole('button', { name: /Capture #101/ }).waitFor();
  await shot('02-list-empty');

  // Capture → Claude read (mock) → confirm → save & next
  await pick(() => p.getByRole('button', { name: /Capture #101/ }).click());
  await p.getByText('Reading nameplate…').waitFor();
  await shot('03-extracting');
  await p.getByRole('button', { name: /Save & capture next/ }).waitFor({ timeout: 10000 });
  expect((await p.inputValue('#f-model')) === 'RF28HFEDBSR/AA', 'model read into form');
  await shot('04-confirm');
  await p.getByRole('button', { name: /Missing handles/ }).click();
  await p.getByRole('button', { name: /Save & capture next/ }).click();
  await p.getByRole('button', { name: /Take photo for unit #102/ }).waitFor();
  await shot('05-camera');

  await pick(() => p.getByRole('button', { name: /Take photo for unit #102/ }).click());
  await p.getByRole('button', { name: /Save & close/ }).waitFor({ timeout: 10000 });
  await p.getByRole('radio', { name: 'White' }).click();
  await shot('06-confirm-2');
  await p.getByRole('button', { name: /Save & close/ }).click();
  await p.getByRole('button', { name: /Capture #103/ }).waitFor();

  // No-nameplate unit with the type picker
  await p.getByRole('button', { name: /No Nameplate/ }).click();
  await p.getByRole('button', { name: /Choose appliance type/ }).click();
  await shot('07-type-picker');
  await p.getByRole('button', { name: 'Electric Dryer' }).click();
  await p.getByRole('radio', { name: 'Almond' }).click();
  await p.getByRole('button', { name: /Save & close/ }).click();
  await p.getByRole('button', { name: /Capture #104/ }).waitFor();
  await p.waitForTimeout(1400);
  expect((await p.locator('.rec-no').count()) === 3, 'three units listed');
  await p.locator('.rec-row').first().click();
  await p.locator('.thumb img').first().waitFor();
  await shot('08-list-detail');

  // Menu → export XLSX
  await p.getByRole('button', { name: 'Batch menu' }).click();
  await shot('09-menu');
  await p.getByRole('button', { name: /Export inventory/ }).click();
  await shot('10-export');
  await p.getByRole('button', { name: /Excel workbook/ }).click();
  await p.getByText('Downloaded').waitFor();
  await shot('11-exported');
  const dl = await p.evaluate(() => window.__lastDownload);
  expect(dl && dl.filename === 'riverbend_apartments_units_101-103.xlsx', 'xlsx handed to downloads.save');
  writeFileSync(`${OUT}/${dl.filename}`, Buffer.from(dl.b64, 'base64'));
  await p.waitForTimeout(1900);

  // Edit a unit
  await p.locator('.rec-row').nth(1).click();
  await p.getByRole('button', { name: 'Edit', exact: true }).click();
  await p.locator('#f-no').waitFor();
  await shot('12-edit');
  await p.getByRole('button', { name: /✕ Cancel/ }).click();

  // Close (compacts) → batches list
  await p.getByRole('button', { name: 'Batch menu' }).click();
  await p.getByRole('button', { name: /Close batch/ }).click();
  await p.getByRole('button', { name: 'Close batch', exact: true }).click();
  await p.getByRole('button', { name: /Reopen batch/ }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(3700);
  expect((await p.locator('.rec-no').count()) === 3, 'closed batch reads from archive');
  await shot('13-closed');
  await p.getByRole('button', { name: /All batches/ }).first().click();
  await p.getByText('Closed · 1').waitFor();
  await shot('14-batches');

  // Desktop width: reopen and review in the table
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.getByRole('button', { name: /Riverbend Apartments/ }).click();
  await p.getByRole('button', { name: /Reopen batch/ }).click();
  await p.getByRole('button', { name: /Capture #104/ }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(3700);
  await p.locator('tr.trow').nth(1).click();
  await shot('15-desktop-list');

  const docs = await p.evaluate(() => [...window.__docs.keys()]);
  expect(docs.filter((k) => k.includes('/records/')).length === 3, 'records restored after reopen');
  expect(!docs.some((k) => k.includes('/archive/')), 'archive chunks removed after reopen');
  expect(!errors.length, 'no page errors:\n' + errors.join('\n'));
  console.log(`e2e walk passed · screenshots in ${OUT}`);
} finally {
  await browser.close();
  await preview.close();
}

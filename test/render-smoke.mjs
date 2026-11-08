// The render page in system Chrome on software GL, against throwaway data. Run: node test/render-smoke.mjs
// Also proves the block studies still work beside it: the main page loads, and a study opens.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const assert = (ok, msg) => { if (!ok) throw new Error(`render smoke failed: ${msg}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-render-'));
const shots = process.env.SHOTS || path.join(process.cwd(), 'shots');
fs.mkdirSync(shots, { recursive: true });
const data = path.join(tmp, 'd');
const env = { ...process.env, ROOM_STUDIO_CONFIG: path.join(tmp, 'c'), ROOM_STUDIO_DATA: data, PORT: '3398', HOST: '127.0.0.1', ROOM_STUDIO_AGENT: '', ROOM_STUDIO_CHANNEL: '' };
const server = spawn('node', ['bin/room-studio.mjs', 'serve'], { env, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 900));
const code = execFileSync('node', ['bin/room-studio.mjs', 'setup-link'], { env, encoding: 'utf8' }).trim().split('code=')[1];
const base = 'http://127.0.0.1:3398';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const watch = (page) => {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push(`console: ${m.text().slice(0, 400)}`); });
};
const nonBlank = (page, sel) => page.evaluate((s) => {
  const c = document.querySelector(s);
  const small = document.createElement('canvas'); small.width = 64; small.height = 36;
  const x = small.getContext('2d'); x.drawImage(c, 0, 0, 64, 36);
  const d = x.getImageData(0, 0, 64, 36).data; const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
  return seen.size;
}, sel);
try {
  const anon = await (await fetch(`${base}/files/renders/manifest.json`)).status;
  assert(anon === 401, `renders must need a login, got ${anon}`);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${base}/setup?code=${code}`);
  await page.fill('input[name=password]', 'smoke test password');
  await page.click('button');
  await page.waitForSelector('#rail button');

  // No renders on the server yet: the page must fall back to the live orbit on its own.
  await page.click('#viewbar a:has-text("Render")');
  await page.waitForSelector('#r3d', { timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${shots}/render-orbit.png` });
  assert(await nonBlank(page, '#r3d') > 20, 'orbit canvas looks blank');
  assert(await page.locator('#r-top button:has-text("Look around")').isDisabled(), 'no 360 yet, so Look around is disabled');

  // Fold slider and variant switch must not throw.
  await page.fill('.r-fold input', '100');
  await page.waitForTimeout(1500);
  // The table's slider, and its views, including the one that lifts the top off and the one that puts it back.
  await page.fill('input[aria-label="Open the table"]', '100');
  await page.waitForTimeout(1500);
  for (const name of ['Mechanism, top lifted off', 'Room: table, bed and platform']) {
    await page.click(`#r-views button:has-text("${name}")`);
    await page.waitForTimeout(1500);
    assert(await nonBlank(page, '#r3d') > 20, `table view looks blank: ${name}`);
    await page.screenshot({ path: `${shots}/render-table-${name.startsWith('Mech') ? 'mech' : 'room'}.png` });
  }
  await page.fill('input[aria-label="Open the table"]', '0');
  await page.fill('.r-fold input', '0');
  await page.click('#r-top button:has-text("Box south")');
  await page.waitForSelector('#r3d');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${shots}/render-orbit-south.png` });
  assert(await nonBlank(page, '#r3d') > 20, 'south variant canvas looks blank');

  // Design B: no fold slider, its own views, the table's slider still there, and it builds on software GL.
  await page.click('#r-top button:has-text("Design B")');
  await page.waitForSelector('#r3d');
  await page.waitForTimeout(4000);
  assert(await page.locator('input[aria-label="Fold the seat"]').count() === 0, 'Design B has nothing to fold');
  assert(await page.locator('input[aria-label="Open the table"]').count() === 1, 'the table stays in Design B');
  await page.click('#r-views button:has-text("Whole room")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${shots}/render-orbit-loft.png` });
  assert(await nonBlank(page, '#r3d') > 20, 'Design B canvas looks blank');
  await page.click('#r-top button:has-text("Box in corner")');
  await page.waitForSelector('input[aria-label="Fold the seat"]');
  await page.waitForTimeout(1500);

  // A phone gets the low tier and no Refine dead end.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, screen: { width: 390, height: 844 } });
  const p2 = await phone.newPage();
  watch(p2);
  await p2.goto(`${base}/login`);
  await p2.fill('input[name=password]', 'smoke test password');
  await p2.click('button');
  await p2.waitForTimeout(500);
  await p2.goto(`${base}/render`);
  await p2.waitForSelector('#r3d', { timeout: 60000 });
  await p2.waitForTimeout(5000);
  assert(await nonBlank(p2, '#r3d') > 10, 'phone orbit looks blank');
  await p2.click('#r-views button:has-text("Refine")');
  await p2.waitForFunction(() => /cannot path trace/.test(document.getElementById('r-status').textContent), null, { timeout: 15000 });
  const scrollW = await p2.evaluate(() => document.documentElement.scrollWidth);
  assert(scrollW <= 390, `phone page scrolls sideways: ${scrollW}`);
  await p2.screenshot({ path: `${shots}/render-phone.png` });

  // With a manifest, the page opens on stills, and those need no WebGL at all.
  const renders = path.join(data, 'renders');
  fs.mkdirSync(renders, { recursive: true });
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
  fs.writeFileSync(path.join(renders, 'x.jpg'), jpg);
  fs.writeFileSync(path.join(renders, 'manifest.json'), JSON.stringify({ stills: [{ file: 'x.jpg', label: 'Test still', variant: 'corner' }, { file: 'x.jpg', label: 'Table still', group: 'table' }, { file: 'x.jpg', label: 'Frame still', variant: 'loft' }, { file: 'x.jpg', label: 'Shared still' }], panos: [] }));
  const noGl = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p3 = await noGl.newPage();
  watch(p3);
  await p3.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function g(t, ...a) { return String(t).startsWith('webgl') ? null : orig.call(this, t, ...a); }; });
  await p3.goto(`${base}/login`);
  await p3.fill('input[name=password]', 'smoke test password');
  await p3.click('button');
  await p3.waitForTimeout(500);
  await p3.goto(`${base}/render`);
  await p3.waitForFunction(() => document.getElementById('still').naturalWidth > 0, null, { timeout: 15000 });
  // Stills sort into bed and seat, and table.
  await p3.click('#r-top button:has-text("Table")');
  assert(await p3.locator('#r-views button:has-text("Table still")').count() === 1, 'table still is not listed under Table');
  assert(await p3.locator('#r-views button:has-text("Test still")').count() === 0, 'other stills show under Table');
  await p3.click('#r-top button:has-text("Bed and seat")');
  assert(await p3.locator('#r-views button:has-text("Test still")').count() === 1, 'bed and seat still is missing');
  // Design B lists its own stills and none of the shared ones, which show the box and seat it replaces.
  assert(await p3.locator('#r-views button:has-text("Frame still")').count() === 0, 'Design B still shows under the other design');
  await p3.click('#r-top button:has-text("Design B")');
  assert(await p3.locator('#r-views button:has-text("Frame still")').count() === 1, 'Design B still is missing');
  assert(await p3.locator('#r-views button:has-text("Shared still")').count() === 0, 'a shared still shows under Design B');
  await p3.click('#r-top button:has-text("Box in corner")');
  await p3.click('#r-top button:has-text("Orbit")');
  await p3.waitForFunction(() => /not available/.test(document.getElementById('r-status').textContent), null, { timeout: 30000 });
  assert(await p3.locator('#still').isVisible(), 'stills must stay visible when WebGL is missing');
  // three logs its own error when it cannot get a context; that is the case under test here.
  for (let i = problems.length - 1; i >= 0; i--) if (/WebGL|THREE/.test(problems[i])) problems.splice(i, 1);

  // Block studies keep working on the main page.
  await page.goto(base);
  await page.waitForSelector('#rail button');
  await page.waitForTimeout(800);
  assert(await nonBlank(page, '#model') > 5, 'block model canvas looks blank');

  assert(problems.length === 0, problems.join('\n'));
  console.log('render smoke passed');
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

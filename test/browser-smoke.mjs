// Drives the real UI in system Chrome against throwaway data. Run: node test/browser-smoke.mjs
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const assert = (ok, msg) => { if (!ok) throw new Error(`smoke check failed: ${msg}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-smoke-'));
const shots = process.env.SHOTS || path.join(process.cwd(), 'shots');
fs.mkdirSync(shots, { recursive: true });
const env = { ...process.env, ROOM_STUDIO_CONFIG: path.join(tmp, 'c'), ROOM_STUDIO_DATA: path.join(tmp, 'd'), PORT: '3399', HOST: '127.0.0.1', ROOM_STUDIO_AGENT: '', ROOM_STUDIO_CHANNEL: '' };
const server = spawn('node', ['bin/room-studio.mjs', 'serve'], { env, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 900));
const code = execFileSync('node', ['bin/room-studio.mjs', 'setup-link'], { env, encoding: 'utf8' }).trim().split('code=')[1];
const base = 'http://127.0.0.1:3399';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const watch = (page) => {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${base}/setup?code=${code}`);
  await page.screenshot({ path: `${shots}/01-setup.png` });
  await page.fill('input[name=password]', 'smoke test password');
  await page.click('button');
  await page.waitForSelector('#rail button');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shots}/02-room.png` });

  await page.click('#viewbar button:has-text("Plan")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/03-plan-view.png` });
  await page.click('#viewbar button:has-text("Inside")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/04-inside.png` });
  await page.click('#viewbar button:has-text("Orbit")');

  await page.click('#rail button:has-text("Measure")');
  await page.fill('[name=ab]', '4200'); await page.fill('[name=bc]', '3100'); await page.fill('[name=cd]', '4180'); await page.fill('[name=da]', '3090');
  await page.fill('[name=ac]', '5205'); await page.fill('[name=bd]', '5210');
  await page.fill('[name=h-a]', '2610'); await page.fill('[name=h-b]', '2600'); await page.fill('[name=h-c]', '2605'); await page.fill('[name=h-d]', '2600');
  await page.click('button:has-text("Add one")');
  const e = page.locator('.fixed-entry').first();
  await e.locator('[name=offset]').fill('500'); await e.locator('[name=width]').fill('900'); await e.locator('[name=bottom]').fill('0'); await e.locator('[name=height]').fill('2050');
  assert(await page.locator('.fixed-entry label:has-text("From the west end")').count() === 1, 'north wall should measure from the west end');
  await e.locator('[name=wall]').selectOption('cd');
  assert(await page.locator('.fixed-entry label:has-text("From the east end")').count() === 1, 'hint should follow the wall');
  await e.locator('[name=wall]').selectOption('ab');
  await page.click('button:has-text("Save measurements")');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/05-measure.png` });
  const checkText = await page.locator('.check').first().textContent();
  console.log('check box:', checkText);
  assert(/Numbers agree|mm from/.test(checkText), 'measure check missing');

  // Strokes must map to real floor positions, or "put it here" drawings would lie.
  for (const view of ['plan', 'orbit', 'inside']) {
    const got = await page.evaluate((v) => {
      const { viewer } = window.roomStudio;
      viewer.setCamera(v);
      viewer.camera.updateMatrixWorld(true);
      const p = viewer.center.clone().set(1000, 500, 0).project(viewer.camera);
      return viewer.capture().toFloor((p.x + 1) / 2, (1 - p.y) / 2);
    }, view);
    console.log(`floor mapping ${view}:`, got);
    assert(Math.abs(got[0] - 1000) <= 2 && Math.abs(got[1] - 500) <= 2, `floor mapping off in ${view}: ${got}`);
  }
  await page.evaluate(() => window.roomStudio.viewer.setCamera('orbit'));

  await page.click('#rail button:has-text("Studies")');
  await page.click('button.pick');
  await page.waitForSelector('#player:not([hidden])');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/06-study-start.png` });
  const range = page.locator('#player input[type=range]');
  await range.evaluate((el) => { el.value = 1.5; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  await range.evaluate((el) => { el.value = 4.5; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/07-study-mid.png` });
  await page.click('#player button:has-text("Play")');
  await page.waitForTimeout(1800);
  const t = await page.evaluate(() => window.roomStudio.state.time);
  console.log('time after play:', t);
  assert(t > 4.5, 'playback did not advance');
  assert(!(await page.locator('#sheet').textContent()).includes('null'), 'stray null on the study page');

  await page.click('#draw-btn');
  await page.waitForSelector('#draw .sheet-box canvas');
  const box = await page.locator('#draw canvas').boundingBox();
  await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down();
  await page.mouse.move(box.x + 350, box.y + 320, { steps: 6 }); await page.mouse.move(box.x + 420, box.y + 220, { steps: 6 }); await page.mouse.up();
  await page.click('#draw .tools button:has-text("Arrow")');
  await page.mouse.move(box.x + 600, box.y + 150); await page.mouse.down(); await page.mouse.move(box.x + 480, box.y + 280, { steps: 4 }); await page.mouse.up();
  await page.fill('#draw textarea', 'Flap should stop here');
  await page.screenshot({ path: `${shots}/08-draw.png` });
  await page.click('#draw .send button');
  await page.waitForSelector('#draw', { state: 'hidden' });
  await page.waitForTimeout(400);
  const inbox = execFileSync('node', ['bin/room-studio.mjs', 'inbox'], { env, encoding: 'utf8' });
  console.log('inbox has note:', inbox.includes('Flap should stop here'));
  assert(inbox.includes('floor') && inbox.includes('floorMm'), 'floor coordinates missing');
  const img = inbox.match(/"image": "(.*?)"/)[1];
  fs.copyFileSync(img, `${shots}/09-sent-drawing.png`);

  await page.click('button:has-text("All studies")');
  await page.click('#rail button:has-text("Room")');
  await page.waitForTimeout(100);
  await page.click('#rail button:has-text("Items")');
  await page.click('button:has-text("Add an item")');
  await page.fill('[name=name]', 'Router and NAS'); await page.selectOption('[name=category]', 'hidden');
  await page.fill('[name=w]', '400'); await page.fill('[name=d]', '300'); await page.fill('[name=h]', '250');
  await page.click('button:has-text("Add item")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/10-items.png` });
  assert(await page.locator('.listing strong:has-text("Router and NAS")').count() === 1, 'item not listed');
  await page.click('#rail button:has-text("Plan")');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/11-plan.png` });
  await page.click('#rail button:has-text("Talk")');
  await page.fill('.composer textarea', 'hello from the smoke test');
  await page.click('.composer button');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/12-talk.png` });

  const png = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
    c.getContext('2d').fillRect(0, 0, 1200, 800);
    return c.toDataURL('image/jpeg').split(',')[1];
  }), 'base64');
  const photo = path.join(tmp, 'p.jpg'); fs.writeFileSync(photo, png);
  await page.click('#rail button:has-text("Photos")');
  await page.setInputFiles('input[type=file]', photo);
  await page.waitForSelector('.photos img');
  await page.screenshot({ path: `${shots}/13-photos.png` });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const m = await phone.newPage();
  watch(m);
  await m.goto(base);
  await m.waitForSelector('#rail button');
  await m.waitForTimeout(1000);
  await m.screenshot({ path: `${shots}/14-phone-room.png` });
  assert(await m.locator('#callbar button:has-text("Call")').count() === 1, 'Call button missing');
  // The live call needs a real worklet, which Playwright blocks (see call-smoke.mjs), so this only checks its layout.
  await m.evaluate(() => {
    document.getElementById('callbar').innerHTML = '<span class="status">0:12<span class="meter"><i style="width:60%"></i></span></span><button class="ghost">Mute</button><button class="end">Hang up</button>';
  });
  await m.screenshot({ path: `${shots}/18-phone-on-call.png` });
  const clash = await m.evaluate(() => {
    const a = document.getElementById('callbar').getBoundingClientRect();
    return ['draw-btn', 'viewbar'].filter((id) => { const b = document.getElementById(id).getBoundingClientRect(); return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; });
  });
  assert(clash.length === 0, `call bar overlaps ${clash}`);
  await m.evaluate(() => { document.getElementById('callbar').innerHTML = '<button>Call</button>'; });
  await m.click('#rail button:has-text("Measure")');
  await m.waitForTimeout(300);
  await m.screenshot({ path: `${shots}/15-phone-measure.png` });
  await m.click('#rail button:has-text("Studies")');
  await m.click('button.pick');
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${shots}/16-phone-study.png` });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('phone horizontal overflow:', overflow);
  assert(!overflow, 'phone page scrolls sideways');
  await m.click('#draw-btn');
  await m.waitForSelector('#draw canvas');
  await m.screenshot({ path: `${shots}/17-phone-draw.png` });
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no page errors');
process.exit(problems.length ? 1 : 0);

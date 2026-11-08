// Renders path-traced stills through the real page in headless Chrome on the real GPU.
// Run: node scripts/render-stills.mjs --base URL --password P --out DIR JOBS.json
// Writes NAME.png and NAME.jpg per job, and folds jobs with a label into DIR/manifest.json for the render page.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A path-trace holds the GPU at 99%, which starves a live voice call's speech recognition. This freezes the job for any call.
if (!process.env.RENDER_NO_YIELD) {
  spawn('sh', [fileURLToPath(new URL('./yield-to-calls.sh', import.meta.url))], { stdio: 'ignore', detached: true, env: { ...process.env, IDLE_LIMIT: '30' } }).unref();
}

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
const base = arg('base', 'http://127.0.0.1:3388');
const password = arg('password', 'render test');
const out = arg('out', 'shots');
const gpu = arg('gpu', 'nvidia');
const jobsFile = process.argv[process.argv.length - 1];
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });

function updateManifest(job) {
  if (!job.label) return;
  const file = path.join(out, 'manifest.json');
  const m = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { stills: [], panos: [] };
  const entry = { file: `${job.name}.jpg`, label: job.label, ...(job.shared ? {} : { variant: job.variant || 'corner' }), ...(job.look ? { look: job.look } : {}), ...(job.group ? { group: job.group } : {}) };
  const list = job.equirect ? m.panos : m.stills;
  const i = list.findIndex((e) => e.file === entry.file);
  if (i >= 0) list[i] = entry; else list.push(entry);
  fs.writeFileSync(file, JSON.stringify(m, null, 1));
}

const args = gpu === 'nvidia'
  ? ['--headless=new', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--render-node-override=/dev/dri/renderD128']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 600)); });
  await page.goto(`${base}/login`);
  await page.fill('input[name=password]', password);
  await page.click('button');
  await page.waitForTimeout(600);
  await page.goto(`${base}/render?scripted=1`);
  await page.waitForFunction(() => window.hifi);
  await page.evaluate(() => window.hifi.ready);
  for (const job of jobs) {
    const t0 = Date.now();
    const fn = job.mode === 'raster' ? 'renderRaster' : 'renderPT';
    const r = await page.evaluate(([f, j]) => window.hifi[f](j), [fn, job]);
    const file = path.join(out, `${job.name}.png`);
    fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
    const jpgFile = path.join(out, `${job.name}.jpg`);
    fs.writeFileSync(jpgFile, Buffer.from(r.jpg.split(',')[1], 'base64'));
    delete r.url; delete r.jpg;
    updateManifest(job);
    console.log(job.name, JSON.stringify(r), `wall ${Date.now() - t0} ms`, `png ${(fs.statSync(file).size / 1024).toFixed(0)} KiB`, `jpg ${(fs.statSync(jpgFile).size / 1024).toFixed(0)} KiB`);
  }
} finally {
  await browser.close();
}

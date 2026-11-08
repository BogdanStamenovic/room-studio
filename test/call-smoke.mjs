// A real browser with a fake microphone (Chrome's beep) against a stand-in hotline-calld.
// Proves mic -> worklet -> WebSocket -> socket and back, with the page's real call code.
//
// No Playwright here on purpose: with its automation attached, audioWorklet.addModule never
// even fetches the module (measured 2026-11-08, Chrome 157, headless and headed; the same page
// with no automation works). So the page drives itself and reports over HTTP.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachVoice } from '../server/voice.mjs';

const WEB = path.resolve('web');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-call-'));
const sock = path.join(tmp, 'audio.sock');
const fail = (msg) => { console.error(`call smoke failed: ${msg}`); finish(1); };
const assert = (ok, msg) => { if (!ok) fail(msg); };

let heard = 0; let peak = 0; let closed = false;
const audio = net.createServer((c) => {
  c.on('data', (d) => {
    heard += d.length;
    for (let i = 0; i + 1 < d.length; i += 2) peak = Math.max(peak, Math.abs(d.readInt16LE(i)));
    c.write(d);
  });
  c.on('close', () => { closed = true; });
  c.on('error', () => {});
}).listen(sock);

const PAGE = `<!doctype html><div id="bar"></div><script type="module">
import { mountCallBar } from '/call.js';
const report = (b) => fetch('/report', { method: 'POST', body: JSON.stringify(b) });
const toasts = [];
const bar = document.getElementById('bar');
mountCallBar(bar, { toast: (t) => toasts.push(t), httpsUrl: () => '' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await wait(50); return fn(); };
try {
  bar.querySelector('button').click();
  const live = await until(() => bar.querySelector('.meter'), 8000);
  await report({ step: 'live', live: Boolean(live), toasts });
  await wait(3000);
  const s = window.roomStudioCall();
  await report({ step: 'running', received: s?.received, sampleRate: s?.ctx.sampleRate, toasts });
  bar.querySelector('.ghost').click();
  await wait(400);
  await report({ step: 'muted' });
  await wait(700);
  await report({ step: 'muted-check' });
  bar.querySelector('.end').click();
  await wait(300);
  await report({ step: 'done', idle: bar.textContent, toasts });
} catch (e) { await report({ step: 'error', error: String(e) }); }
</script>`;

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript' };
let chrome;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(PAGE); }
  if (req.url === '/report') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { res.end(); onReport(JSON.parse(body)); });
    return undefined;
  }
  const f = path.join(WEB, path.basename(req.url));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'text/plain');
  return res.end(fs.readFileSync(f));
});
attachVoice(server, { authed: () => true, open: async () => sock });

function onReport(r) {
  console.log(JSON.stringify(r));
  if (r.step === 'error') fail(r.error);
  if (r.step === 'live') { assert(r.live, `never went live: ${r.toasts}`); heard = 0; peak = 0; }
  if (r.step === 'running') {
    // ~3 s at 16 kHz s16le is ~96 kB. Far off means the resampling or the clock is wrong.
    console.log(`heard ${heard} bytes, peak ${peak}, device rate ${r.sampleRate}`);
    assert(heard > 70000 && heard < 125000, `mic rate looks wrong: ${heard} bytes in 3 s`);
    assert(peak > 500, 'the microphone produced silence');
    assert(r.received > 70000, `audio did not come back to the page: ${r.received}`);
  }
  if (r.step === 'muted') peak = 0;
  if (r.step === 'muted-check') assert(peak === 0, `muted mic still sent audio, peak ${peak}`);
  if (r.step === 'done') {
    assert(r.idle === 'Call', `bar did not return to idle: ${r.idle}`);
    setTimeout(() => { assert(closed, 'hanging up did not close the audio socket'); console.log('call flow ok'); finish(0); }, 300);
  }
}
function finish(code) {
  chrome?.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(code);
}
server.listen(3397, '127.0.0.1', () => {
  // localhost counts as a secure context, so the microphone is allowed without HTTPS here.
  chrome = spawn('/usr/bin/google-chrome-stable', ['--headless=new', `--user-data-dir=${path.join(tmp, 'p')}`, '--no-first-run', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'http://localhost:3397/'], { stdio: 'ignore' });
});
setTimeout(() => fail('timed out'), 30000);

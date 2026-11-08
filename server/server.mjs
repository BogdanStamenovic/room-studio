import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, newId, safeId } from './store.mjs';
import * as auth from './auth.mjs';
import { readChannel, mirrorToChannel } from './chat.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const NM = path.join(ROOT, 'node_modules');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const MAX_JSON = 40 * 1024 * 1024;
const MAX_PHOTO = 40 * 1024 * 1024;

const IMPORT_MAP = JSON.stringify({ imports: { three: '/vendor/three/build/three.module.js', 'three/addons/': '/vendor/three/examples/jsm/' } });
const IMPORT_MAP_HASH = crypto.createHash('sha256').update(IMPORT_MAP).digest('base64');
const CSP = `default-src 'self'; script-src 'self' 'sha256-${IMPORT_MAP_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;

const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(body);
};
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json', { 'Cache-Control': 'no-store', ...extra });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req) => {
  try { return JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}'); }
  catch (e) { if (e.status) throw e; throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
};
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));

function serveFile(res, file, cache = 'no-cache') {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': cache });
  });
}
function under(base, rel) {
  const full = path.resolve(base, `.${path.posix.normalize(`/${rel}`)}`);
  return full.startsWith(base + path.sep) ? full : null;
}

function notifyAgent(text) {
  const agent = process.env.ROOM_STUDIO_AGENT;
  if (!agent) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn('hotline', ['--to', agent, '--no-wait', text], { stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 30000);
    child.on('error', (e) => { clearTimeout(timer); console.error('notify failed:', e.message); resolve(false); });
    child.on('exit', (code) => { clearTimeout(timer); if (code !== 0) console.error('notify exit', code); resolve(code === 0); });
  });
}

function imageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"></head><body class="gate"><main class="gate-card"><h1>Room Studio</h1>${body}</main></body></html>`;
const loginPage = (err = '') => page('Log in', `${err ? `<p class="err" role="alert">${err}</p>` : ''}<form method="post" action="/login"><label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label><button>Log in</button></form>`);
const setupPage = (code, err = '') => page('Set your password', `<p>Choose the password for this site. This link stops working once you save it.</p>${err ? `<p class="err" role="alert">${err}</p>` : ''}<form method="post" action="/setup"><input type="hidden" name="code" value="${code}"><label>New password, at least 10 characters<input type="password" name="password" minlength="10" autocomplete="new-password" required autofocus></label><button>Save password</button></form>`);
const expiredPage = page('Link expired', '<p>This setup link is expired or already used. Ask for a new one in your agent channel.</p>');

const FIELD_NAMES = ['ab', 'bc', 'cd', 'da'];
function cleanLength(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) throw Object.assign(new Error(`bad length: ${v}`), { status: 400 });
  return Math.round(n);
}
function cleanRoom(body, prev) {
  const walls = {};
  for (const k of FIELD_NAMES) walls[k] = cleanLength(body.walls?.[k]);
  const fixed = (Array.isArray(body.fixed) ? body.fixed : []).map((f) => ({
    id: safeId(f.id) || newId('fx'),
    kind: String(f.kind || 'other').slice(0, 30),
    wall: String(f.wall || 'ab').slice(0, 2),
    offset: cleanLength(f.offset),
    width: cleanLength(f.width),
    bottom: f.bottom === 0 || f.bottom === '0' ? 0 : cleanLength(f.bottom),
    height: cleanLength(f.height),
    depth: cleanLength(f.depth),
    note: String(f.note || '').slice(0, 500),
  }));
  return {
    ...prev,
    walls,
    diagonals: { ac: cleanLength(body.diagonals?.ac), bd: cleanLength(body.diagonals?.bd) },
    heights: Object.fromEntries(['a', 'b', 'c', 'd'].map((k) => [k, cleanLength(body.heights?.[k])])),
    fixed,
    notes: String(body.notes || '').slice(0, 5000),
    updatedAt: new Date().toISOString(),
  };
}
function cleanItem(b, prev = {}) {
  return {
    ...prev,
    id: prev.id || newId('item'),
    name: String(b.name || '').slice(0, 120).trim(),
    category: ['keep', 'hidden', 'automation', 'build', 'leaving'].includes(b.category) ? b.category : 'keep',
    w: cleanLength(b.w), d: cleanLength(b.d), h: cleanLength(b.h),
    needs: String(b.needs || '').slice(0, 1000),
    notes: String(b.notes || '').slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };
}

export function createServer({ store = new Store(), notify = notifyAgent, chat = { read: readChannel, mirror: mirrorToChannel } } = {}) {
  const tell = (text) => notify(`[room-studio] ${text}`);

  async function api(req, res, url, parts) {
    const m = req.method;
    const [, resource, id, sub] = parts;
    if (m === 'GET' && resource === 'rev') return json(res, 200, { rev: store.rev() });
    if (m === 'GET' && resource === 'state') {
      let outline = '';
      try { outline = fs.readFileSync(path.join(ROOT, 'docs/OUTLINE.md'), 'utf8'); } catch {}
      return json(res, 200, { rev: store.rev(), room: store.room(), items: store.items(), photos: store.photos(), drawings: store.drawings(), studies: store.studies(), outline });
    }
    if (resource === 'room' && m === 'PUT') {
      const room = cleanRoom(await readJson(req), store.room());
      store.saveRoom(room);
      tell('Bogdan saved new room measurements. Run: room-studio room');
      return json(res, 200, room);
    }
    if (resource === 'items' && m === 'POST') {
      const body = await readJson(req);
      const item = cleanItem(body);
      if (!item.name) throw Object.assign(new Error('name is required'), { status: 400 });
      store.saveItems([...store.items(), item]);
      return json(res, 201, item);
    }
    if (resource === 'items' && safeId(id) && (m === 'PUT' || m === 'DELETE')) {
      const items = store.items();
      const prev = items.find((i) => i.id === id);
      if (!prev) throw Object.assign(new Error('no such item'), { status: 404 });
      if (m === 'DELETE') { store.saveItems(items.filter((i) => i.id !== id)); return json(res, 200, { ok: true }); }
      const item = cleanItem(await readJson(req), prev);
      store.saveItems(items.map((i) => (i.id === id ? item : i)));
      return json(res, 200, item);
    }
    if (resource === 'photos' && m === 'POST') {
      const buf = await readBody(req, MAX_PHOTO);
      const ext = imageType(buf);
      if (!ext) throw Object.assign(new Error('only JPEG, PNG or WebP images are accepted'), { status: 415 });
      const pid = newId('p');
      const fname = `${pid}.${ext}`;
      fs.writeFileSync(store.p('photos', fname), buf);
      const photo = { id: pid, file: fname, label: String(url.searchParams.get('label') || '').slice(0, 200), at: new Date().toISOString() };
      store.savePhotos([...store.photos(), photo]);
      return json(res, 201, photo);
    }
    if (resource === 'photos' && safeId(id) && m === 'DELETE') {
      const photos = store.photos();
      const p = photos.find((x) => x.id === id);
      if (!p) throw Object.assign(new Error('no such photo'), { status: 404 });
      fs.renameSync(store.p('photos', p.file), store.p('trash', p.file));
      store.savePhotos(photos.filter((x) => x.id !== id));
      return json(res, 200, { ok: true });
    }
    if (resource === 'drawings' && m === 'POST') {
      const b = await readJson(req);
      const match = /^data:image\/png;base64,(.+)$/.exec(b.png || '');
      if (!match) throw Object.assign(new Error('png data URL is required'), { status: 400 });
      const did = newId('d');
      fs.writeFileSync(store.p('drawings', `${did}.png`), Buffer.from(match[1], 'base64'));
      const drawing = { id: did, at: new Date().toISOString(), note: String(b.note || '').slice(0, 5000), source: b.source || {}, strokes: b.strokes || [], floor: b.floor || [], status: 'new', delivered: null };
      store.writeJson(path.join('drawings', `${did}.json`), drawing);
      res.on('finish', async () => {
        const ok = await tell(`Bogdan sent drawing ${did}${drawing.note ? `: "${drawing.note}"` : ''}. Image: ${store.p('drawings', `${did}.png`)} Details: room-studio inbox`);
        store.writeJson(path.join('drawings', `${did}.json`), { ...drawing, delivered: ok });
      });
      return json(res, 201, { id: did });
    }
    if (resource === 'chat' && m === 'GET') {
      try { return json(res, 200, { ok: true, messages: await chat.read(), local: store.messages().filter((x) => !x.mirrored) }); }
      catch (e) { return json(res, 200, { ok: false, error: e.message, messages: [], local: store.messages() }); }
    }
    if (resource === 'chat' && m === 'POST') {
      const b = await readJson(req);
      const text = String(b.text || '').slice(0, 10000).trim();
      if (!text) throw Object.assign(new Error('text is required'), { status: 400 });
      const mirrored = await chat.mirror(text).then(() => true, (e) => { console.error('mirror failed:', e.message); return false; });
      const delivered = await tell(`Bogdan wrote on the site (logged-in session, not a verified Discord message): "${text}"\nAnswer with hotline-say; it shows on the site too.`);
      const msg = store.addMessage({ from: 'you', via: 'site', text, mirrored, delivered });
      return json(res, 201, msg);
    }
    if (resource === 'studies' && safeId(id) && sub === 'review' && m === 'POST') {
      const study = store.study(id);
      if (!study) throw Object.assign(new Error('no such study'), { status: 404 });
      const b = await readJson(req);
      study.status = b.status === 'approved' ? 'approved' : 'open';
      store.saveStudy(study);
      tell(`Bogdan ${study.status === 'approved' ? 'approved' : 'reopened'} study ${id} (revision ${study.revisions.length}).`);
      return json(res, 200, study);
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const ip = req.socket.remoteAddress;
    try {
      if (pathname === '/style.css') return serveFile(res, path.join(WEB, 'style.css'));
      if (pathname.startsWith('/vendor/fonts/')) {
        const f = under(path.join(NM, '@fontsource'), pathname.slice('/vendor/fonts/'.length));
        return f ? serveFile(res, f, 'public, max-age=604800') : send(res, 404, 'Not found');
      }
      if (pathname === '/healthz') return send(res, 200, 'ok');

      if (pathname === '/setup') {
        if (req.method === 'GET') {
          const code = url.searchParams.get('code');
          return auth.setupCodeValid(code) ? send(res, 200, setupPage(code), MIME['.html']) : send(res, 410, expiredPage, MIME['.html']);
        }
        const form = new URLSearchParams((await readBody(req, 8192)).toString());
        const code = form.get('code');
        const pw = form.get('password') || '';
        if (!auth.setupCodeValid(code)) return send(res, 410, expiredPage, MIME['.html']);
        if (pw.length < 10) return send(res, 400, setupPage(code, 'Use at least 10 characters.'), MIME['.html']);
        auth.setPassword(code, pw);
        return send(res, 303, '', MIME['.html'], { Location: '/', 'Set-Cookie': auth.sessionCookie(auth.createSession()) });
      }
      if (pathname === '/login') {
        if (req.method === 'GET') return send(res, 200, loginPage(), MIME['.html']);
        if (!auth.loginAllowed(ip)) return send(res, 429, loginPage('Too many wrong passwords. Try again in 15 minutes.'), MIME['.html']);
        const form = new URLSearchParams((await readBody(req, 8192)).toString());
        if (!auth.checkPassword(form.get('password'))) {
          auth.recordFailure(ip);
          return send(res, 401, loginPage('That password is wrong.'), MIME['.html']);
        }
        auth.clearFailures(ip);
        return send(res, 303, '', MIME['.html'], { Location: '/', 'Set-Cookie': auth.sessionCookie(auth.createSession()) });
      }

      const token = cookies(req).rs_session;
      if (!auth.sessionValid(token)) {
        if (pathname.startsWith('/api/') || pathname.startsWith('/files/')) return json(res, 401, { error: 'log in first' });
        return send(res, 303, '', MIME['.html'], { Location: '/login' });
      }
      if (pathname === '/logout' && req.method === 'POST') {
        auth.endSession(token);
        return send(res, 303, '', MIME['.html'], { Location: '/login', 'Set-Cookie': auth.sessionCookie('', 0) });
      }
      if (pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && !(req.headers['x-room-studio'] === '1')) return json(res, 403, { error: 'missing request header' });
        return await api(req, res, url, pathname.split('/').filter(Boolean));
      }
      if (pathname.startsWith('/files/photos/') || pathname.startsWith('/files/drawings/')) {
        const f = under(store.dir, pathname.slice('/files/'.length));
        return f ? serveFile(res, f, 'private, max-age=86400') : send(res, 404, 'Not found');
      }
      if (pathname.startsWith('/vendor/three/')) {
        const f = under(path.join(NM, 'three'), pathname.slice('/vendor/three/'.length));
        return f ? serveFile(res, f, 'public, max-age=604800') : send(res, 404, 'Not found');
      }
      if (pathname === '/') {
        const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').replace('__IMPORT_MAP__', IMPORT_MAP);
        return send(res, 200, html, MIME['.html'], { 'Cache-Control': 'no-cache' });
      }
      const f = under(WEB, pathname.slice(1));
      return f ? serveFile(res, f) : send(res, 404, 'Not found');
    } catch (e) {
      if (!e.status) console.error(e);
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'server error' });
    }
  });
}

export function listen(server) {
  const port = Number(process.env.PORT || 3300);
  // Never 0.0.0.0: room photos and floor plans must not reach the LAN.
  const hosts = (process.env.HOST || '127.0.0.1').split(',').filter(Boolean);
  const first = hosts[0];
  server.listen(port, first, () => console.log(`room-studio on ${first}:${port}`));
  const handler = server.listeners('request')[0];
  for (const host of hosts.slice(1)) {
    http.createServer(handler).listen(port, host, () => console.log(`room-studio on ${host}:${port}`));
  }
}

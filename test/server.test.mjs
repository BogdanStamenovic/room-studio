import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-test-'));
process.env.ROOM_STUDIO_CONFIG = path.join(tmp, 'config');
process.env.ROOM_STUDIO_DATA = path.join(tmp, 'data');
const { Store } = await import('../server/store.mjs');
const auth = await import('../server/auth.mjs');
const { createServer } = await import('../server/server.mjs');
const { mapMessage, SITE_MARK } = await import('../server/chat.mjs');

const { default: WebSocket } = await import('ws');
const net = await import('node:net');

// Stands in for hotline-calld's audio socket: echoes what it hears.
const callSocket = path.join(tmp, 'call.sock');
const echo = net.createServer((c) => { c.on('data', (d) => c.write(d)); c.on('error', () => {}); });
await new Promise((r) => echo.listen(callSocket, r));
let openVoice = async () => callSocket;

const told = [];
const mirrored = [];
const store = new Store(process.env.ROOM_STUDIO_DATA);
const server = createServer({
  store,
  notify: async (t) => { told.push(t); return true; },
  chat: { read: async () => [], mirror: async (t) => { mirrored.push(t); } },
  openVoice: () => openVoice(),
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { echo.close(); server.close(); server.closeAllConnections(); fs.rmSync(tmp, { recursive: true, force: true }); });

let cookie = '';
const req = (route, opts = {}) => fetch(base + route, { redirect: 'manual', ...opts, headers: { cookie, 'X-Room-Studio': '1', ...(opts.headers || {}) } });
const form = (o) => ({ method: 'POST', body: new URLSearchParams(o).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

test('nothing is reachable before login', async () => {
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  const page = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(page.status, 303);
  assert.equal(page.headers.get('location'), '/login');
  assert.equal((await fetch(`${base}/files/photos/x.jpg`)).status, 401);
});

test('setup link works exactly once and logs in', async () => {
  const code = auth.createSetupCode();
  assert.equal((await fetch(`${base}/setup?code=wrong`)).status, 410);
  assert.equal((await fetch(`${base}/setup?code=${code}`)).status, 200);
  assert.equal((await req('/setup', form({ code, password: 'short' }))).status, 400);
  const res = await req('/setup', form({ code, password: 'correct horse battery' }));
  assert.equal(res.status, 303);
  cookie = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/setup', form({ code, password: 'another password here' }))).status, 410);
  assert.equal((await req('/api/rev')).status, 200);
});

test('password login rejects wrong and accepts right', async () => {
  assert.equal((await fetch(`${base}/login`, form({ password: 'nope' }))).status, 401);
  const ok = await fetch(`${base}/login`, { ...form({ password: 'correct horse battery' }), redirect: 'manual' });
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
});

test('writes need the custom header, which a cross-site form cannot send', async () => {
  const res = await fetch(`${base}/api/room`, { method: 'PUT', headers: { cookie }, body: '{}' });
  assert.equal(res.status, 403);
});

test('saving measurements keeps the previous version', async () => {
  const put = (b) => req('/api/room', { method: 'PUT', body: JSON.stringify(b) });
  assert.equal((await put({ walls: { ab: 4000, bc: '3000', cd: 4000, da: 3000 } })).status, 200);
  assert.equal(store.room().walls.bc, 3000);
  assert.equal((await put({ walls: { ab: 4100, bc: 3000, cd: 4000, da: 3000 } })).status, 200);
  assert.equal(fs.readdirSync(store.p('history')).length, 1);
  assert.equal((await put({ walls: { ab: -5 } })).status, 400);
  assert.ok(told.some((t) => t.includes('measurements')));
});

test('photos reject non-images and path tricks do not escape', async () => {
  assert.equal((await req('/api/photos', { method: 'POST', body: 'not an image' })).status, 415);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const res = await req('/api/photos?label=wall', { method: 'POST', body: jpg });
  assert.equal(res.status, 201);
  const { file } = await res.json();
  assert.equal((await req(`/files/photos/${file}`)).status, 200);
  const escape = await req('/files/photos/..%2F..%2Fconfig%2Fauth.json');
  assert.equal(escape.status, 404);
});

test('a drawing is stored and the agent is told', async () => {
  const png = `data:image/png;base64,${Buffer.from('fake').toString('base64')}`;
  const res = await req('/api/drawings', { method: 'POST', body: JSON.stringify({ png, note: 'put it here', source: { kind: 'view' }, floor: [{ tool: 'box', floorMm: [[1, 2]] }] }) });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.ok(fs.existsSync(store.p('drawings', `${id}.png`)));
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(told.some((t) => t.includes(id) && t.includes('put it here')));
  assert.equal(store.drawings().at(-1).delivered, true);
});

test('chat goes to the agent and mirrors to the channel', async () => {
  const res = await req('/api/chat', { method: 'POST', body: JSON.stringify({ text: 'hello there' }) });
  assert.equal(res.status, 201);
  const msg = await res.json();
  assert.equal(msg.delivered, true);
  assert.deepEqual(mirrored, ['hello there']);
  assert.ok(told.some((t) => t.includes('hello there')));
  const list = await (await req('/api/chat')).json();
  assert.equal(list.local.length, 0);
});

test('channel messages map to the right speaker', () => {
  assert.equal(mapMessage({ author: { id: 'me' }, content: 'hi' }, 'me').from, 'you');
  assert.equal(mapMessage({ author: { id: 'bot', bot: true }, content: 'reply' }, 'me').from, 'agent');
  const site = mapMessage({ author: { id: 'bot', bot: true }, content: `${SITE_MARK}typed here` }, 'me');
  assert.equal(site.from, 'you');
  assert.equal(site.text, 'typed here');
});

const wsUrl = () => `ws://127.0.0.1:${server.address().port}/api/call`;
const dial = (headers) => new WebSocket(wsUrl(), { headers });
const originOk = () => ({ origin: base, cookie });
const refused = (ws) => new Promise((resolve) => { ws.on('error', () => resolve(true)); ws.on('open', () => resolve(false)); });

test('a call needs a session and the site\'s own origin', async () => {
  assert.equal(await refused(dial({ origin: base })), true);
  assert.equal(await refused(dial({ origin: 'https://evil.example', cookie })), true);
  assert.equal(await refused(dial({ cookie })), true);
});

function collect(ws) {
  const seen = { states: [], audio: [], errors: [] };
  ws.on('message', (data, isBinary) => {
    if (isBinary) seen.audio.push(Buffer.from(data));
    else { const m = JSON.parse(data); seen.states.push(m.state); if (m.error) seen.errors.push(m.error); }
  });
  return seen;
}
const until = async (fn) => { const end = Date.now() + 2000; while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10)); assert.ok(fn()); };

test('call audio flows both ways, and only one call runs at a time', async () => {
  const ws = dial(originOk());
  const seen = collect(ws);
  await until(() => seen.states.includes('live'));
  ws.send(Buffer.alloc(640, 7), { binary: true });
  await until(() => seen.audio.length > 0);
  assert.equal(seen.audio[0][0], 7);
  const second = dial(originOk());
  const other = collect(second);
  await until(() => other.states.includes('ended'));
  assert.match(other.errors[0], /already/);
  ws.close();
  await new Promise((r) => setTimeout(r, 50));
  const third = dial(originOk());
  const again = collect(third);
  await until(() => again.states.includes('live'));
  third.close();
  await new Promise((r) => setTimeout(r, 50));
});

test('a dead call service ends the call with a reason and frees the line', async () => {
  const keep = openVoice;
  openVoice = async () => { throw new Error('refused'); };
  const ws = dial(originOk());
  const seen = collect(ws);
  await until(() => seen.states.includes('ended'));
  assert.match(seen.errors[0], /could not start/);
  openVoice = keep;
  await new Promise((r) => setTimeout(r, 50));
  const next = dial(originOk());
  const ok = collect(next);
  await until(() => ok.states.includes('live'));
  next.close();
  await new Promise((r) => setTimeout(r, 50));
});

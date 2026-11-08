import net from 'node:net';
import { WebSocketServer } from 'ws';

// The browser speaks to hotline-calld through here: s16le 16 kHz both ways, as binary
// WebSocket messages on this side and a Unix socket stream on the other. All the voice
// logic stays in hotline-call; this only moves bytes and keeps calls to one at a time.
const CALLD = () => process.env.ROOM_STUDIO_CALLD || 'http://127.0.0.1:8792';
// More unsent audio than this means the browser's link has stalled, and it can only get worse.
const MAX_BUFFERED = 512 * 1024;

export async function openCall() {
  const res = await fetch(`${CALLD()}/api/v1/webcall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: process.env.ROOM_STUDIO_AGENT || '', asked: 'Bogdan pressed Call on the Room Studio website.' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`the call service answered ${res.status}`);
  const { socket } = await res.json();
  if (!socket) throw new Error('the call service gave no audio socket');
  return socket;
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || host === req.headers['x-forwarded-host'];
  } catch { return false; }
}

export function attachVoice(server, { authed, open = openCall }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  let active = null;

  const onUpgrade = (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/api/call') return socket.destroy();
    // A WebSocket handshake carries cookies but no CORS check, so another site could otherwise start a call.
    if (!authed(req) || !sameOrigin(req)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return undefined;
    }
    wss.handleUpgrade(req, socket, head, (ws) => run(ws));
    return undefined;
  };

  async function run(ws) {
    const state = (name, extra = {}) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ state: name, ...extra })); };
    if (active) {
      state('ended', { error: 'A call is already running.' });
      ws.close();
      return;
    }
    active = ws;
    let link = null;
    const finish = () => {
      if (active === ws) active = null;
      link?.destroy();
      if (ws.readyState === ws.OPEN) ws.close();
    };
    ws.on('close', finish);
    ws.on('error', finish);
    ws.on('message', (data, isBinary) => {
      if (isBinary && link && !link.destroyed && link.writable) link.write(data);
    });
    state('connecting');
    try {
      const path = await open();
      if (ws.readyState !== ws.OPEN) return;
      link = net.connect(path);
      link.on('connect', () => state('live'));
      link.on('data', (buf) => {
        if (ws.readyState !== ws.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED) { state('ended', { error: 'The connection stalled.' }); finish(); return; }
        ws.send(buf, { binary: true });
      });
      link.on('close', () => { state('ended'); finish(); });
      link.on('error', (e) => { console.error('call audio socket:', e.message); state('ended', { error: 'The call audio dropped.' }); finish(); });
    } catch (e) {
      console.error('call failed to open:', e.message);
      state('ended', { error: 'The call could not start. The call service may be down.' });
      finish();
    }
  }

  server.on('upgrade', onUpgrade);
  return { onUpgrade, close: () => wss.close() };
}

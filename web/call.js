import { h } from './ui.js';

export function mountCallBar(root, { toast, httpsUrl }) {
  let session = null;
  let timer = null;

  const render = () => {
    const kids = [];
    if (!session) {
      kids.push(h('button', { type: 'button', onclick: start }, 'Call'));
    } else {
      const status = h('span', { class: 'status' }, session.live ? clock() : 'Connecting');
      if (session.live) { session.meter = h('i'); status.append(h('span', { class: 'meter', 'aria-hidden': 'true' }, session.meter)); }
      session.statusEl = status;
      kids.push(status,
        h('button', { type: 'button', class: 'ghost', 'aria-pressed': String(session.muted), onclick: toggleMute }, session.muted ? 'Unmute' : 'Mute'),
        h('button', { type: 'button', class: 'end', onclick: () => stop() }, 'Hang up'));
    }
    root.replaceChildren(...kids);
  };
  const clock = () => {
    const s = Math.floor((Date.now() - session.liveAt) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const toggleMute = () => {
    session.muted = !session.muted;
    session.node?.port.postMessage(session.muted ? 'mute' : 'unmute');
    render();
  };

  async function start() {
    if (!window.isSecureContext) {
      const url = httpsUrl();
      if (url) { toast('Calls need the secure address. Log in there once.'); setTimeout(() => location.assign(url), 1200); }
      else toast('Calls need HTTPS, and this site has no HTTPS address set up.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { toast('This browser cannot use a microphone here.'); return; }
    const s = { live: false, muted: false };
    session = s;
    render();
    try {
      // Must happen inside the tap, or iOS leaves the context suspended.
      s.ctx = new AudioContext({ latencyHint: 'interactive' });
      s.ctx.resume();
      s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (session !== s) return cleanup(s);
      await s.ctx.audioWorklet.addModule('/call-worklet.js');
      if (session !== s) return cleanup(s);
      s.node = new AudioWorkletNode(s.ctx, 'call-io', { numberOfOutputs: 1, outputChannelCount: [1] });
      s.ctx.createMediaStreamSource(s.stream).connect(s.node);
      s.node.connect(s.ctx.destination);
      s.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/call`);
      s.ws.binaryType = 'arraybuffer';
      s.node.port.onmessage = ({ data }) => {
        if (s.ws.readyState === WebSocket.OPEN && s.live) s.ws.send(data.pcm);
        if (s.meter) s.meter.style.width = `${Math.min(100, data.rms * 400)}%`;
      };
      s.ws.onmessage = ({ data }) => {
        if (typeof data !== 'string') {
          s.received = (s.received || 0) + data.byteLength;
          s.node.port.postMessage(data, [data]);
          return;
        }
        const msg = JSON.parse(data);
        if (msg.state === 'live') {
          s.live = true; s.liveAt = Date.now();
          render();
          timer = setInterval(() => { if (s.statusEl?.firstChild) s.statusEl.firstChild.textContent = clock(); }, 1000);
          navigator.wakeLock?.request('screen').then((l) => { s.wake = l; }).catch(() => {});
        } else if (msg.state === 'ended') {
          stop(msg.error || 'Call ended');
        }
      };
      s.ws.onerror = () => stop('The call could not connect. Log in again if this keeps happening.');
      s.ws.onclose = () => { if (session === s) stop('Call ended'); };
    } catch (e) {
      const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
      stop(denied ? 'The browser blocked the microphone. Allow it for this site, then call again.' : `The call could not start: ${e.message}`);
    }
    return undefined;
  }

  function cleanup(s) {
    s.ws?.close();
    s.stream?.getTracks().forEach((t) => t.stop());
    s.node?.disconnect();
    s.ctx?.close().catch(() => {});
    s.wake?.release().catch(() => {});
  }

  function stop(message) {
    const s = session;
    if (!s) return;
    session = null;
    clearInterval(timer);
    cleanup(s);
    window.roomStudioLastCall = { received: s.received || 0 };
    render();
    if (message) toast(message);
  }

  window.roomStudioCall = () => session;
  render();
}

import { h } from './ui.js';

const COLORS = [['Yellow', '#f5b700'], ['Red', '#e53322'], ['White', '#ffffff'], ['Black', '#111111']];
const TOOLS = [['pen', 'Pen'], ['arrow', 'Arrow'], ['box', 'Box'], ['text', 'Text']];

function paint(ctx, shape, W, H) {
  const lw = Math.max(2, W * 0.0035);
  ctx.strokeStyle = shape.color; ctx.fillStyle = shape.color;
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = ([x, y]) => [x * W, y * H];
  const pts = shape.points;
  if (shape.tool === 'pen') {
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (pts.length === 1) ctx.lineTo(...P(pts[0]));
    ctx.stroke();
  } else if (shape.tool === 'box') {
    const [x0, y0] = P(pts[0]); const [x1, y1] = P(pts[pts.length - 1]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  } else if (shape.tool === 'arrow') {
    const [x0, y0] = P(pts[0]); const [x1, y1] = P(pts[pts.length - 1]);
    const a = Math.atan2(y1 - y0, x1 - x0); const head = lw * 5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
    ctx.stroke();
  } else if (shape.tool === 'text') {
    const size = Math.max(16, W * 0.022);
    ctx.font = `600 ${size}px Barlow, sans-serif`;
    const [x, y] = P(pts[0]);
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = shape.color === '#111111' ? '#ffffff' : '#111111';
    ctx.strokeText(shape.text, x, y);
    ctx.fillText(shape.text, x, y);
  }
}

/**
 * source: { url, width, height, kind, meta, toFloor? }. Strokes live in 0..1 coordinates of the
 * source, so the on-screen preview and the exported PNG cannot drift apart at different sizes.
 */
export function openDraw(root, source, { onSend, onClose }) {
  let tool = 'pen';
  let color = COLORS[0][1];
  const shapes = [];
  let live = null;

  const img = source.url ? h('img', { src: source.url, alt: '' }) : null;
  const canvas = h('canvas', {});
  const box = h('div', { class: 'sheet-box' }, img, canvas);
  if (!source.url) box.style.background = '#ffffff';
  const paper = h('div', { class: 'paper' }, box);
  const ctx = canvas.getContext('2d');

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of shapes) paint(ctx, s, canvas.width, canvas.height);
    if (live) paint(ctx, live, canvas.width, canvas.height);
  }
  function layout() {
    const r = paper.getBoundingClientRect();
    const scale = Math.min(r.width / source.width, r.height / source.height);
    const w = Math.max(1, Math.floor(source.width * scale));
    const hh = Math.max(1, Math.floor(source.height * scale));
    box.style.width = `${w}px`; box.style.height = `${hh}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr; canvas.height = hh * dpr;
    redraw();
  }
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (tool === 'text') return placeText(e);
    canvas.setPointerCapture(e.pointerId);
    live = { tool, color, points: [pos(e)] };
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!live) return;
    if (tool === 'pen') {
      const events = e.getCoalescedEvents?.() || [e];
      for (const c of events.length ? events : [e]) live.points.push(pos(c));
    } else live.points[1] = pos(e);
    redraw();
  });
  const finish = () => { if (live) { shapes.push(live); live = null; redraw(); } };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  function placeText(e) {
    paper.querySelector('.text-entry')?.remove();
    const at = pos(e);
    const input = h('input', { class: 'text-entry', 'aria-label': 'Label text', placeholder: 'Type, then Enter' });
    const pr = paper.getBoundingClientRect();
    input.style.left = `${Math.min(e.clientX - pr.left, pr.width - 210)}px`;
    input.style.top = `${e.clientY - pr.top - 20}px`;
    const commit = () => {
      if (input.value.trim()) { shapes.push({ tool: 'text', color, points: [at], text: input.value.trim() }); redraw(); }
      input.remove();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') input.remove();
    });
    input.addEventListener('blur', commit);
    paper.append(input);
    setTimeout(() => input.focus());
  }

  const toolBtns = TOOLS.map(([id, name]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(id === tool), onclick: () => { tool = id; toolBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(TOOLS[i][0] === id))); } }, name);
    return b;
  });
  const swatches = COLORS.map(([name, value]) => {
    const b = h('button', { type: 'button', class: 'swatch', 'aria-label': name, 'aria-pressed': String(value === color), onclick: () => { color = value; swatches.forEach((x, i) => x.setAttribute('aria-pressed', String(COLORS[i][1] === value))); } });
    b.style.background = value;
    return b;
  });
  const note = h('textarea', { placeholder: 'What should I understand from this?', 'aria-label': 'Note' });
  const sendBtn = h('button', { type: 'button', class: 'btn' }, 'Send to agent');

  function close() { removeEventListener('resize', layout); root.hidden = true; root.replaceChildren(); onClose?.(); }

  sendBtn.addEventListener('click', async () => {
    if (!shapes.length && !note.value.trim()) { note.focus(); return; }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending';
    const out = document.createElement('canvas');
    const MAX = 2400;
    const k = Math.min(1, MAX / Math.max(source.width, source.height));
    out.width = Math.round(source.width * k); out.height = Math.round(source.height * k);
    const c2 = out.getContext('2d');
    if (img) { await img.decode().catch(() => {}); c2.drawImage(img, 0, 0, out.width, out.height); }
    else { c2.fillStyle = '#fff'; c2.fillRect(0, 0, out.width, out.height); }
    for (const s of shapes) paint(c2, s, out.width, out.height);
    const floor = source.toFloor
      ? shapes.map((s) => ({ tool: s.tool, text: s.text, floorMm: thin(s.points).map(([u, v]) => source.toFloor(u, v)).filter(Boolean) }))
      : [];
    try {
      await onSend({ png: out.toDataURL('image/png'), note: note.value.trim(), source: { kind: source.kind, ...source.meta }, strokes: shapes, floor });
      close();
    } catch (e) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send to agent';
      throw e;
    }
  });

  root.replaceChildren(
    h('div', { class: 'tools' }, ...toolBtns, ...swatches,
      h('button', { type: 'button', onclick: () => { shapes.pop(); redraw(); } }, 'Undo'),
      h('button', { type: 'button', onclick: () => { shapes.length = 0; redraw(); } }, 'Clear'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', onclick: close }, 'Close')),
    paper,
    h('div', { class: 'send' }, note, sendBtn),
  );
  root.hidden = false;
  addEventListener('resize', layout);
  layout();
}

function thin(points, max = 40) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

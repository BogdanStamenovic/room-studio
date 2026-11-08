import { Viewer } from './viewer.js';
import { openDraw } from './draw.js';
import { h, markdown } from './ui.js';
import { resolveRoom, CHECK_TOLERANCE_MM, PLACEHOLDER, WALL_NAMES, CORNER_NAMES, WALL_START } from './geometry.mjs';

const $ = (id) => document.getElementById(id);
// replaceChildren would print null and arrays as text.
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
const state = { data: null, section: 'room', study: null, rev: null, playing: false, time: 0, chat: [], chatOk: true, chatSeen: 0, photoOpen: null };
const viewer = new Viewer($('model'));

const SECTIONS = [['room', 'Room'], ['talk', 'Talk'], ['studies', 'Studies'], ['measure', 'Measure'], ['photos', 'Photos'], ['items', 'Items'], ['plan', 'Plan']];
const VIEWS = [['orbit', 'Orbit'], ['plan', 'Plan'], ['inside', 'Inside']];
const CATEGORY = { keep: 'Keep, visible', hidden: 'Keep, out of sight', automation: 'Automation hardware', build: 'To build', leaving: 'Leaving the room' };
const FIXED_KINDS = ['door', 'window', 'socket', 'switch', 'radiator', 'pipe', 'beam', 'light', 'other'];

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 3500);
}

async function api(method, route, body, raw) {
  const res = await fetch(`/api/${route}`, {
    method,
    headers: { 'X-Room-Studio': '1', ...(raw ? {} : body ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { location.href = '/login'; throw new Error('Log in again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
  return data;
}
const guarded = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message); } };

/* --- navigation --- */
function renderRail() {
  const unread = state.chat.filter((m) => m.from === 'agent').length > state.chatSeen && state.section !== 'talk';
  fill($('rail'), SECTIONS.map(([id, name]) => h('button', {
    type: 'button', 'aria-current': String(state.section === id), onclick: () => go(id),
  }, name, id === 'talk' && unread ? h('span', { class: 'dot', title: 'New reply' }) : null)));
}
function go(section) {
  state.section = section;
  state.photoOpen = null;
  renderRail();
  renderSheet();
}
function renderViews() {
  fill($('viewbar'), VIEWS.map(([id, name]) => h('button', {
    type: 'button', 'aria-pressed': String(viewer.view === id),
    onclick: () => { viewer.setCamera(id); renderViews(); },
  }, name)));
}

/* --- sheet --- */
const RENDER = { talk: renderTalk, studies: renderStudies, measure: renderMeasure, photos: renderPhotos, items: renderItems, plan: renderPlan };
function renderSheet() {
  const sheet = $('sheet');
  const fn = RENDER[state.section];
  sheet.hidden = !fn;
  sheet.className = state.section === 'talk' ? 'talk' : '';
  if (fn) fn(sheet);
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* --- talk --- */
function renderTalk(sheet) {
  const log = h('div', { class: 'chatlog', id: 'chatlog', 'aria-live': 'polite' });
  const input = h('textarea', { 'aria-label': 'Message', placeholder: 'Message your agent' });
  const send = guarded(async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const msg = await api('POST', 'chat', { text });
    if (!msg.delivered) toast('Saved, but it did not reach the agent. Ask the operator on Discord to wake it.');
    await refreshChat();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  fill(sheet, 
    h('h2', {}, 'Talk'),
    h('p', { class: 'quiet' }, 'This is your Discord channel with the agent. Money and anything outward still needs a message from Discord itself.'),
    log,
    h('div', { class: 'composer' }, input, h('button', { type: 'button', class: 'btn', onclick: send }, 'Send')),
  );
  paintChat();
  state.chatSeen = state.chat.filter((m) => m.from === 'agent').length;
  renderRail();
}
function paintChat() {
  const log = $('chatlog');
  if (!log) return;
  const stuck = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const kids = state.chat.map((m) => h('div', { class: `bubble ${m.from}` }, m.text,
    (m.attachments || []).map((a) => h('div', {}, h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer' }, a.name))),
    h('small', {}, `${fmtTime(m.at)}${m.via === 'discord' ? ', on Discord' : ''}`)));
  if (!state.chatOk) kids.push(h('p', { class: 'check bad' }, 'The channel could not be read just now, so recent replies may be missing.'));
  fill(log, kids);
  if (stuck) log.scrollTop = log.scrollHeight;
}
const refreshChat = async () => {
  const r = await api('GET', 'chat');
  state.chatOk = r.ok;
  // Messages that failed to mirror into the channel exist only locally; keep them visible.
  const merged = [...r.messages, ...r.local].sort((a, b) => new Date(a.at) - new Date(b.at));
  const changed = merged.length !== state.chat.length || merged.at(-1)?.id !== state.chat.at(-1)?.id;
  state.chat = merged;
  if (state.section === 'talk') state.chatSeen = merged.filter((m) => m.from === 'agent').length;
  if (changed) { paintChat(); renderRail(); }
};

/* --- studies --- */
function renderStudies(sheet) {
  const studies = state.data.studies;
  const open = state.study && studies.find((s) => s.id === state.study);
  if (open) return renderStudyDetail(sheet, open);
  fill(sheet, 
    h('h2', {}, 'Studies'),
    h('p', { class: 'quiet' }, 'Low-res block models and motion. Check that I understood you before anything gets detailed.'),
    studies.length ? h('ul', { class: 'listing' }, [...studies].reverse().map((s) => h('li', {},
      h('button', { type: 'button', class: 'pick', onclick: () => openStudy(s.id) },
        h('strong', {}, s.title),
        h('span', { class: `tag ${s.status === 'approved' ? 'approved' : ''}` }, s.status === 'approved' ? 'Approved' : `Revision ${s.revisions.length}`))))) : h('p', {}, 'No studies yet. Describe a piece in Talk and one will appear here.'),
  );
}
function renderStudyDetail(sheet, s) {
  const rev = s.revisions[state.rev - 1];
  fill(sheet, 
    h('button', { type: 'button', class: 'btn line small', onclick: closeStudy }, 'All studies'),
    h('h2', {}, s.title),
    rev.understanding ? h('p', {}, rev.understanding) : null,
    s.revisions.length > 1 ? h('label', {}, 'Revision', h('select', { onchange: (e) => openStudy(s.id, Number(e.target.value)) },
      s.revisions.map((r) => h('option', { value: r.rev, selected: r.rev === state.rev }, `${r.rev}: ${fmtTime(r.at)}`)))) : null,
    h('div', { class: 'row' },
      s.status === 'approved'
        ? h('button', { type: 'button', class: 'btn line', onclick: guarded(() => review(s.id, 'open')) }, 'Reopen')
        : h('button', { type: 'button', class: 'btn', onclick: guarded(() => review(s.id, 'approved')) }, 'This is what I mean')),
    h('p', { class: 'quiet' }, 'If something is off, stop on the wrong moment and press Draw. I get that exact frame and time.'),
    h('h3', {}, 'Parts'),
    h('ul', { class: 'listing' }, rev.blocks.map((b) => h('li', {}, `${b.label || b.id}: ${b.size.join(' x ')} mm`))),
  );
}
async function review(id, status) {
  await api('POST', `studies/${id}/review`, { status });
  toast(status === 'approved' ? 'Approved' : 'Reopened');
  await refresh(true);
}
function openStudy(id, rev) {
  const s = state.data.studies.find((x) => x.id === id);
  state.study = id;
  state.rev = rev || s.revisions.length;
  state.time = 0;
  state.playing = false;
  document.body.classList.add('has-study');
  viewer.setStudy(s, s.revisions[state.rev - 1]);
  renderViews();
  renderPlayer();
  renderSheet();
}
function closeStudy() {
  state.study = null;
  state.playing = false;
  document.body.classList.remove('has-study');
  viewer.setStudy(null, null);
  renderViews();
  renderPlayer();
  renderSheet();
}
function currentRev() {
  const s = state.data?.studies.find((x) => x.id === state.study);
  return s ? s.revisions[state.rev - 1] : null;
}
function captionAt(rev, t) {
  let text = '';
  for (const c of [...(rev.captions || [])].sort((a, b) => a.t - b.t)) if (c.t <= t) text = c.text;
  return text;
}
function renderPlayer() {
  const p = $('player');
  const rev = currentRev();
  p.hidden = !rev;
  if (!rev) return;
  const duration = rev.duration || 0;
  const cap = h('div', { class: 'caption' }, captionAt(rev, state.time));
  const clock = h('span', {}, `${state.time.toFixed(1)} s`);
  const range = h('input', { type: 'range', min: 0, max: duration, step: 0.01, value: state.time, 'aria-label': 'Animation time',
    oninput: (e) => { state.playing = false; setPlayLabel(); seek(Number(e.target.value)); } });
  const play = h('button', { type: 'button', onclick: () => {
    state.playing = !state.playing;
    if (state.playing && state.time >= duration) state.time = 0;
    setPlayLabel();
    last = performance.now();
    if (state.playing) requestAnimationFrame(tick);
  } }, 'Play');
  const setPlayLabel = () => { play.textContent = state.playing ? 'Pause' : 'Play'; };
  const seek = (t) => {
    state.time = t;
    viewer.setTime(t);
    range.value = t;
    clock.textContent = `${t.toFixed(1)} s`;
    cap.textContent = captionAt(rev, t);
  };
  let last = 0;
  const tick = (now) => {
    if (!state.playing || currentRev() !== rev) return;
    const t = state.time + (now - last) / 1000;
    last = now;
    if (t >= duration) { seek(duration); state.playing = false; setPlayLabel(); return; }
    seek(t);
    requestAnimationFrame(tick);
  };
  fill(p, cap, duration > 0 ? h('div', { class: 'controls' }, play, range, clock) : null);
}

/* --- measure --- */
function numField(labelText, value, name, ph) {
  return h('label', {}, labelText, h('input', { type: 'number', inputmode: 'numeric', min: 0, name, value: value ?? '', placeholder: ph }));
}
function planDiagram() {
  const svg = (tag, attrs, text) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text) el.textContent = text;
    return el;
  };
  const root = svg('svg', { viewBox: '0 0 220 150', class: 'plan-svg', role: 'img', 'aria-label': 'Floor plan with north at the top, corners NW, NE, SE and SW, and the two diagonals' });
  root.append(svg('rect', { x: 42, y: 34, width: 134, height: 86, fill: 'none', stroke: '#1c2925', 'stroke-width': 2.5 }));
  root.append(svg('path', { d: 'M42 34 L176 120 M176 34 L42 120', stroke: '#4c5d57', 'stroke-dasharray': '4 4' }));
  for (const [t, x, y] of [['North', 92, 16], ['NW', 12, 34], ['NE', 182, 34], ['SE', 182, 134], ['SW', 12, 134]]) root.append(svg('text', { x, y, 'font-size': 17, 'font-weight': 600, fill: '#1c2925' }, t));
  return root;
}
function fixedEntry(f) {
  const e = h('div', { class: 'fixed-entry', 'data-fixed': f.id || '' });
  const startText = (wall) => `From the ${WALL_START[wall] || 'first corner'}, mm`;
  const startLabel = numField(startText(f.wall), f.offset, 'offset');
  e.append(
    h('div', { class: 'grid2' },
      h('label', {}, 'What', h('select', { name: 'kind' }, FIXED_KINDS.map((k) => h('option', { value: k, selected: k === f.kind }, k)))),
      h('label', {}, 'Wall', h('select', { name: 'wall', onchange: (ev) => { startLabel.firstChild.textContent = startText(ev.target.value); } }, Object.entries(WALL_NAMES).map(([w, name]) => h('option', { value: w, selected: w === f.wall }, name))))),
    h('div', { class: 'grid2' },
      startLabel,
      numField('Width, mm', f.width, 'width'),
      numField('Height above floor, mm', f.bottom, 'bottom'),
      numField('Its height, mm', f.height, 'height'),
      numField('Sticks out, mm', f.depth, 'depth')),
    h('label', {}, 'Note', h('input', { name: 'note', value: f.note || '', placeholder: 'Swings inward, hinge on the left' })),
    h('button', { type: 'button', class: 'btn danger small', onclick: () => e.remove() }, 'Remove'),
  );
  return e;
}
function renderMeasure(sheet) {
  const r = state.data.room;
  const res = resolveRoom(r);
  const walls = r.walls || {}; const diag = r.diagonals || {}; const hs = r.heights || {};
  const fixedBox = h('div', {}, (r.fixed || []).map(fixedEntry));
  const form = h('form', { onsubmit: guarded(async (e) => {
    e.preventDefault();
    const v = (name) => form.querySelector(`[name="${name}"]`).value;
    await api('PUT', 'room', {
      walls: { ab: v('ab'), bc: v('bc'), cd: v('cd'), da: v('da') },
      diagonals: { ac: v('ac'), bd: v('bd') },
      heights: { a: v('h-a'), b: v('h-b'), c: v('h-c'), d: v('h-d') },
      fixed: [...fixedBox.children].map((el) => Object.fromEntries(['kind', 'wall', 'offset', 'width', 'bottom', 'height', 'depth', 'note'].map((n) => [n, el.querySelector(`[name="${n}"]`).value])).valueOf()),
      notes: v('notes'),
    });
    await refresh(true);
    const c = resolveRoom(state.data.room);
    toast(c.check?.errorMm != null ? `Measurements saved. ${c.check.ok ? 'They agree' : 'They disagree'}: NE to SW is ${Math.round(c.check.errorMm)} mm off.` : 'Measurements saved');
  }) },
    h('h3', {}, 'Walls'),
    h('p', {}, 'Use your phone compass. The wall closest to north is the North wall, and the others follow. All numbers in millimetres.'),
    planDiagram(),
    h('div', { class: 'grid2' },
      numField('North wall', walls.ab, 'ab', PLACEHOLDER.walls.ab), numField('East wall', walls.bc, 'bc', PLACEHOLDER.walls.bc),
      numField('South wall', walls.cd, 'cd', PLACEHOLDER.walls.cd), numField('West wall', walls.da, 'da', PLACEHOLDER.walls.da)),
    h('h3', {}, 'Diagonals'),
    h('p', {}, 'These fix the true shape, because no room is exactly square. The second one checks the others.'),
    h('div', { class: 'grid2' }, numField('NW to SE', diag.ac, 'ac'), numField('NE to SW', diag.bd, 'bd')),
    checkBox(res),
    h('h3', {}, 'Ceiling height at each corner'),
    h('div', { class: 'grid2' }, ['a', 'b', 'c', 'd'].map((k) => numField(CORNER_NAMES[k], hs[k], `h-${k}`, PLACEHOLDER.height))),
    h('h3', {}, 'Fixed to the walls'),
    h('p', {}, 'Doors, windows, sockets, radiators, pipes, beams. Each one shows which end of the wall to measure from.'),
    fixedBox,
    h('button', { type: 'button', class: 'btn line small', onclick: () => fixedBox.append(fixedEntry({ wall: 'ab', kind: 'door' })) }, 'Add one'),
    h('h3', {}, 'Anything else'),
    h('label', {}, 'Which walls take screws or heavy loads, where cables can run, a room that is not four-sided', h('textarea', { name: 'notes' }, r.notes || '')),
    h('button', { class: 'btn' }, 'Save measurements'),
  );
  fill(sheet, h('h2', {}, 'Measure'), form);
}
function checkBox(res) {
  if (res.warnings.length) return h('p', { class: 'check bad' }, res.warnings.join(' '));
  const c = res.check;
  if (!c) return null;
  if (c.errorMm === null) return h('p', { class: 'check' }, `Add NE to SW to check the numbers. They predict ${Math.round(c.predicted)} mm.`);
  return c.ok
    ? h('p', { class: 'check' }, `Numbers agree: NE to SW is ${Math.round(c.errorMm)} mm from what the others predict.`)
    : h('p', { class: 'check bad' }, `NE to SW is ${Math.round(c.errorMm)} mm from the predicted ${Math.round(c.predicted)} mm, over the ${CHECK_TOLERANCE_MM} mm limit. Measure again; a skirting board or a tilted laser is the usual cause.`);
}

/* --- photos --- */
async function shrink(file) {
  // Re-encoding drops EXIF location and turns iPhone HEIC into something every browser can show.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image.'))), 'image/jpeg', 0.88));
}
function renderPhotos(sheet) {
  if (state.photoOpen) {
    const p = state.data.photos.find((x) => x.id === state.photoOpen);
    if (p) {
      const src = `/files/photos/${p.file}`;
      fill(sheet, 
        h('button', { type: 'button', class: 'btn line small', onclick: () => { state.photoOpen = null; renderSheet(); } }, 'All photos'),
        h('h2', {}, p.label || 'Photo'),
        h('img', { class: 'big-photo', src, alt: p.label || 'Room photo' }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: guarded(() => drawOnPhoto(p, src)) }, 'Draw on this photo'),
          h('button', { type: 'button', class: 'btn danger', onclick: guarded(async () => { await api('DELETE', `photos/${p.id}`); state.photoOpen = null; toast('Photo removed'); await refresh(true); }) }, 'Remove')),
      );
      return;
    }
  }
  const label = h('input', { placeholder: 'North wall with the desk', 'aria-label': 'What the photos show' });
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, 'aria-label': 'Choose photos', onchange: guarded(async (e) => {
    const files = [...e.target.files];
    let done = 0;
    for (const f of files) {
      toast(`Uploading ${done + 1} of ${files.length}`);
      await api('POST', `photos?label=${encodeURIComponent(label.value)}`, await shrink(f), true);
      done += 1;
    }
    toast(`Uploaded ${done} ${done === 1 ? 'photo' : 'photos'}`);
    await refresh(true);
  }) });
  fill(sheet, 
    h('h2', {}, 'Photos'),
    h('p', {}, 'Show how things sit today, so you don\'t have to describe it.'),
    h('label', {}, 'What these show', label),
    h('label', {}, 'Add photos', file),
    state.data.photos.length ? h('div', { class: 'photos' }, [...state.data.photos].reverse().map((p) => h('figure', {},
      h('button', { type: 'button', class: 'pick', onclick: () => { state.photoOpen = p.id; renderSheet(); } }, h('img', { src: `/files/photos/${p.file}`, alt: p.label || 'Room photo', loading: 'lazy' })),
      p.label ? h('figcaption', {}, p.label) : null))) : null,
  );
}
async function drawOnPhoto(p, src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  startDraw({ url: src, width: img.naturalWidth, height: img.naturalHeight, kind: 'photo', meta: { photo: p.id, label: p.label } });
}

/* --- items --- */
function itemForm(item, onDone) {
  const form = h('form', { onsubmit: guarded(async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (item) await api('PUT', `items/${item.id}`, body); else await api('POST', 'items', body);
    toast(item ? 'Item saved' : 'Item added');
    onDone();
    await refresh(true);
  }) },
    h('label', {}, 'Name', h('input', { name: 'name', required: true, value: item?.name || '' })),
    h('label', {}, 'What it is', h('select', { name: 'category' }, Object.entries(CATEGORY).map(([k, v]) => h('option', { value: k, selected: item?.category === k }, v)))),
    h('div', { class: 'grid3' }, numField('Width, mm', item?.w, 'w'), numField('Depth, mm', item?.d, 'd'), numField('Height, mm', item?.h, 'h')),
    h('label', {}, 'What it needs', h('input', { name: 'needs', value: item?.needs || '', placeholder: 'Power, airflow, reach once a week' })),
    h('label', {}, 'Notes', h('textarea', { name: 'notes' }, item?.notes || '')),
    h('div', { class: 'row' },
      h('button', { class: 'btn' }, item ? 'Save item' : 'Add item'),
      item ? h('button', { type: 'button', class: 'btn danger', onclick: guarded(async () => { await api('DELETE', `items/${item.id}`); onDone(); toast('Item removed'); await refresh(true); }) }, 'Remove') : null),
  );
  return form;
}
let itemEditing = null;
function renderItems(sheet) {
  const items = state.data.items;
  const close = () => { itemEditing = null; renderSheet(); };
  if (itemEditing) {
    const it = itemEditing === 'new' ? null : items.find((i) => i.id === itemEditing);
    fill(sheet, h('button', { type: 'button', class: 'btn line small', onclick: close }, 'All items'), h('h2', {}, it ? it.name : 'Add an item'), itemForm(it, close));
    return;
  }
  const groups = Object.entries(CATEGORY).map(([k, name]) => [name, items.filter((i) => i.category === k)]).filter(([, l]) => l.length);
  fill(sheet, 
    h('h2', {}, 'Items'),
    h('p', {}, 'Everything that has to live in the room, including what should never be seen.'),
    h('button', { type: 'button', class: 'btn', onclick: () => { itemEditing = 'new'; renderSheet(); } }, 'Add an item'),
    groups.flatMap(([name, list]) => [h('h3', {}, name), h('ul', { class: 'listing' }, list.map((i) => h('li', {},
      h('button', { type: 'button', class: 'pick', onclick: () => { itemEditing = i.id; renderSheet(); } },
        h('strong', {}, i.name),
        i.w && i.d && i.h ? `${i.w} x ${i.d} x ${i.h} mm` : 'No size yet'))))]),
  );
}

function renderPlan(sheet) {
  fill(sheet, markdown(state.data.outline || 'The outline is missing.'), h('form', { method: 'post', action: '/logout' }, h('button', { class: 'btn line small' }, 'Log out')));
}

/* --- draw --- */
function startDraw(source) {
  openDraw($('draw'), source, {
    onSend: async (payload) => {
      try {
        await api('POST', 'drawings', payload);
        toast('Sent to agent');
      } catch (e) { toast(e.message); throw e; }
    },
  });
}
$('draw-btn').addEventListener('click', () => {
  const shot = viewer.capture();
  const rev = currentRev();
  startDraw({ ...shot, kind: rev ? 'study-frame' : 'view', meta: rev
    ? { study: state.study, rev: state.rev, time: Number(state.time.toFixed(2)), view: shot.view, floorCoordinates: rev.place ? 'room' : 'study' }
    : { view: shot.view, floorCoordinates: 'room' } });
});

/* --- sync --- */
function applyWorld() {
  const d = state.data;
  viewer.setWorld(d.room, d.items);
  const res = resolveRoom(d.room);
  const banner = $('banner');
  banner.hidden = !res.isPlaceholder || Boolean(state.study);
  banner.textContent = 'Placeholder room: these are not your dimensions yet.';
}
async function refresh(force) {
  const { rev } = await api('GET', 'rev');
  if (!force && state.data && rev === state.data.rev) return;
  const prev = state.data;
  const data = await api('GET', 'state');
  state.data = data;
  const worldKey = JSON.stringify([data.room, data.items]);
  if (worldKey !== refresh.world) { refresh.world = worldKey; applyWorld(); renderViews(); }
  const prevCount = prev?.studies.reduce((n, s) => n + s.revisions.length, 0) ?? 0;
  const nowCount = data.studies.reduce((n, s) => n + s.revisions.length, 0);
  if (prev && nowCount > prevCount) toast('New study ready');
  // Keep an open form intact when something changes in the background.
  const active = document.activeElement;
  if (!($('sheet').contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName))) renderSheet();
}

async function start() {
  await document.fonts.ready.catch(() => {});
  renderRail();
  renderViews();
  await refresh(true);
  await refreshChat().catch(() => {});
  setInterval(() => refresh().catch(() => {}), 4000);
  setInterval(() => { refreshChat().catch(() => {}); }, 5000);
  window.roomStudio = { viewer, state };
}
start().catch((e) => toast(e.message));

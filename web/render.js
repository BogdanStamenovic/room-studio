// The render page. Three ways to see the same design, best looking first:
//   Stills and Look around show images path-traced ahead of time, so a phone sees the real quality.
//   Orbit draws live. Refine path-traces the current orbit view on the viewer's own GPU, where it can.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, setView, VIEWS, P } from './hifi/scene.mjs';
import { Raster, pickTier } from './hifi/raster.mjs';
import { VARIANTS } from './hifi/plan.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v); } e.append(...kids); return e; };
const params = new URLSearchParams(location.search);
const scripted = params.has('scripted');
const ui = { mode: 'stills', variant: 'corner', fold: 0, still: 0, manifest: { stills: [], panos: [] } };
let state = null;
let sharedMaterials = null;

async function loadState() {
  const r = await fetch('/api/state');
  if (!r.ok) throw new Error(`state ${r.status}`);
  state = await r.json();
}

/* --- scripted hooks, used by scripts/render-stills.mjs and the tests --- */
window.hifi = {
  ready: loadState(),
  /** One path-traced image, returned as data URLs. */
  async renderPT({ variant = 'corner', fold = 0, flapOpen = 0, view = 'hero', viewOverride, samples = 64, duty = 1, width = 1280, height = 720, bounces = 7, textureSize = 1024, exposure = 2.6, tone = 'neutral', equirect = null, denoise = null, jpeg = 0.9, lighting = 'day' }) {
    const { PathTrace } = await import('./hifi/pt.mjs');
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const t0 = performance.now();
    const b = buildScene(state, { variant, fold, flapOpen, forPathTracer: true, lighting, M: sharedMaterials });
    sharedMaterials = b.materials;
    const buildMs = performance.now() - t0;
    let camera = new THREE.PerspectiveCamera(58, width / height, 0.02, 60);
    if (equirect) {
      const { EquirectCamera } = await import('three-gpu-pathtracer');
      camera = new EquirectCamera();
      camera.position.copy(P(...equirect));
      camera.updateMatrixWorld(true);
    } else {
      setView(camera, view, viewOverride);
    }
    const pt = await PathTrace.create(c, b, camera, { bounces, textureSize, exposure, tone, size: [width, height] });
    const { ms, firstMs } = await pt.run(samples, { duty });
    if (denoise) await pt.finish(denoise);
    const url = c.toDataURL('image/png');
    const jpg = c.toDataURL('image/jpeg', jpeg);
    pt.dispose();
    let tris = 0;
    b.scene.traverse((o) => { if (o.isMesh && o.visible) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return { url, jpg, ms, firstMs, buildMs, sceneMs: pt.buildMs, tris };
  },
  /** One rasterized frame of the live mode, with a real frame time. */
  async renderRaster({ variant = 'corner', fold = 0, flapOpen = 0, view = 'hero', tier = 'high', width = 1280, height = 720, frames = 12 }) {
    const c = document.createElement('canvas');
    c.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;visibility:hidden`;
    document.body.append(c);
    const b = buildScene(state, { variant, fold, flapOpen, M: sharedMaterials });
    sharedMaterials = b.materials;
    const r = new Raster(c, b, { tier });
    const v = VIEWS[view];
    r.setView(P(...v.pos), P(...v.at), v.fov);
    r.timing = true;
    const times = [];
    for (let i = 0; i < frames; i++) { r.render(); times.push(r.frameMs); await new Promise((q) => setTimeout(q, 0)); }
    times.sort((a, x) => a - x);
    const url = c.toDataURL('image/png');
    const jpg = c.toDataURL('image/jpeg', 0.9);
    const info = { url, jpg, frameMs: times[times.length >> 1], maxMs: times[times.length - 1], tier: r.tier };
    r.dispose();
    r.renderer.forceContextLoss();
    c.remove();
    return info;
  },
};

/* --- live orbit --- */
let canvas = null;
let raster = null;
let looping = false;
let slowFrames = 0;

/** Each WebGL mode gets its own canvas, so one mode's context state never reaches the next. */
function newCanvas() {
  dropCanvas();
  canvas = el('canvas', { id: 'r3d', 'aria-label': 'Rendered view of the room' });
  $('still').before(canvas);
  return canvas;
}
function dropCanvas() { canvas?.remove(); canvas = null; }

function disposeRaster() {
  if (!raster) return;
  raster.dispose();
  raster.renderer.forceContextLoss();
  raster = null;
}

function orbitDefaults() {
  const v = VIEWS[ui.variant === 'south' ? 'heroSouth' : 'hero'];
  return { pos: P(...v.pos), at: P(...v.at), fov: v.fov };
}

function ensureRaster(keepView = false) {
  const prev = raster && keepView ? { pos: raster.camera.position.clone(), at: raster.controls.target.clone(), fov: raster.baseFov } : null;
  disposeRaster();
  newCanvas();
  try {
    const built = buildScene(state, { variant: ui.variant, fold: ui.fold, M: sharedMaterials });
    sharedMaterials = built.materials;
    raster = new Raster(canvas, built, { tier: params.get('tier') || pickTier() });
  } catch (e) {
    // No WebGL, or it died: the stills still work, so point there instead of showing nothing.
    setMode('stills');
    status(`Live 3D is not available on this device (${e.message}). The stills still work.`);
    return;
  }
  const v = prev || orbitDefaults();
  raster.setView(v.pos, v.at, v.fov);
  raster.controls.addEventListener('start', stopRefine);
  raster.timing = true;
  if (!looping) { looping = true; requestAnimationFrame(loop); }
}

function loop() {
  if (ui.mode !== 'orbit' || !raster) { looping = false; return; }
  requestAnimationFrame(loop);
  const wasDirty = raster.dirty;
  raster.frame();
  // A device that passed the tier guess but cannot hold a usable rate drops the expensive passes once.
  if (wasDirty && raster.tier === 'high' && raster.frameMs > 70 && ++slowFrames > 8) {
    slowFrames = 0;
    params.set('tier', 'low');
    status('Dropped ambient occlusion and the live mirror to keep this smooth.');
    ensureRaster(true);
  }
}

window.addEventListener('resize', () => { raster?.resize(); pano?.resize(); });

/* --- look around: a path-traced 360 --- */
let pano = null;
function showPano(entry) {
  pano?.dispose();
  newCanvas();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 10);
  const scene = new THREE.Scene();
  const sphere = new THREE.SphereGeometry(5, 64, 40);
  sphere.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  scene.add(new THREE.Mesh(sphere, material));
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; controls.enablePan = false; controls.rotateSpeed = -0.35; controls.enableDamping = true;
  const dir = new THREE.Vector3(...(entry.look || [1, 0, 0])).normalize();
  camera.position.copy(dir).multiplyScalar(-0.01);
  controls.target.set(0, 0, 0);
  const resize = () => {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 92 : 70;
    camera.updateProjectionMatrix();
  };
  resize();
  status('Loading the 360...');
  new THREE.TextureLoader().load(`/files/renders/${entry.file}`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    material.map = t; material.needsUpdate = true;
    status('');
  }, undefined, () => status('That image did not load.'));
  let alive = true;
  const tick = () => { if (!alive) return; requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); };
  tick();
  pano = {
    resize,
    dispose() { alive = false; controls.dispose(); material.map?.dispose(); material.dispose(); sphere.dispose(); renderer.dispose(); renderer.forceContextLoss(); pano = null; },
  };
}

/* --- refine --- */
let refine = null;
async function startRefine() {
  if (refine || !raster) return;
  const { PathTrace, canPathTrace } = await import('./hifi/pt.mjs');
  if (!canPathTrace()) { status('This device cannot path trace live. The stills are already path traced.'); return; }
  const p = raster.camera.position;
  const inside = p.x > 0 && p.x < 2.667 && p.z < 0 && p.z > -5.019 && p.y > 0 && p.y < 2.58;
  if (!inside) { status('Refine works from inside the room: walls are real to the path tracer. Pick a view first.'); return; }
  const overlay = el('canvas', { id: 'r-refine' });
  canvas.after(overlay);
  const session = { stop: false, overlay, pt: null };
  refine = session;
  try {
    status('Preparing the path tracer...');
    overlay.width = overlay.clientWidth; overlay.height = overlay.clientHeight;
    overlay.addEventListener('webglcontextlost', (e) => { e.preventDefault(); session.stop = true; status('The GPU gave up on path tracing. The stills are already path traced.'); });
    overlay.addEventListener('pointerdown', stopRefine);
    const built = buildScene(state, { variant: ui.variant, fold: ui.fold, forPathTracer: true, M: sharedMaterials });
    const cam = raster.camera.clone();
    cam.updateMatrixWorld(true);
    session.pt = await PathTrace.create(overlay, built, cam, { exposure: 2.6, tone: 'neutral', size: [overlay.width, overlay.height] });
    const scale = Math.min(1, 1280 / overlay.width);
    session.pt.pt.renderScale = scale;
    await session.pt.run(1500, {
      shouldStop: () => session.stop,
      onProgress: (n) => { if (n % 10 === 0) status(`Refining: ${n} samples. Touch the view to go back.`); },
    });
    if (!session.stop) status('Refined. Touch the view to go back.');
  } catch (e) {
    status(`Path tracing failed here (${e.message}). The stills are already path traced.`);
    stopRefine();
  }
}
function stopRefine() {
  if (!refine) return;
  refine.stop = true;
  try { refine.pt?.dispose(); } catch { /* it may have died already */ }
  refine.overlay.remove();
  refine = null;
  status('');
}

/* --- page --- */
function status(text) { $('r-status').textContent = text; }

function setMode(mode) {
  stopRefine();
  pano?.dispose();
  disposeRaster();
  dropCanvas();
  ui.mode = mode;
  document.body.dataset.mode = mode;
  $('still').hidden = mode !== 'stills';
  status('');
  if (mode === 'orbit') ensureRaster();
  if (mode === 'look') {
    const p = ui.manifest.panos.find((x) => x.variant === ui.variant);
    if (p) showPano(p);
  }
  render();
}

function stillsFor() {
  return ui.manifest.stills.filter((s) => !s.variant || s.variant === ui.variant);
}

function render() {
  const modeBtn = (id, name, disabled) => el('button', { type: 'button', 'aria-pressed': String(ui.mode === id), ...(disabled ? { disabled: '' } : {}), onclick: () => setMode(id) }, name);
  const variantBtn = (id, name) => el('button', { type: 'button', 'aria-pressed': String(ui.variant === id), title: VARIANTS[id].title, onclick: () => { ui.variant = id; ui.still = 0; setMode(ui.mode); } }, name);
  const top = $('r-top');
  top.replaceChildren(
    el('a', { href: '/' }, 'Back'),
    el('span', { class: 'group' }, modeBtn('stills', 'Stills'), modeBtn('look', 'Look around', !ui.manifest.panos.length), modeBtn('orbit', 'Orbit')),
    el('span', { class: 'group' }, variantBtn('corner', 'Box in corner'), variantBtn('south', 'Box south')),
  );
  const bar = $('r-views');
  if (ui.mode === 'stills') {
    const list = stillsFor();
    ui.still = Math.min(ui.still, Math.max(0, list.length - 1));
    bar.replaceChildren(...list.map((s, i) => el('button', { type: 'button', 'aria-pressed': String(i === ui.still), onclick: () => { ui.still = i; render(); } }, s.label)));
    const s = list[ui.still];
    const img = $('still');
    if (s) { img.src = `/files/renders/${s.file}`; img.alt = s.label; } else { img.removeAttribute('src'); status('No renders on this server yet. Orbit still works.'); }
  } else if (ui.mode === 'look') {
    const list = ui.manifest.panos.filter((p) => p.variant === ui.variant);
    bar.replaceChildren(...list.map((p) => el('span', { class: 'r-note' }, p.label)));
  } else {
    const slider = el('input', { type: 'range', min: '0', max: '100', value: String(ui.fold * 100), 'aria-label': 'Fold the seat', oninput: (e) => { ui.fold = e.target.value / 100; raster?.built.platform.userData.setFold(ui.fold); if (raster) raster.dirty = true; } });
    const go = (name) => { const v = VIEWS[name]; raster?.setView(P(...v.pos), P(...v.at), v.fov); };
    bar.replaceChildren(
      el('label', { class: 'r-fold' }, 'Open', slider, 'Folded'),
      ...['hero', 'heroSouth', 'foot', 'windows', 'mirror', 'box', 'flap'].map((n) => el('button', { type: 'button', onclick: () => go(n) }, VIEWS[n].label)),
      el('button', { type: 'button', onclick: () => raster?.setView(P(4600, -1800, 5200), P(1333, 2500, 900), 42) }, 'From outside'),
      el('button', { type: 'button', onclick: startRefine }, 'Refine'),
    );
  }
}

async function start() {
  await window.hifi.ready;
  try {
    const r = await fetch('/files/renders/manifest.json');
    if (r.ok) ui.manifest = await r.json();
  } catch { /* no renders yet: the page says so */ }
  setMode(params.get('mode') || (ui.manifest.stills.length ? 'stills' : 'orbit'));
}
if (!scripted) start().catch((e) => status(`Could not load the room: ${e.message}`));

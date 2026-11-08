import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { resolveRoom, poseAt } from './geometry.mjs';

const C = { mat: 0x17483b, fine: 0x2b6250, coarse: 0x57957f, chalk: 0xeef3ea, wall: 0xdfe8df, edge: 0x1c2925, door: 0xb98a55, window: 0x8cc6d8, fixture: 0xc4ccc4 };
const FOAM = ['#e9efe6', '#c9dccf', '#b8cdd8', '#e3d3b5', '#d8c3d0', '#c4d0a9'];
const ITEM_COLOR = { keep: '#b8cdd8', hidden: '#d8c3d0', automation: '#f5b700', build: '#e3d3b5', leaving: '#9aa59f' };

function label(text, { color = '#eef3ea', bg = 'rgba(15,51,41,.88)', size = 200 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = "600 44px Barlow, sans-serif";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = 64;
  ctx.font = font;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((size * w) / 64, size, 1);
  s.renderOrder = 10;
  return s;
}

function box(size, color) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: C.edge })));
  return mesh;
}

function disposeTree(o) {
  o.traverse((n) => {
    n.geometry?.dispose();
    if (n.material) { n.material.map?.dispose(); n.material.dispose(); }
  });
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    // preserveDrawingBuffer lets the Draw tool grab the exact frame on screen.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.mat);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb5a8, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-3000, -5000, 8000);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.studyGroup = new THREE.Group();
    this.scene.add(this.world, this.studyGroup);
    this.persp = new THREE.PerspectiveCamera(50, 1, 100, 100000);
    this.persp.up.set(0, 0, 1);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 200000);
    this.ortho.up.set(0, 1, 0);
    this.view = 'orbit';
    this.camera = this.persp;
    this.walls = [];
    this.center = new THREE.Vector3(2000, 1750, 1000);
    this.radius = 3000;
    this.study = null;
    this.t = 0;
    this.setCamera('orbit');
    this.dirty = true;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.dirty) { this.dirty = false; this.render(); }
    };
    loop();
  }

  request() { this.dirty = true; }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth || 1;
    const h = p.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    this.fitOrtho();
    this.render();
  }

  fitOrtho() {
    const half = this.radius * 1.15;
    const hw = this.aspect >= 1 ? half * this.aspect : half;
    const hh = this.aspect >= 1 ? half : half / this.aspect;
    Object.assign(this.ortho, { left: -hw, right: hw, top: hh, bottom: -hh });
    this.ortho.updateProjectionMatrix();
  }

  setCamera(view) {
    this.view = view;
    this.controls?.dispose();
    const c = this.center;
    const r = this.radius;
    if (view === 'plan') {
      this.camera = this.ortho;
      this.ortho.zoom = 1;
      this.ortho.position.set(c.x, c.y, 50000);
      this.ortho.lookAt(c.x, c.y, 0);
      this.fitOrtho();
    } else {
      this.camera = this.persp;
      if (view === 'inside') {
        const corner = this.insidePoint();
        this.persp.position.set(corner.x, corner.y, 1600);
      } else {
        // Narrow viewports (a phone, or the sheet open) need more distance to fit the same room.
        const k = Math.max(1, 1.45 / Math.min(this.aspect || 1.5, 1.45)) ** 0.75;
        this.persp.position.set(c.x - r * 1.4 * k, c.y - r * 2.1 * k, c.z + r * 1.9 * k);
      }
    }
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(c.x, c.y, view === 'plan' ? 0 : view === 'inside' ? 1100 : c.z * 0.5);
    this.controls.enableDamping = false;
    if (view === 'plan') this.controls.enableRotate = false;
    this.controls.addEventListener('change', () => this.request());
    this.controls.update();
    this.request();
  }

  insidePoint() {
    const room = this.resolved;
    if (!room) return new THREE.Vector3(200, 200, 0);
    const [x, y] = room.corners[room.corners.length - 1];
    return new THREE.Vector3(x + (this.center.x - x) * 0.18, y + (this.center.y - y) * 0.18, 0);
  }

  frame(center, radius) {
    this.center.copy(center);
    this.radius = Math.max(radius, 400);
    this.setCamera(this.view === 'inside' ? 'orbit' : this.view);
  }

  setWorld(roomData, items = []) {
    disposeTree(this.world);
    this.world.clear();
    this.walls = [];
    const room = resolveRoom(roomData);
    this.resolved = room;
    const xs = room.corners.map((p) => p[0]);
    const ys = room.corners.map((p) => p[1]);
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    this.addMat(bounds);
    this.addFloor(room);
    for (const e of room.edges) this.addWall(e, room);
    for (const f of roomData.fixed || []) this.addFixed(f, room);
    for (const it of items) if (it.placed && it.w && it.d && it.h) this.addItem(it);
    if (!this.study) this.frameRoom();
    this.request();
  }

  frameRoom() {
    const room = this.resolved;
    if (!room) return;
    const xs = room.corners.map((p) => p[0]);
    const ys = room.corners.map((p) => p[1]);
    const c = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, room.maxHeight / 2);
    const r = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 300;
    this.world.visible = true;
    this.frame(c, r);
  }

  addMat({ minX, maxX, minY, maxY }) {
    const pad = 3000;
    const snap = (v, d) => Math.floor(v / d) * d;
    const x0 = snap(minX - pad, 1000); const x1 = snap(maxX + pad, 1000) + 1000;
    const y0 = snap(minY - pad, 1000); const y1 = snap(maxY + pad, 1000) + 1000;
    const fine = []; const coarse = [];
    for (let x = x0; x <= x1; x += 100) (x % 1000 === 0 ? coarse : fine).push(x, y0, -40, x, y1, -40);
    for (let y = y0; y <= y1; y += 100) (y % 1000 === 0 ? coarse : fine).push(x0, y, -40, x1, y, -40);
    const lines = (arr, color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
    };
    this.world.add(lines(fine, C.fine), lines(coarse, C.coarse));
  }

  addFloor(room) {
    const shape = new THREE.Shape(room.corners.map(([x, y]) => new THREE.Vector2(x, y)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: 0x8fa89a, side: THREE.DoubleSide }));
    mesh.position.z = -1;
    this.world.add(mesh);
    const pts = room.corners.map(([x, y]) => new THREE.Vector3(x, y, 2));
    const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: C.chalk }));
    this.world.add(loop);
    const n = room.corners.length;
    const cx = room.corners.reduce((s, p) => s + p[0], 0) / n;
    const cy = room.corners.reduce((s, p) => s + p[1], 0) / n;
    room.corners.forEach(([x, y], i) => {
      const s = label(room.letters[i].toUpperCase(), { size: 240, color: '#1c2925', bg: '#eef3ea' });
      const dx = x - cx; const dy = y - cy; const d = Math.hypot(dx, dy) || 1;
      s.position.set(x + (dx / d) * 280, y + (dy / d) * 280, 30);
      this.world.add(s);
    });
  }

  addWall(e, room) {
    const { p, q, h0, h1 } = e;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([p[0], p[1], 0, q[0], q[1], 0, q[0], q[1], h1, p[0], p[1], h0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: C.wall, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false }));
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p[0], p[1], 0), new THREE.Vector3(q[0], q[1], 0), new THREE.Vector3(q[0], q[1], h1), new THREE.Vector3(p[0], p[1], h0),
    ]), new THREE.LineBasicMaterial({ color: C.edge }));
    const group = new THREE.Group();
    group.add(mesh, outline);
    const dx = q[0] - p[0]; const dy = q[1] - p[1]; const len = e.length || 1;
    // Clockwise polygon: outward is to the left of the direction of travel.
    const outward = new THREE.Vector3(-dy / len, dx / len, 0);
    const mid = new THREE.Vector3((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0);
    group.userData = { outward, mid };
    this.walls.push(group);
    this.world.add(group);
    const text = e.measured ? `${e.name.toUpperCase()} ${Math.round(e.length)}` : `${e.name.toUpperCase()} about ${Math.round(e.length)}?`;
    const s = label(text, e.measured ? { size: 230 } : { size: 230, color: '#1c2925', bg: '#f5b700' });
    s.position.set(mid.x + outward.x * 260, mid.y + outward.y * 260, 40);
    this.world.add(s);
  }

  addFixed(f, room) {
    const edge = room.edges.find((e) => e.name === f.wall);
    if (!edge || f.offset == null || !f.width) return;
    const dx = (edge.q[0] - edge.p[0]) / edge.length;
    const dy = (edge.q[1] - edge.p[1]) / edge.length;
    const inX = dy; const inY = -dx;
    const depth = f.depth || (f.kind === 'door' || f.kind === 'window' ? 30 : 60);
    const height = f.height || 100;
    const bottom = f.bottom || 0;
    const color = f.kind === 'door' ? C.door : f.kind === 'window' ? C.window : C.fixture;
    const mesh = box([f.width, depth, height], color);
    mesh.position.set(
      edge.p[0] + dx * (f.offset + f.width / 2) + inX * depth / 2,
      edge.p[1] + dy * (f.offset + f.width / 2) + inY * depth / 2,
      bottom + height / 2,
    );
    mesh.rotation.z = Math.atan2(dy, dx);
    this.world.add(mesh);
    const s = label(f.kind, { size: 170 });
    s.position.copy(mesh.position);
    s.position.z = bottom + height + 90;
    this.world.add(s);
  }

  addItem(it) {
    const m = box([it.w, it.d, it.h], ITEM_COLOR[it.category] || FOAM[0]);
    m.position.set(it.placed.x, it.placed.y, (it.placed.z || 0) + it.h / 2);
    m.rotation.z = THREE.MathUtils.degToRad(it.placed.rot || 0);
    this.world.add(m);
    const s = label(it.name, { size: 130 });
    s.position.set(it.placed.x, it.placed.y, (it.placed.z || 0) + it.h + 110);
    this.world.add(s);
  }

  setStudy(study, rev) {
    disposeTree(this.studyGroup);
    this.studyGroup.clear();
    this.blockNodes = new Map();
    this.study = rev || null;
    this.studyId = study?.id || null;
    if (!rev) { this.frameRoom(); return; }
    rev.blocks.forEach((b, i) => {
      const node = new THREE.Group();
      const m = box(b.size, b.color || FOAM[i % FOAM.length]);
      if (b.pivot) m.position.set(-b.pivot[0], -b.pivot[1], -b.pivot[2]);
      node.add(m);
      if (b.label) {
        const s = label(b.label, { size: Math.max(60, Math.min(100, Math.max(...b.size) * 0.09)) });
        s.position.set(m.position.x, m.position.y, m.position.z + b.size[2] / 2 + 40);
        node.add(s);
      }
      this.blockNodes.set(b.id, { node, block: b });
    });
    for (const { node, block } of this.blockNodes.values()) {
      (block.parent ? this.blockNodes.get(block.parent).node : this.studyGroup).add(node);
    }
    if (rev.place) {
      this.world.visible = true;
      this.studyGroup.position.set(rev.place.x || 0, rev.place.y || 0, rev.place.z || 0);
      this.studyGroup.rotation.z = THREE.MathUtils.degToRad(rev.place.rot || 0);
    } else {
      this.world.visible = false;
      this.studyGroup.position.set(0, 0, 0);
      this.studyGroup.rotation.z = 0;
    }
    this.setTime(0);
    this.frameStudy(rev);
  }

  frameStudy(rev) {
    // Frame the whole motion, not just the first pose, so nothing swings out of shot.
    const box3 = new THREE.Box3();
    const d = rev.duration || 0;
    for (let i = 0; i <= 8; i++) {
      this.setTime((d * i) / 8);
      this.studyGroup.updateMatrixWorld(true);
      box3.expandByObject(this.studyGroup);
    }
    this.setTime(0);
    const s = box3.getBoundingSphere(new THREE.Sphere());
    if (rev.place) { this.request(); return; }
    this.frame(s.center, s.radius);
  }

  setTime(t) {
    this.t = t;
    if (!this.study) return;
    const frames = this.study.keyframes || {};
    for (const { node, block } of this.blockNodes.values()) {
      const pose = poseAt(block, frames[block.id], t);
      node.position.set(...pose.pos);
      node.rotation.set(...pose.rot.map(THREE.MathUtils.degToRad), 'ZYX');
    }
    this.request();
  }

  render() {
    if (this.view === 'plan') {
      for (const w of this.walls) w.visible = true;
    } else {
      const cam = this.camera.position;
      for (const w of this.walls) {
        const { outward, mid } = w.userData;
        // Dollhouse: a wall between the camera and the room is hidden.
        w.visible = (cam.x - mid.x) * outward.x + (cam.y - mid.y) * outward.y <= 0;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Freeze the current frame for the Draw tool, with a way to map strokes onto the floor. */
  capture() {
    this.render();
    const canvas = this.canvas;
    const cam = this.camera.clone();
    cam.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    return {
      url: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      view: this.view,
      toFloor: (u, v) => {
        ray.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), cam);
        const p = ray.ray.intersectPlane(plane, hit);
        return p ? [Math.round(p.x), Math.round(p.y)] : null;
      },
    };
  }
}

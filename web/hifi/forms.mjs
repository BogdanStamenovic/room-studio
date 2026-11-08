// Geometry that has real form: fillets, soft-edged slabs, cushions, cloth, climbing holds.
// All in millimetres, in room axes (+y north, z up).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Small seeded value noise, so every render of a cushion is the same cushion. */
export function noise3(x, y, z, seed = 0) {
  const h = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 53.3) * 43758.5453; return s - Math.floor(s); };
  const f = (t) => t * t * (3 - 2 * t);
  const i = Math.floor(x); const j = Math.floor(y); const k = Math.floor(z);
  const u = f(x - i); const v = f(y - j); const w = f(z - k);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(i, j, k), h(i + 1, j, k), u), l(h(i, j + 1, k), h(i + 1, j + 1, k), u), v),
    l(l(h(i, j, k + 1), h(i + 1, j, k + 1), u), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), u), v), w) * 2 - 1;
}

/** Corner-rounded polyline from [x, y, radius] vertices. Works for convex and concave corners alike. */
export function fillet(pts, chord = 12) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = pts[i];
    const [px, py] = pts[(i + n - 1) % n];
    const [qx, qy] = pts[(i + 1) % n];
    const al = Math.hypot(px - x, py - y); const bl = Math.hypot(qx - x, qy - y);
    const ax = (px - x) / al; const ay = (py - y) / al;
    const bx = (qx - x) / bl; const by = (qy - y) / bl;
    const phi = Math.acos(THREE.MathUtils.clamp(ax * bx + ay * by, -1, 1));
    if (r <= 0 || phi > Math.PI - 1e-3) { out.push(new THREE.Vector2(x, y)); continue; }
    const t = Math.min(r / Math.tan(phi / 2), al * 0.5, bl * 0.5);
    const rad = t * Math.tan(phi / 2);
    const mx = ax + bx; const my = ay + by; const ml = Math.hypot(mx, my);
    const cx = x + (mx / ml) * (rad / Math.sin(phi / 2));
    const cy = y + (my / ml) * (rad / Math.sin(phi / 2));
    const a0 = Math.atan2(y + ay * t - cy, x + ax * t - cx);
    let sweep = Math.atan2(y + by * t - cy, x + bx * t - cx) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(3, Math.ceil((Math.abs(sweep) * rad) / chord));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      out.push(new THREE.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
    }
  }
  return out;
}

/** Closed smooth curve through points; keeps the curve from cutting the corners a plan outline needs. */
export function spline(pts, samplesPerSpan = 14) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  return c.getPoints(samplesPerSpan * (pts.length - 1)).map((p) => new THREE.Vector2(p.x, p.y));
}

function ccw(pts) {
  return THREE.ShapeUtils.isClockWise(pts) ? [...pts].reverse() : pts;
}

/** Per-vertex normals for hard-surface forms: curved runs stay smooth, flat faces stay truly flat. */
export function hardNormals(geo, { creaseDeg = 40, flatEdge = 40 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const count = pos.count;
  const faces = [];
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  const ab = new THREE.Vector3(); const ac = new THREE.Vector3();
  const buckets = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 8)},${Math.round(pos.getY(i) * 8)},${Math.round(pos.getZ(i) * 8)}`;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = ab.subVectors(b, a).clone().cross(ac.subVectors(c, a));
    if (n.lengthSq() > 0) n.normalize();
    const minEdge = Math.min(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const axial = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) > 0.9999;
    faces.push({ n, flat: minEdge > flatEdge || axial });
    for (let k = 0; k < 3; k++) {
      const kk = key(i + k);
      if (!buckets.has(kk)) buckets.set(kk, []);
      buckets.get(kk).push(i / 3);
    }
  }
  const cos = Math.cos(THREE.MathUtils.degToRad(creaseDeg));
  const normal = new Float32Array(count * 3);
  const sum = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const f = faces[Math.floor(i / 3)];
    sum.copy(f.n);
    if (!f.flat) {
      for (const j of buckets.get(key(i))) {
        const o = faces[j];
        if (o === f || o.flat) continue;
        if (o.n.dot(f.n) > cos) sum.add(o.n);
      }
      sum.normalize();
    }
    normal.set([sum.x, sum.y, sum.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return g;
}

/** UVs in metres, projected along each triangle's dominant axis. Textures set repeat = 1 / tile size. */
export function boxUV(geo, along = 'auto') {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x); const ay = Math.abs(n.y); const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k) / 1000; const y = p.getY(i + k) / 1000; const z = p.getZ(i + k) / 1000;
      let u; let v;
      if (az >= ax && az >= ay) { u = along === 'y' ? y : x; v = along === 'y' ? x : y; }
      else if (ax >= ay) { u = along === 'z' ? z : y; v = along === 'z' ? y : z; }
      else { u = along === 'z' ? z : x; v = along === 'z' ? x : z; }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Plain box in room coordinates, for architecture. */
export function slab(x0, x1, y0, y1, z0, z1, along) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return boxUV(g, along);
}

/**
 * A solid with a soft moulded edge, cut from a 2D outline and pushed along an axis.
 * basis 'xy': outline (x,y) up z. 'yz': outline (y,z) along +x. 'xz': outline (x,z), pushed toward -y starting at y = -at.
 */
export function extrude(outline, depth, { holes = [], radius = 0, segs = 6, basis = 'xy', at = 0, along } = {}) {
  const shape = new THREE.Shape(ccw(outline));
  for (const h of holes) shape.holes.push(new THREE.Path(ccw(h)));
  let g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - radius * 2, steps: 1, curveSegments: 1,
    bevelEnabled: radius > 0, bevelSize: radius, bevelThickness: radius, bevelSegments: segs, bevelOffset: -radius,
  });
  g.translate(0, 0, radius + at);
  const m = new THREE.Matrix4();
  if (basis === 'yz') m.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  if (basis === 'xz') m.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
  g.applyMatrix4(m);
  g = hardNormals(g);
  return boxUV(g, along);
}

/** Rounded rectangle outline. r may be one number or [sw, se, ne, nw]. */
export function roundRect(u0, v0, u1, v1, r) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  return fillet([[u0, v0, a], [u1, v0, b], [u1, v1, c], [u0, v1, d]], 8);
}

function offsetContour(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n]; const c = pts[i]; const q = pts[(i + 1) % n];
    const e0 = new THREE.Vector2().subVectors(c, p).normalize();
    const e1 = new THREE.Vector2().subVectors(q, c).normalize();
    // Inward normal of a CCW contour is the left of travel.
    const n0 = new THREE.Vector2(-e0.y, e0.x); const n1 = new THREE.Vector2(-e1.y, e1.x);
    const m = n0.clone().add(n1);
    if (m.lengthSq() < 1e-6) m.copy(n0); else m.normalize();
    const k = 1 / Math.max(0.35, m.dot(n0));
    out.push(new THREE.Vector2(c.x + m.x * d * k, c.y + m.y * d * k));
  }
  return out;
}

/**
 * A closed solid from a plan outline and an edge profile: profile is a list of [inset, z] running from
 * the middle of the top surface, out over the edge, and back in along the underside. The two innermost
 * rings are closed with flat caps. This is what makes the platform read as a wing and not a board.
 */
export function pebble(outline, profile, { along = 'y' } = {}) {
  const base = ccw(outline);
  const rings = profile.map(([inset, z]) => offsetContour(base, inset).map((p) => new THREE.Vector3(p.x, p.y, z)));
  const positions = [];
  const push = (v) => positions.push(v.x, v.y, v.z);
  const n = base.length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = rings[r][i]; const b = rings[r][j]; const c = rings[r + 1][j]; const d = rings[r + 1][i];
      push(a); push(d); push(c); push(a); push(c); push(b);
    }
  }
  const capFor = (ring, up) => {
    const tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p.x, p.y)), []);
    for (const [a, b, c] of tris) {
      if (up) { push(ring[a]); push(ring[b]); push(ring[c]); } else { push(ring[a]); push(ring[c]); push(ring[b]); }
    }
  };
  capFor(rings[0], true);
  capFor(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return boxUV(hardNormals(g, { creaseDeg: 50, flatEdge: 1e9 }), along);
}

/** A soft, overstuffed block: rounded edges, a crown, a slightly uneven skin. w along x, d along y, h up z. */
export function cushion(w, d, h, { r = Math.min(h * 0.48, 60), crown = 0.16, seed = 1, wrinkle = 1, density = 22, pinch = 0.06, seam = 0 } = {}) {
  const sx = Math.max(6, Math.round(w / density)); const sy = Math.max(6, Math.round(d / density)); const sz = Math.max(4, Math.round(h / (density * 0.7)));
  const box = new THREE.BoxGeometry(w, d, h, sx, sy, sz);
  box.deleteAttribute('uv'); box.deleteAttribute('normal');
  const g = mergeVertices(box, 1e-3);
  const p = g.attributes.position;
  const hx = w / 2; const hy = d / 2; const hz = h / 2;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
    const cx = THREE.MathUtils.clamp(x, -(hx - r), hx - r);
    const cy = THREE.MathUtils.clamp(y, -(hy - r), hy - r);
    const cz = THREE.MathUtils.clamp(z, -(hz - r), hz - r);
    const dx = x - cx; const dy = y - cy; const dz = z - cz;
    const l = Math.hypot(dx, dy, dz) || 1;
    x = cx + (dx / l) * r; y = cy + (dy / l) * r; z = cz + (dz / l) * r;
    const nx = x / hx; const ny = y / hy; const nz = z / hz;
    const puff = (1 - nx * nx * nx * nx) * (1 - ny * ny * ny * ny);
    z += Math.sign(nz || 1) * Math.abs(nz) ** 0.6 * puff * h * crown;
    // Sides bow out a little and corners draw in, as stuffed fabric does.
    const side = 1 - nz * nz;
    x += Math.sign(nx) * Math.abs(nx) ** 3 * side * h * 0.05 * (1 - ny * ny);
    y += Math.sign(ny) * Math.abs(ny) ** 3 * side * h * 0.05 * (1 - nx * nx);
    const corner = Math.abs(nx * ny) ** 3;
    x -= Math.sign(nx) * corner * h * pinch; y -= Math.sign(ny) * corner * h * pinch;
    const s = 0.012;
    const n = noise3(x * s, y * s, z * s, seed) * 2.6 + noise3(x * s * 3.1, y * s * 3.1, z * s * 3.1, seed + 3) * 0.9;
    z += Math.sign(nz || 1) * n * wrinkle * (0.4 + Math.abs(nz) * 0.6);
    // The seam around the waist: a shallow pull-in, which is most of what makes it read as sewn.
    if (seam) {
      const k = Math.exp(-((z / (h * 0.055 + 1.5)) ** 2)) * seam;
      const sideX = Math.abs(nx) ** 4; const sideY = Math.abs(ny) ** 4;
      x -= Math.sign(nx) * k * Math.min(1, sideX + 0.1); y -= Math.sign(ny) * k * Math.min(1, sideY + 0.1);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  softUV(g);
  return g;
}

/** Continuous UVs in metres on a smooth skin; stretch on the sides is invisible at fabric scale. */
function softUV(g) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.7) / 1000;
    uv[i * 2 + 1] = (p.getY(i) + p.getZ(i) * 0.7) / 1000;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Same soft block, but the outline in plan is any closed contour (for the leaf-shaped seat pad). */
export function softPad(outline, z0, z1, { seed = 2, edgeR = null, crown = 8 } = {}) {
  const h = z1 - z0;
  const r = edgeR ?? h * 0.5;
  const prof = [];
  const inner = r + 60;
  const N = 8;
  // Top: gentle crown falling off toward the edge, then a semicircular edge, then a flat bottom.
  for (let i = 0; i <= 5; i++) { const t = i / 5; prof.push([inner + 80 * (1 - t), z1 - crown * t * t * 0.4]); }
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    prof.push([r - Math.sin(a) * r, (z0 + z1) / 2 + Math.cos(a) * h / 2 - (1 - Math.cos(a)) * 0]);
  }
  prof.push([r + 40, z0]);
  const base = ccw(outline);
  const rings = prof.map(([inset, z]) => offsetContour(base, inset).map((p) => new THREE.Vector3(p.x, p.y, z)));
  const positions = [];
  const push = (v) => positions.push(v.x, v.y, v.z);
  for (let r2 = 0; r2 < rings.length - 1; r2++) {
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length;
      const a = rings[r2][i]; const b = rings[r2][j]; const c = rings[r2 + 1][j]; const d = rings[r2 + 1][i];
      push(a); push(d); push(c); push(a); push(c); push(b);
    }
  }
  const ring = rings[0];
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(ring.map((q) => new THREE.Vector2(q.x, q.y)), [])) { push(ring[a]); push(ring[b]); push(ring[c]); }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g = mergeVertices(g, 0.01);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    if (z < z0 + 1) continue;
    const s = 0.01;
    p.setZ(i, z + noise3(x * s, y * s, 0, seed) * 1.6);
  }
  g.computeVertexNormals();
  return softUV(g);
}

/** A roll, e.g. a back bolster. Runs along y. */
export function bolster(length, radius, { seed = 5 } = {}) {
  const pts = [];
  const body = length / 2 - radius * 0.4;
  pts.push(new THREE.Vector2(0.01, -length / 2));
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * radius, -body - Math.cos(a) * radius * 0.4)); }
  for (let i = 1; i < 24; i++) pts.push(new THREE.Vector2(radius * (1 + 0.02 * Math.sin((i / 24) * Math.PI)), -body + (2 * body * i) / 24));
  for (let i = 8; i >= 1; i--) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * radius, body + Math.cos(a) * radius * 0.4)); }
  pts.push(new THREE.Vector2(0.01, length / 2));
  const g = new THREE.LatheGeometry(pts, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const n = 1 + noise3(x * 0.012, y * 0.012, z * 0.012, seed) * 0.018;
    p.setXYZ(i, x * n, y, z * n);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return softUV(g);
}

/** A climbing hold: a rock-like lump with a flat back and an incut lip to grab. Back on z=0, out along +z. */
export function hold(w, d, h, seed = 1) {
  let g = new THREE.IcosahedronGeometry(1, 5);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const nx = v.x; const ny = v.y; const nz = v.z;
    const lump = 1 + 0.26 * noise3(nx * 1.5 + seed, ny * 1.5, nz * 1.5, seed) + 0.09 * noise3(nx * 3.7, ny * 3.7 + seed, nz * 3.7, seed + 2);
    let x = nx * lump * w / 2; let y = ny * lump * d / 2; let z = Math.max(nz, -0.05) * lump * h;
    // The grabbing lip: the upper side is scooped toward the wall.
    if (ny > 0.15 && nz > 0.1) { const s = (ny - 0.15) * nz; z -= s * h * 0.75; y += s * d * 0.1; }
    p.setXYZ(i, x, y, Math.max(0, z));
  }
  g.computeVertexNormals();
  return softUV(g);
}

/** A cloth sheet draped over a mattress edge, wrinkled. (u along x, v across y then down the side.) */
export function drape({ x0, x1, yInner, yEdge, top, down, thickness = 36, seed = 7, wrinkle = 1, fold = 0 }) {
  const edgeR = thickness + 18;
  const profile = [];
  const nFlat = 34;
  for (let i = 0; i <= nFlat; i++) profile.push([yInner + ((yEdge + edgeR - yInner) * i) / nFlat, top]);
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; profile.push([yEdge + edgeR - Math.sin(a) * edgeR, top - edgeR + Math.cos(a) * edgeR]); }
  const nDown = 12;
  for (let i = 1; i <= nDown; i++) profile.push([yEdge, top - edgeR - ((top - edgeR - down) * i) / nDown]);
  const nx = Math.round((x1 - x0) / 22);
  const pos = [];
  const idx = [];
  const m = profile.length;
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let j = 0; j < m; j++) {
      const [y, z] = profile[j];
      const s = 0.0055;
      const side = j > nFlat ? 1 : 0;
      const n = noise3(x * s, y * s * 1.6, seed, seed) * 8 + noise3(x * s * 2.8, y * s * 3, seed + 2, seed) * 3.5 + noise3(x * s * 9, y * s * 8, seed, seed + 5) * 0.7;
      const ripple = side * Math.sin(x * 0.018 + 3 * noise3(x * 0.004, 0, 0, seed)) * 5;
      const k = (j / m);
      pos.push(x, y + (side ? -n * 0.6 - ripple : 0), z + (side ? 0 : n * wrinkle * (0.55 + 0.45 * k)));
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j; const b = (i + 1) * m + j; const c = (i + 1) * m + j + 1; const d = i * m + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (fold) void fold;
  return softUV(g);
}

export { mergeGeometries };

// The real room from room.json and the wardrobe study, at render fidelity.
// Finish is white plaster as the photos show. He said the walls are brick and the ceiling concrete:
// that is the substrate that decides how the ledger and rods anchor, and it is not what you see.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { extrude, fillet, mergeGeometries, roundRect, slab } from './forms.mjs';

// ESTIMATES read off the photos. Nothing here has been measured.
export const ESTIMATE = {
  wallThickness: 300,
  windowReveal: 70, // frame set back from the wall face
  frameFace: 62, frameDepth: 70, sashFace: 60,
  shutterLowered: 230, shutterPitch: 38, // how far the slats hang in view; they roll fully up
  shutterBoxProud: 22,
  sillProud: 34,
  radiator: { y0: 2755, y1: 3755, bottom: 120, height: 580, depth: 95, sections: 25 }, // photo: tall grey column radiator under the windows
  fan: { x: 1333, y: 2510, dia: 530, height: 215 }, // photo and mirror: "near the room centre"
  spots: { x: 228, ys: [1900, 3100, 4300], dia: 88 }, // photo: three in the drop
  skirting: 0, // photos show none clearly
  doorRailZ: 2560, // wardrobe study: placeholder door height
};

function along(room, f) {
  const e = room.edges.find((w) => w.name === f.wall);
  const dx = (e.q[0] - e.p[0]) / e.length; const dy = (e.q[1] - e.p[1]) / e.length;
  return { e, dx, dy, a: [e.p[0] + dx * f.offset, e.p[1] + dy * f.offset], b: [e.p[0] + dx * (f.offset + f.width), e.p[1] + dy * (f.offset + f.width)], inX: dy, inY: -dx };
}

/** Footprint box of a fixed thing, inward from its wall. */
function footprint(room, f) {
  const { a, b, inX, inY } = along(room, f);
  const d = f.depth || 30;
  const xs = [a[0], b[0], a[0] + inX * d, b[0] + inX * d];
  const ys = [a[1], b[1], a[1] + inY * d, b[1] + inY * d];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: f.bottom || 0, z1: (f.bottom || 0) + f.height };
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

export function buildRoom(data, M, resolved) {
  const g = new THREE.Group();
  const add = (geo, mat, cast) => { const m = mesh(geo, mat, cast); g.add(m); return m; };
  const xs = resolved.corners.map((c) => c[0]); const ys = resolved.corners.map((c) => c[1]);
  const W = Math.max(...xs); const L = Math.max(...ys); const H = resolved.maxHeight;
  const T = ESTIMATE.wallThickness;
  const byId = (id) => (data.fixed || []).find((f) => f.id === id);
  const windows = (data.fixed || []).filter((f) => f.kind === 'window');
  const walls = { west: [], others: [] };

  // Floor and ceiling.
  add(slab(-T, W + T, -T, L + T, -60, 0), M.parquet);
  walls.others.push(add(slab(-T, W + T, -T, L + T, H, H + 120), M.ceiling));
  walls.ceiling = g.children[g.children.length - 1];

  // West wall with real window holes; other walls plain. They stick out past the corners so no light leaks.
  const holes = windows.map((f) => {
    const a = along(resolved, f);
    const y0 = Math.min(a.a[1], a.b[1]); const y1 = Math.max(a.a[1], a.b[1]);
    return [new THREE.Vector2(y0, f.bottom), new THREE.Vector2(y1, f.bottom), new THREE.Vector2(y1, f.bottom + f.height), new THREE.Vector2(y0, f.bottom + f.height)];
  });
  const westOutline = [new THREE.Vector2(-T, -80), new THREE.Vector2(L + T, -80), new THREE.Vector2(L + T, H + 140), new THREE.Vector2(-T, H + 140)];
  const west = new THREE.Group();
  west.add(mesh(extrude(westOutline, T, { holes, basis: 'yz', at: -T }), M.wall));
  const east = new THREE.Group(); east.add(mesh(slab(W, W + T, -T, L + T, -80, H + 140), M.wall));
  const north = new THREE.Group(); north.add(mesh(slab(-T, W + T, L, L + T, -80, H + 140), M.wall));
  const south = new THREE.Group(); south.add(mesh(slab(-T, W + T, -T, 0, -80, H + 140), M.wall));
  g.add(west, east, north, south);

  // Wall blocks, drop and niche straight from the measured boxes.
  for (const f of data.fixed || []) {
    const b = footprint(resolved, f);
    if (f.kind === 'wall block, lower' || f.kind === 'wall block' || f.kind === 'shelf niche') add(slab(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1), M.wall);
    if (f.kind === 'ceiling drop') add(slab(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1), M.ceiling);
    if (f.id?.startsWith('fx-niche-')) add(slab(b.x0, b.x1 - 1, b.y0 + 0.5, b.y1 - 0.5, b.z0, b.z1, 'y'), M.shelf);
  }
  windowsAndShutters(g, windows, resolved, M);
  radiator(g, M);
  door(g, byId('fx-door'), byId('fx-door-wood'), resolved, M, W);
  wardrobe(g, data, M, W, H);
  fan(g, M, H);
  spots(g, M, byId('fx-west-soffit')?.bottom ?? 2480);
  return { group: g, walls: { west, east, north, south }, ceiling: walls.ceiling };
}

function windowsAndShutters(g, windows, room, M) {
  const E = ESTIMATE;
  const paneZ = -E.windowReveal - E.frameDepth;
  for (const f of windows) {
    const a = along(room, f);
    const y0 = Math.min(a.a[1], a.b[1]); const y1 = Math.max(a.a[1], a.b[1]);
    const z0 = f.bottom; const z1 = f.bottom + f.height;
    const sy0 = y0 + E.frameFace; const sy1 = y1 - E.frameFace; const sz0 = z0 + E.frameFace; const sz1 = z1 - E.frameFace;
    // Frame and sash as four soft-edged bars each, the rounded section PVC profiles have.
    const bars = (u0, u1, v0, v1, face, depth, x, r) => [
      new RoundedBoxGeometry(depth, u1 - u0, face, 3, r).translate(x, (u0 + u1) / 2, v0 + face / 2),
      new RoundedBoxGeometry(depth, u1 - u0, face, 3, r).translate(x, (u0 + u1) / 2, v1 - face / 2),
      new RoundedBoxGeometry(depth, face, v1 - v0, 3, r).translate(x, u0 + face / 2, (v0 + v1) / 2),
      new RoundedBoxGeometry(depth, face, v1 - v0, 3, r).translate(x, u1 - face / 2, (v0 + v1) / 2),
    ].map((p) => p.toNonIndexed());
    g.add(mesh(mergeGeometries(bars(y0, y1, z0, z1, E.frameFace, E.frameDepth, paneZ + E.frameDepth / 2, 3)), M.pvc));
    g.add(mesh(mergeGeometries(bars(sy0, sy1, sz0, sz1, E.sashFace, 62, paneZ + 35, 5)), M.pvc));
    // Thin glass pane; the raster path shows it faintly, the path tracer leaves it out (see scene.mjs).
    const glass = new THREE.Mesh(slab(paneZ + 30, paneZ + 32, sy0 + E.sashFace, sy1 - E.sashFace, sz0 + E.sashFace, sz1 - E.sashFace), M.glass);
    glass.userData.glass = true;
    glass.castShadow = false;
    g.add(glass);
    // Tilt-and-turn handle on the sash's window-to-window side.
    const hy = f.id === 'fx-window-1' ? sy0 + 30 : sy1 - 30;
    const hz = (sz0 + sz1) / 2;
    g.add(mesh(new RoundedBoxGeometry(24, 28, 56, 3, 6).translate(paneZ + 72, hy, hz), M.pvc));
    g.add(mesh(new RoundedBoxGeometry(16, 22, 120, 3, 7).translate(paneZ + 96, hy, hz - 44), M.pvc));
    // Inner sill, deeper than the frame.
    g.add(mesh(new RoundedBoxGeometry(E.windowReveal + E.sillProud + 40, y1 - y0 + 30, 18, 3, 3).translate((E.sillProud - E.windowReveal) / 2 - 20, (y0 + y1) / 2, z0 - 9), M.pvc));
    // Shutter box above, flush into the ceiling drop, and shutter curtain outside the glass.
    const zb = z1;
    const boxTop = 2480;
    g.add(mesh(new RoundedBoxGeometry(E.windowReveal + E.shutterBoxProud + 10, y1 - y0 + 24, boxTop - zb, 3, 4).translate((E.shutterBoxProud - E.windowReveal - 10) / 2, (y0 + y1) / 2, (zb + boxTop) / 2), M.pvc));
    const n = Math.ceil(E.shutterLowered / E.shutterPitch);
    const slats = [];
    for (let i = 0; i < n; i++) {
      const z = z1 - E.frameFace - E.shutterPitch * i - E.shutterPitch / 2;
      slats.push(new RoundedBoxGeometry(14, sy1 - sy0, E.shutterPitch - 3, 2, 3).translate(paneZ - 42, (sy0 + sy1) / 2, z));
    }
    g.add(mesh(mergeGeometries(slats), M.shutter));
  }
  // Strap winder on the wall block beside the first window, as in the first photo.
  const w1 = windows.find((f) => f.id === 'fx-window-1') || windows[0];
  if (w1) {
    const a = along(room, w1);
    const y = Math.max(a.a[1], a.b[1]) + 34;
    g.add(mesh(new RoundedBoxGeometry(30, 48, 120, 3, 8).translate(15, y, 1150), M.pvc));
    g.add(mesh(new THREE.BoxGeometry(2, 18, 2285 - 1210).translate(4, y, (2285 + 1210) / 2), M.shutter));
  }
}

function radiator(g, M) {
  const R = ESTIMATE.radiator;
  const pitch = (R.y1 - R.y0) / R.sections;
  const parts = [];
  for (let i = 0; i < R.sections; i++) {
    const y = R.y0 + pitch * (i + 0.5);
    for (const x of [28, R.depth - 18]) {
      const col = new THREE.CapsuleGeometry(13, R.height - 26, 3, 10);
      col.rotateX(Math.PI / 2);
      col.translate(x, y, R.bottom + R.height / 2);
      parts.push(col);
    }
    parts.push(new RoundedBoxGeometry(R.depth - 18, pitch - 8, 20, 2, 6).translate((28 + R.depth - 18) / 2, y, R.bottom + 16));
    parts.push(new RoundedBoxGeometry(R.depth - 18, pitch - 8, 20, 2, 6).translate((28 + R.depth - 18) / 2, y, R.bottom + R.height - 16));
  }
  g.add(mesh(mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p)), M.radiator));
  // Valve and pipe at the north end.
  const pipe = new THREE.CylinderGeometry(9, 9, R.bottom, 12); pipe.rotateX(Math.PI / 2); pipe.translate(44, R.y1 + 18, R.bottom / 2);
  g.add(mesh(pipe, M.steelPale));
}

function door(g, f, wood, room, M, W) {
  if (!f) return;
  const { a, b } = along(room, f);
  const y0 = Math.min(a[1], b[1]); const y1 = Math.max(a[1], b[1]);
  const top = f.bottom + f.height;
  const trimOut = 55;
  // Wood over the door to the ceiling and the 55 mm jambs, per room.json.
  const wf = wood && footprint(room, wood);
  if (wf) g.add(mesh(extrude(roundRect(wf.y0, wf.z0, wf.y1, wf.z1, 0), 24, { basis: 'yz', at: W - 24, radius: 3, segs: 2, along: 'z' }), M.door));
  g.add(mesh(extrude(roundRect(y0 - trimOut, 0, y0, top, 0), 24, { basis: 'yz', at: W - 24, radius: 3, segs: 2, along: 'z' }), M.door));
  g.add(mesh(extrude(roundRect(y1, 0, y1 + trimOut, top, 0), 24, { basis: 'yz', at: W - 24, radius: 3, segs: 2, along: 'z' }), M.door));
  g.add(mesh(extrude(roundRect(y0 + 2, 6, y1 - 2, top - 2, 2), 44, { basis: 'yz', at: W - 44, radius: 3, segs: 2, along: 'z' }), M.door));
  // Lever on the free (north) side; he said the hinge is on the south side.
  const hy = y1 - 70;
  g.add(mesh(new THREE.CylinderGeometry(24, 24, 8, 24).rotateZ(Math.PI / 2).translate(W - 48, hy, 1020), M.steelPale));
  g.add(mesh(new RoundedBoxGeometry(50, 16, 16, 3, 6).translate(W - 72, hy, 1020), M.steelPale));
  g.add(mesh(new RoundedBoxGeometry(16, 120, 16, 3, 6).translate(W - 92, hy - 48, 1020), M.steelPale));
}

function wardrobe(g, data, M, W, H) {
  // Study: three doors 905 wide, two white on the back rail, the mirror in front. Frames from the photos.
  const doors = [
    { c: 453, y: 487, mat: 'melamine' },
    { c: 2214, y: 487, mat: 'melamine' },
    { c: 1333, y: 532, mat: 'mirror' },
  ];
  const stile = 24; // ESTIMATE from the photo
  const dw = 905; const dd = 45; const dH = ESTIMATE.doorRailZ;
  for (const d of doors) {
    const x0 = d.c - dw / 2; const x1 = d.c + dw / 2;
    const y0 = d.y - dd / 2; const y1 = d.y + dd / 2;
    // Panel set just behind the frame's face.
    const panel = slab(x0 + stile - 2, x1 - stile + 2, y1 - 22, y1 - 8, 24, dH - 24, d.mat === 'melamine' ? 'z' : undefined);
    g.add(mesh(panel, M[d.mat]));
    // The doors' black aluminium stiles and rails, softly rounded extrusions.
    const parts = [
      new RoundedBoxGeometry(stile, dd, dH, 2, 3).translate(x0 + stile / 2, d.y, dH / 2),
      new RoundedBoxGeometry(stile, dd, dH, 2, 3).translate(x1 - stile / 2, d.y, dH / 2),
      new RoundedBoxGeometry(dw, dd, 24, 2, 3).translate(d.c, d.y, 12),
      new RoundedBoxGeometry(dw, dd, 24, 2, 3).translate(d.c, d.y, dH - 12),
    ];
    g.add(mesh(mergeGeometries(parts.map((p) => p.toNonIndexed())), M.alu));
  }
  // Top track to the ceiling and the two side posts.
  g.add(mesh(new RoundedBoxGeometry(W, 100, H - dH + 6, 2, 3).translate(W / 2, 505, (H + dH) / 2), M.alu));
  g.add(mesh(new RoundedBoxGeometry(22, 100, H, 2, 3).translate(11, 505, H / 2), M.alu));
  g.add(mesh(new RoundedBoxGeometry(22, 100, H, 2, 3).translate(W - 11, 505, H / 2), M.alu));
  // A dark interior behind the doors, in case a door gap shows through.
  g.add(mesh(slab(0, W, 440, 462, 0, H), M.felt, false));
}

function lathe(prof, seg = 48) {
  const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

function fan(g, M, H) {
  const F = ESTIMATE.fan;
  const R = F.dia / 2;
  const group = new THREE.Group();
  group.position.set(F.x, F.y, H);
  const add = (geo, mat) => { const m = mesh(geo, mat); group.add(m); return m; };
  add(lathe([[0, 0], [70, 0], [70, -8], [32, -14], [26, -70], [62, -96], [66, -118], [0, -118]]), M.fanWhite);
  // Cage: the ring shroud from the mirror photo, open in the middle, LED ring on its underside.
  const ring = [[R, -96], [R - 6, -90], [R - 42, -92], [R - 46, -150], [R - 40, -205], [R - 8, -205], [R, -196], [R + 2, -150], [R, -96]];
  add(lathe(ring, 96), M.fanWhite);
  add(new THREE.TorusGeometry(R - 24, 15, 12, 96).translate(0, 0, -207), M.ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const spoke = new RoundedBoxGeometry(R - 66, 22, 8, 2, 3).translate((R - 66) / 2 + 60, 0, -102);
    spoke.rotateZ(a);
    add(spoke, M.fanWhite);
  }
  // Blades in a fine ring, like the pale disc in the photo.
  const blades = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = new THREE.SphereGeometry(1, 16, 8);
    b.scale(R - 96, 34, 4); b.translate(R - 60 - (R - 96) * 0.02, 0, 0);
    b.rotateX(0.32);
    b.translate(-(R - 60) * 0.5, 0, -126);
    b.rotateZ(a);
    blades.push(b.toNonIndexed());
  }
  add(mergeGeometries(blades), M.fanWhite);
  g.add(group);
}

function spots(g, M, z) {
  const S = ESTIMATE.spots;
  for (const y of S.ys) {
    const trim = lathe([[S.dia / 2 + 8, 0], [S.dia / 2 + 4, 3], [S.dia / 2 - 3, 2], [S.dia / 2 - 6, -7]], 32);
    trim.translate(S.x, y, z);
    g.add(mesh(trim, M.fanWhite, false));
    g.add(mesh(new THREE.CircleGeometry(S.dia / 2 - 5, 24).rotateX(Math.PI).translate(S.x, y, z + 0.5), M.spot, false));
  }
}

/** His piano, outer size from items.json, position from the variant in plan.mjs. */
export function buildPiano(item, place, M) {
  const g = new THREE.Group();
  if (!item || !place) return g;
  const { w, d, h } = item;
  // Yamaha Arius proportions by eye from the photos; only the outer size is measured. Local +y is its back.
  const hd = d / 2;
  const cheek = fillet([[hd, 0], [hd, h], [-hd + 90, h, 26], [-hd + 8, h - 96, 18], [-hd + 8, h - 165, 12], [-hd + 90, h - 196, 30], [-hd + 90, 0, 4]], 8);
  const add = (geo) => { const m = new THREE.Mesh(geo, M.piano); m.castShadow = m.receiveShadow = true; g.add(m); };
  const X = new THREE.Matrix4().makeTranslation(-w / 2, 0, 0);
  add(extrude(cheek, 42, { basis: 'yz', radius: 4, segs: 3 }).applyMatrix4(X));
  add(extrude(cheek, 42, { basis: 'yz', radius: 4, segs: 3 }).applyMatrix4(new THREE.Matrix4().makeTranslation(w / 2 - 42, 0, 0)));
  const bodyLine = fillet([[hd - 2, h - 200], [hd - 2, h - 8], [-hd + 92, h - 8, 26], [-hd + 14, h - 98, 16], [-hd + 14, h - 160, 12], [-hd + 90, h - 190, 28]], 8);
  add(extrude(bodyLine, w - 84, { basis: 'yz', at: 0, radius: 3, segs: 2 }).applyMatrix4(new THREE.Matrix4().makeTranslation(-w / 2 + 42, 0, 0)));
  add(slab(-w / 2 + 40, w / 2 - 40, hd - 26, hd - 8, 120, h - 190));
  add(new RoundedBoxGeometry(w - 84, 170, 20, 2, 6).translate(0, -hd + 170, 46));
  const pedals = [];
  for (const x of [-46, 0, 46]) pedals.push(new RoundedBoxGeometry(26, 110, 12, 2, 4).translate(x, -hd + 42, 72).toNonIndexed());
  const pm = new THREE.Mesh(mergeGeometries(pedals), M.steelPale); pm.castShadow = true; g.add(pm);
  g.position.set(place.x, place.y, 0);
  g.rotation.z = THREE.MathUtils.degToRad(place.rot);
  return g;
}

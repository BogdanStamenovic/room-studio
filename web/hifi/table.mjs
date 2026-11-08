// The expanding table at render fidelity. One slider drives every part in the order the machine runs.
// Everything is a proposal; sizes marked ESTIMATE in plan.mjs. Nothing here is a structural check.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { extrude, mergeGeometries, roundRect } from './forms.mjs';
import { BASE, CHAIR, DUCT, LEG, LIFT, MONITOR, RAIL, SERVER, SET, TABLE, chainLoopY, tableState } from './plan.mjs';

const rb = (x0, x1, y0, y1, z0, z1, r = 3) => new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 2, r).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).toNonIndexed();

function cyl(r0, r1, len, axis, x, y, z, seg = 20) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z).toNonIndexed();
}

/** Collects geometry per material, then adds one merged mesh each, so a few hundred parts stay a few draw calls. */
class Parts {
  constructor(M) { this.M = M; this.lists = new Map(); }
  add(mat, ...geos) { if (!this.lists.has(mat)) this.lists.set(mat, []); this.lists.get(mat).push(...geos); return this; }
  into(group) {
    for (const [mat, geos] of this.lists) {
      const m = new THREE.Mesh(mergeGeometries(geos), this.M[mat]);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }
}

function solo(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

const unitRod = (r, M, mat) => solo(new THREE.CylinderGeometry(r, r, 1, 12), M[mat]);

/** Stretch a unit cylinder (axis y) between two points in the x-z plane at a given y. */
function spanXZ(rod, ax, az, bx, bz, y) {
  const dx = bx - ax; const dz = bz - az;
  rod.scale.set(1, Math.hypot(dx, dz), 1);
  rod.position.set((ax + bx) / 2, y, (az + bz) / 2);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz).normalize());
}

/** Everything that rides: oak top, frame, gear, leg. Drawn at the closed position; the group just slides. */
function buildMoving(M) {
  const g = new THREE.Group();
  const T = TABLE; const p = new Parts(M);
  const a0 = T.apronZ; const a1 = T.apronZ + T.apron;
  // Soft rear corners, a bigger radius at the front where hips pass, as on his present desk.
  const oak = solo(extrude(roundRect(T.x0, T.yS, T.x1, T.yN, [6, 34, 34, 6]), T.thick, { at: T.z - T.thick, radius: 3, segs: 3, along: 'y' }), M.oak);
  p.add('white',
    rb(T.x1 - 30, T.x1 - 5, T.yS + 34, T.yN - 34, a0, a1), rb(T.x0, T.x0 + 30, T.yS + 8, T.yN - 8, a0, a1),
    rb(T.x0 + 8, T.x1 - 8, T.yS, T.yS + 16, a0, a1), rb(T.x0 + 8, T.x1 - 8, T.yN - 16, T.yN, a0, a1),
    rb(T.x0 + 30, T.x1 - 30, T.yS + 692, T.yS + 708, a0, a1));
  // Rear trucks on the wall rail, with the arms that reach them over the radiator's chimney.
  for (const off of RAIL.trucks) {
    const y = T.yN - off;
    p.add('steel', rb(18, 62, y - 45, y + 45, 708, 740, 3), rb(62, T.x0 + 4, y - 16, y + 16, 708, 726, 2));
  }
  // Front rollers on the track bar: one just past the north end, so it is still on the track at full travel.
  for (const y of [T.yN + 16, T.yN - 1000]) p.add('steel', cyl(20, 20, 16, 'x', 950, y, 700, 24));
  p.add('steel', rb(936, 945, T.yN - 16, T.yN + 26, 680, 716, 2), rb(955, 964, T.yN - 16, T.yN + 26, 680, 716, 2));
  p.add('steel', rb(936, 945, T.yN - 1016, T.yN - 984, 680, 716, 2), rb(955, 964, T.yN - 1016, T.yN - 984, 680, 716, 2));

  // The chain's moving bracket, reaching from the top's rear apron up into the duct.
  const my = DUCT.chainMovingY;
  p.add('steel', rb(100, T.x0 + 4, my - 12, my + 12, 708, 726, 2), rb(106, 116, my - 12, my + 12, 708, 830, 2));

  p.into(g);
  // Top and what stands on it, separate so the mechanism view can lift them off.
  const onTop = new THREE.Group();
  onTop.add(oak);
  g.add(onTop);
  const q = new Parts(M);
  // Monitor: a 27 inch panel, ESTIMATE, since his model is not recorded. Faces the room.
  const mo = MONITOR; const w = mo.width / 2;
  q.add('black',
    rb(mo.x - 22, mo.x + 22, mo.y - w, mo.y + w, mo.z0, mo.z1, 8),
    rb(mo.x - 70, mo.x + 110, mo.y - 130, mo.y + 130, T.z, T.z + 12, 5),
    rb(mo.x - 42, mo.x - 6, mo.y - 32, mo.y + 32, T.z + 8, mo.z0 + 120, 8));
  const screen = new THREE.PlaneGeometry(mo.width - 22, mo.z1 - mo.z0 - 24);
  screen.rotateX(Math.PI / 2); screen.rotateZ(Math.PI / 2);
  screen.translate(mo.x + 22.5, mo.y, (mo.z0 + mo.z1) / 2);
  onTop.add(solo(screen, M.screen));

  // PS4 lying flat at the south end. Size from the earlier study. Keyboard and mouse in front of the monitor.
  q.add('black', rb(250, 525, T.yS + 110, T.yS + 410, T.z + 6, T.z + 56, 3), rb(258, 517, T.yS + 118, T.yS + 402, T.z, T.z + 6, 2));
  q.add('steel', rb(528, 530, T.yS + 110, T.yS + 410, T.z + 26, T.z + 32, 1));
  q.add('black', rb(735, 865, mo.y - 225, mo.y + 225, T.z, T.z + 22, 6), rb(765, 835, mo.y + 280, mo.y + 340, T.z, T.z + 30, 14));
  q.add('white', rb(745, 855, mo.y - 215, mo.y + 215, T.z + 21, T.z + 24, 2));
  q.into(onTop);

  // Leg, in the x-z plane. Folded flat under the top, it needs nothing moved out of the way first.
  const L = LEG; const hinge = new THREE.Group();
  hinge.position.set(L.pivot.x, L.pivot.y, L.pivot.z);
  const lp = new Parts(M);
  lp.add('white', rb(-16, 16, -15, 15, -L.length + 60, 16, 5));
  lp.add('steel', cyl(11, 11, 34, 'y', 0, 0, 0, 20));
  lp.add('steel', rb(-30, -22, -22, 22, -L.length - 8, -L.length + 70, 2), rb(22, 30, -22, 22, -L.length - 8, -L.length + 70, 2), rb(-30, 30, -22, 22, -L.length + 60, -L.length + 72, 2));
  // Wheel rolls along y; the soft tread is so parquet takes its load. ESTIMATE: 80 x 40.
  lp.add('felt', cyl(L.wheelR, L.wheelR, 40, 'x', 0, 0, -L.length, 40));
  lp.add('steelPale', cyl(12, 12, 44, 'x', 0, 0, -L.length, 20));
  // Red marker on the latch, so it reads at a glance whether the leg is really down.
  lp.add('stop', rb(14, 22, -8, 8, -40, -10, 2));
  lp.into(hinge);
  g.add(hinge);

  // Leg drive inside the apron layer: motor, screw, nut. Brace from the nut to the leg.
  const yb = L.pivot.y; const zs = a0 + 20;
  const lg = new Parts(M);
  lg.add('steel', cyl(18.5, 18.5, 160, 'x', 290, yb, zs, 28));
  lg.add('steelPale', cyl(4, 4, L.brace.x1 - L.brace.x0 + 40, 'x', (L.brace.x0 + L.brace.x1) / 2 + 10, yb, zs, 12));
  lg.into(g);
  const nut = solo(new RoundedBoxGeometry(34, 26, 20, 2, 3), M.steel);
  g.add(nut);
  const brace = unitRod(9, M, 'steelPale');
  g.add(brace);

  return { group: g, hinge, nut, brace, chainZ: zs, onTop };
}

/** What stays put: under-frame, wall rail and duct, lift columns, server, cable chain. */
function buildFixed(M) {
  const g = new THREE.Group();
  const B = BASE; const p = new Parts(M);
  const F = B.front; const R = B.rear;
  for (const [y0, y1] of [[B.yS, B.yS + 60], [B.yN - 60, B.yN]]) {
    p.add('white', rb(F.x0, F.x1, y0, y1, 0, F.z0, 6), rb(R.x0, R.x1, y0, y1, 0, R.z0, 6));
  }
  p.add('white', rb(F.x0, F.x1, B.yS, B.yN, F.z0, F.z1, 3), rb(R.x0, R.x1, B.yS, B.yN, R.z0, R.z1, 3));
  p.add('white', rb(R.x1, F.x0, B.yS + 30, B.yS + 60, F.z0, F.z1, 3), rb(R.x1, F.x0, B.yN - 60, B.yN - 30, F.z0, F.z1, 3));
  const Tr = B.track;
  p.add('steelPale', rb(Tr.x0, Tr.x1, Tr.y0, Tr.y1, Tr.z0, Tr.z1, 2));
  // Rest pads: the raised leaf lands on the beam, so people lean on steel and not on the lift.
  for (const y of [SET.y0 + 90, SET.y1 - 90]) p.add('felt', rb(866, 890, y - 30, y + 30, F.z1, F.z1 + 8, 2));
  const S = B.shield;
  p.add('white', rb(S.x0, S.x1, B.yS, B.yN, S.z0, S.z1, 1.5));
  p.add('steel', rb(R.x0, 240, B.yS, B.yN, 0, 12, 2));

  // Wall rail on stand-offs. Bare above the radiator on purpose, so the heat keeps a way up.
  const Ra = RAIL;
  p.add('steelPale', rb(Ra.x0, Ra.x1, Ra.y0, Ra.y1, Ra.z0, Ra.z1, 2));
  for (let y = Ra.y0 + 40; y < Ra.y1; y += 460) p.add('steel', rb(0, Ra.x0 + 2, y - 18, y + 18, Ra.z0 - 3, Ra.z1 + 3, 2));
  // Belt in a flat loop over the rail: drive at the south end, idler at the north.
  const belt = 745; const by = [Ra.y0 + 10, Ra.y1 - 20];
  p.add('felt', rb(21, 23, by[0], by[1], belt, belt + 12, 0.5), rb(53, 55, by[0], by[1], belt, belt + 12, 0.5));
  for (const y of by) p.add('steel', cyl(16, 16, 16, 'z', 38, y, belt + 6, 24));
  p.add('steel', rb(26, 50, by[1] - 8, by[1] + 8, Ra.z1, belt, 2));

  // Drive: motor standing under the pulley, hand socket on the duct's top so it can be cranked at any time.
  p.add('steel', cyl(18.5, 18.5, 115, 'z', 38, by[0], 680, 28), cyl(6, 6, 14, 'z', 38, by[0], DUCT.z1 + 1, 6));
  p.add('white', rb(0, 74, DUCT.y0 - 22, DUCT.y0 + 44, 610, 736, 6));

  // Lift: two columns tied by a belt at floor level, so the tray cannot rack, and one motor.
  for (const y of LIFT.columns) {
    p.add('steel', rb(178, 198, y - 30, y + 30, 12, R.z0, 2), rb(198, 205, y - 12, y + 12, 12, R.z0, 1));
    p.add('steelPale', cyl(6, 6, R.z0 - 30, 'z', LIFT.x, y, (R.z0 + 30) / 2, 14));
    p.add('steel', cyl(20, 20, 12, 'z', LIFT.x, y, 22, 28));
  }
  p.add('felt', rb(204, 206, LIFT.columns[0] - 120, LIFT.columns[1], 16, 28, 0.5), rb(242, 244, LIFT.columns[0] - 120, LIFT.columns[1], 16, 28, 0.5));
  p.add('steel', cyl(20, 20, 12, 'z', LIFT.x, LIFT.columns[0] - 120, 22, 28), cyl(18.5, 18.5, 120, 'z', LIFT.x, LIFT.columns[0] - 120, 90, 28), cyl(6, 6, 14, 'z', LIFT.x, LIFT.columns[0] - 120, 157, 6));

  // Server, fixed, so nothing can yank it. Lying on a slide-out tray under the stowed set. Size ESTIMATE.
  const Sv = SERVER;
  p.add('steel', rb(Sv.x0 - 10, Sv.x1 + 20, Sv.y0 - 6, Sv.y1 + 6, 12, Sv.z0 - 12, 2));
  p.add('black', rb(Sv.x0, Sv.x1, Sv.y0, Sv.y1, Sv.z0, Sv.z1, 6));
  for (let i = 0; i < 9; i++) p.add('felt', rb(Sv.x1 - 1, Sv.x1 + 0.5, Sv.y0 + 60 + i * 36, Sv.y0 + 82 + i * 36, Sv.z0 + 40, Sv.z1 - 40, 0.4));
  p.add('stop', cyl(5, 5, 3, 'x', Sv.x1 + 1, Sv.y1 - 34, Sv.z1 - 34, 16));

  // Control box at the bed end of the beam: red stop, and two hold-to-run buttons below it.
  const cy = B.yN - 28;
  p.add('white', rb(F.x1, F.x1 + 44, cy - 90, cy + 26, 560, 650, 5));
  p.add('stop', cyl(21, 16, 22, 'x', F.x1 + 54, cy - 32, 618, 28));
  p.add('black', cyl(10, 10, 6, 'x', F.x1 + 46, cy - 60, 582, 20), cyl(10, 10, 6, 'x', F.x1 + 46, cy - 4, 582, 20));
  p.into(g);

  // Duct cover: separate, so the mechanism close-up can leave it off.
  const D = DUCT;
  const cover = solo(rb(0, D.x1, D.y0, D.y1, D.z0, D.z1, 7), M.white);
  g.add(cover);

  const chain = new THREE.Mesh(new THREE.BufferGeometry(), M.black);
  chain.castShadow = true; chain.receiveShadow = true;
  g.add(chain);
  return { group: g, cover, chain };
}

/** Cable chain as links: fixed end, bend moving at half speed, moving end. Rebuilt when the slider moves. */
function chainGeometry(movingY) {
  const D = DUCT; const R = D.chainR; const pitch = 20;
  const zLow = 768; const zHigh = zLow + 2 * R;
  const b = chainLoopY(movingY);
  const out = [];
  const link = (y, z, ang) => {
    const g = new THREE.BoxGeometry(40, pitch - 2, 15);
    g.rotateX(ang).translate(86, y, z);
    out.push(g.toNonIndexed());
  };
  for (let y = D.chainFixedY; y < b; y += pitch) link(y + pitch / 2, zLow, 0);
  const n = Math.ceil((Math.PI * R) / pitch);
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; link(b + Math.cos(a) * R, zLow + R + Math.sin(a) * R, a + Math.PI / 2); }
  for (let y = movingY; y < b; y += pitch) link(y + pitch / 2, zHigh, 0);
  return mergeGeometries(out);
}

/** The set: rear tray with the tools, leaf on a hinge, extractor arm. Local z is relative to the tray's top face. */
function buildSet(M) {
  const g = new THREE.Group();
  const s = SET; const p = new Parts(M);
  const th = s.thick;
  p.add('white', rb(s.x0, s.hinge, s.y0, s.y1, -th, 0, 3));
  p.add('esd', rb(s.x0 + 8, s.hinge - 4, s.y0 + 8, s.y1 - 8, 0, 3, 1));
  // Arms under the tray from the column carriages, and the carriages.
  for (const y of LIFT.columns) {
    p.add('steel', rb(206, 500, y - 20, y + 20, -th - 30, -th, 3));
    p.add('steel', rb(206, 240, y - 20, y + 20, -th - 95, -th - 28, 3));
    p.add('steel', rb(199, 240, y - 34, y + 34, -th - 95 - LIFT.carriage, -th - 95, 4));
  }
  // Soldering station. Everything fixed down on the rear tray, since the leaf goes vertical when stowed.
  const yS = s.y0 + 50;
  p.add('black', rb(226, 420, yS, yS + 190, 3, 96, 6));
  p.add('stop', cyl(13, 13, 8, 'x', 424, yS + 150, 54, 24));
  p.add('felt', rb(419, 421, yS + 22, yS + 104, 44, 82, 1));
  p.add('steelPale', cyl(14, 22, 96, 'y', 310, yS + 240, 34, 24));
  p.add('steel', rb(270, 370, yS + 200, yS + 300, 3, 16, 4));
  p.add('black', cyl(10, 7, 150, 'y', 395, yS + 255, 40, 16), cyl(3, 1.5, 44, 'y', 395, yS + 350, 40, 10));
  // Bench supply.
  const yP = yS + 330;
  p.add('steelPale', rb(226, 420, yP, yP + 210, 3, 130, 6));
  p.add('black', rb(419, 421, yP + 12, yP + 198, 16, 118, 1));
  for (const [dy, dz] of [[50, 82], [50, 42], [150, 82]]) p.add('steel', cyl(11, 11, 12, 'x', 427, yP + dy, dz, 20));
  p.add('stop', cyl(5, 5, 12, 'x', 427, yP + 130, 42, 14));
  p.add('black', cyl(5, 5, 12, 'x', 427, yP + 170, 42, 14));
  // Small parts drawers.
  const yD = yP + 240;
  p.add('white', rb(226, 400, yD, yD + 200, 3, 112, 4));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    p.add('steelPale', rb(399, 401, yD + 8 + c * 38, yD + 40 + c * 38, 12 + r * 33, 40 + r * 33, 1));
  }
  // Fume extractor: filter box with an arm that folds flat along the tray.
  const yE = s.y1 - 280;
  p.add('black', rb(226, 420, yE, yE + 240, 3, 150, 8));
  for (let i = 0; i < 7; i++) p.add('felt', rb(419, 421, yE + 28 + i * 28, yE + 44 + i * 28, 28, 124, 0.6));
  p.into(g);

  const ax = 323; const ay = yE + 120; const az = 150;
  const yaw = new THREE.Group(); yaw.position.set(ax, ay, az);
  const l1 = new THREE.Group();
  const l2 = new THREE.Group(); l2.position.set(250, 0, 0);
  const a1 = new Parts(M); a1.add('steelPale', cyl(10, 10, 250, 'x', 125, 0, 8, 16)); a1.add('black', cyl(15, 15, 34, 'y', 0, 0, 8, 20)); a1.into(l1);
  const a2 = new Parts(M); a2.add('steelPale', cyl(10, 10, 200, 'x', 100, 0, 8, 16)); a2.add('black', cyl(15, 15, 34, 'y', 0, 0, 8, 20));
  // Hood, opening downward at the arm's end.
  a2.add('black', cyl(26, 62, 36, 'z', 212, 0, -8, 32)); a2.into(l2);
  l1.add(l2); yaw.add(l1); g.add(yaw);

  // Leaf on its hinge. Local x runs out from the hinge when flat.
  const leaf = new THREE.Group(); leaf.position.set(s.hinge, 0, 0);
  const lp = new Parts(M);
  lp.add('white', rb(0, s.leaf, s.y0, s.y1, -th, 0, 3));
  lp.add('esd', rb(2, s.leaf - 8, s.y0 + 8, s.y1 - 8, 0, 3, 1));
  lp.add('steel', cyl(6, 6, s.y1 - s.y0 - 60, 'y', 0, (s.y0 + s.y1) / 2, -4, 14));
  // Ribs that land on the beam's pads, only at the ends so the stowed leaf stays out of the knees' way.
  for (const y of [s.y0 + 90, s.y1 - 90]) lp.add('white', rb(s.leaf - 32, s.leaf - 2, y - 30, y + 30, -th - 47, -th, 3));
  // Actuator brackets on the leaf's underside.
  for (const y of [s.y0 + 150, s.y1 - 150]) lp.add('steel', rb(24, 36, y - 10, y + 10, -96, -th, 2));
  lp.into(leaf);
  g.add(leaf);

  const rods = [s.y0 + 150, s.y1 - 150].map((y) => ({ y, body: unitRod(12, M, 'steel'), rod: unitRod(6, M, 'steelPale') }));
  for (const r of rods) g.add(r.body, r.rod);

  // Work in progress: only when it is up. The real thing has to be cleared by hand before it stows.
  const work = new THREE.Group();
  const wp = new Parts(M);
  const wy = 3230; // under the extractor's hood
  wp.add('steel', rb(s.hinge + 60, s.hinge + 240, wy - 90, wy + 90, 3, 15, 4));
  wp.add('steelPale', cyl(6, 6, 90, 'z', s.hinge + 80, wy - 70, 58, 14), cyl(6, 6, 90, 'z', s.hinge + 80, wy + 70, 58, 14));
  wp.add('pcb', rb(s.hinge + 72, s.hinge + 220, wy - 70, wy + 70, 100, 103, 1));
  for (let i = 0; i < 18; i++) wp.add('black', rb(s.hinge + 92 + (i % 6) * 20, s.hinge + 106 + (i % 6) * 20, wy - 55 + Math.floor(i / 6) * 40, wy - 30 + Math.floor(i / 6) * 40, 103, 107, 1));
  wp.add('copper', rb(s.hinge + 196, s.hinge + 212, wy - 60, wy + 60, 103, 104, 0.4));
  wp.add('stop', rb(s.hinge + 80, s.hinge + 170, wy - 360, wy - 220, 3, 30, 6));
  wp.add('felt', rb(s.hinge + 92, s.hinge + 160, wy - 346, wy - 260, 29, 31, 1));
  wp.into(work);
  g.add(work);
  return { group: g, leaf, rods, work, yaw, l1, l2 };
}

function buildChair(M) {
  const g = new THREE.Group();
  const p = new Parts(M); const C = CHAIR;
  const s = C.seat;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    p.add('black', new RoundedBoxGeometry(320, 44, 24, 2, 8).translate(160, 0, 70).rotateZ(a).toNonIndexed());
    p.add('steel', cyl(26, 26, 24, 'x', Math.cos(a) * 320, Math.sin(a) * 320, 26, 20));
  }
  p.add('black', cyl(22, 28, 190, 'z', 0, 0, 165, 20), cyl(15, 15, s - 240, 'z', 0, 0, (240 + s) / 2 - 60, 14));
  p.add('black', rb(-250, 250, -250, 250, s - 100, s, 40));
  p.add('black', rb(204, 280, -260, 260, s - 80, s + 500, 34));
  p.add('felt', rb(214, 270, -210, 210, s + 510, s + 720, 28));
  for (const y of [-280, 280]) p.add('felt', rb(-180, 80, y - 26, y + 26, s + 210, s + 240, 10), rb(40, 70, y - 14, y + 14, s - 30, s + 215, 6));
  p.into(g);
  g.position.set(C.x, C.y, 0);
  return g;
}

export function buildTable(M) {
  const root = new THREE.Group();
  const fixed = buildFixed(M);
  const moving = buildMoving(M);
  const set = buildSet(M);
  root.add(fixed.group, moving.group, set.group);
  const chair = buildChair(M);
  root.add(chair);
  let lastMoving = null;

  const setTable = (t) => {
    const st = tableState(t);
    moving.group.position.y = -st.travel;
    // Folded the leg points at the wall, down when deployed.
    const legAngle = (1 - st.leg) * Math.PI / 2;
    moving.hinge.rotation.y = legAngle;
    const L = LEG; const b = L.brace;
    const bx = L.pivot.x - Math.sin(legAngle) * b.at;
    const bz = L.pivot.z - Math.cos(legAngle) * b.at;
    // Slider-crank: solve the nut's x from the brace's fixed length, so it cannot quietly change length.
    const dz = bz - b.z;
    const sx = bx - Math.sqrt(Math.max(0, b.length * b.length - dz * dz));
    moving.nut.position.set(sx, L.pivot.y, moving.chainZ);
    spanXZ(moving.brace, sx, b.z, bx, bz, L.pivot.y);

    set.group.position.z = st.setZ;
    // Leaf: -90 stands up, 0 lies flat. Actuator lengths come from the geometry, not a guess.
    const leafA = -(1 - st.leaf) * Math.PI / 2;
    set.leaf.rotation.y = leafA;
    const Bx = SET.hinge + 30 * Math.cos(leafA) + -90 * Math.sin(leafA);
    const Bz = -30 * Math.sin(leafA) + -90 * Math.cos(leafA);
    const Ax = 400; const Az = -60;
    for (const r of set.rods) {
      const mx = (Ax + Bx) / 2; const mz = (Az + Bz) / 2;
      spanXZ(r.body, Ax, Az, mx + (Bx - Ax) * 0.05, mz + (Bz - Az) * 0.05, r.y);
      spanXZ(r.rod, mx, mz, Bx, Bz, r.y);
    }
    set.work.visible = st.lift > 0.995;
    // Extractor arm: flat along the tray when stowed, up and over the leaf when raised.
    const up = st.leaf;
    set.yaw.rotation.z = THREE.MathUtils.lerp(-Math.PI / 2, -0.78, up);
    set.l1.rotation.y = THREE.MathUtils.lerp(-0.08, -0.95, up);
    set.l2.rotation.y = THREE.MathUtils.lerp(0.06, 1.25, up);

    const my = DUCT.chainMovingY - st.travel;
    if (my !== lastMoving) {
      fixed.chain.geometry.dispose();
      fixed.chain.geometry = chainGeometry(my);
      lastMoving = my;
    }
    root.updateMatrixWorld(true);
  };
  const setCover = (on) => { fixed.cover.visible = on; };
  root.userData.setTable = setTable;
  root.userData.setCover = setCover;
  root.userData.setChair = (on) => { chair.visible = on; };
  root.userData.setTop = (on) => { moving.onTop.visible = on; };
  setTable(0);
  return root;
}

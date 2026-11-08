// Design B at render fidelity: a black steel frame, a full second bed on top, a lounge arm to the door.
// Bolted, not welded, because he may not weld: every joint shows its plates. Numbers live in loft-plan.mjs.
// Nothing here is a structural check; plate and bolt sizes show what such a joint looks like, not what it needs.
import * as THREE from 'three';
import { cushion, extrude, mergeGeometries, roundRect } from './forms.mjs';
import { Parts, cyl, rb, solo } from './table.mjs';
import { ARM, BEARER, BENCH, DECK, GUARD, IMAGE, LADDER, LEDGER_N, PERSON, PIANO, POSTS, PROJECTOR, ROBOT_BOX, SOUTH_BEAM, STEEL, UPPER, WALL_TIES, WEST_BEAM } from './loft-plan.mjs';
import { EAST } from './plan.mjs';

export const loftPianoPlace = { x: (PIANO.x0 + PIANO.x1) / 2, y: (PIANO.y0 + PIANO.y1) / 2, rot: -90 };

const U = DECK.underside; const T = DECK.top; const S = DECK.slatUnder;

/** Hex-headed bolt with washer on a face, axis along x or y. dir is the way the head points. */
function bolt(p, axis, x, y, z, dir, r = STEEL.bolt / 2) {
  const at = (d) => (axis === 'x' ? [x + d * dir, y, z] : [x, y + d * dir, z]);
  p.add('steelPale', cyl(r + 8, r + 8, 2.5, axis, ...at(1.25), 20));
  p.add('steelPale', cyl(r + 3, r + 3, 7.5, axis, ...at(6), 6));
}

/** A plate in the x-z plane between y0 and y1, its outline given as [x, z]. */
function plateXZ(outline, y0, y1) {
  const pts = outline.map(([x, z]) => new THREE.Vector2(x, z));
  return extrude(pts, y1 - y0, { basis: 'xz', at: -y1, radius: 1.2, segs: 2 });
}
/** A plate in the y-z plane between x0 and x1, its outline given as [y, z]. */
function plateYZ(outline, x0, x1) {
  const pts = outline.map(([y, z]) => new THREE.Vector2(y, z));
  return extrude(pts, x1 - x0, { basis: 'yz', at: x0, radius: 1.2, segs: 2 });
}

/** Gusset outline: a T over the post with a knee on each side that has one. u is along the beam. */
function gusset(u, half, west, east) {
  const knee = 190; const low = U - knee;
  return [
    [u - half, low], [u + half, low],
    ...(east ? [[u + half + 160, U - 4], [u + half + 160, T - 8]] : [[u + half, T - 8]]),
    ...(west ? [[u - half - 160, T - 8], [u - half - 160, U - 4]] : [[u - half, T - 8]]),
  ];
}

function buildFrame(M) {
  const p = new Parts(M);
  const pw = STEEL.post / 2;
  const fr = 4; // corner radius of the tube, ESTIMATE

  // Posts, on a rubber pad and a floor plate with levelling screws. Not fixed to the parquet: the load spreads and it can come out.
  for (const c of POSTS) {
    const [fx0, fx1, fy0, fy1] = c.foot;
    p.add('powder', rb(c.x - pw, c.x + pw, c.y - pw, c.y + pw, 14, U, fr));
    p.add('felt', rb(fx0, fx1, fy0, fy1, 0, 6, 2));
    p.add('powder', rb(fx0, fx1, fy0, fy1, 5, 14, 2.5));
    for (const fx of [fx0 + 16, fx1 - 16]) for (const fy of [fy0 + 16, fy1 - 16]) {
      p.add('steelPale', cyl(8, 8, 5, 'z', fx, fy, 16, 6));
    }
    // Angle cleats bolt the post to the plate: the plate is the only thing welding would change at the floor.
    const stub = 70;
    p.add('powder', rb(c.x - pw - 6, c.x - pw, c.y - 24, c.y + 24, 14, 14 + stub, 1.5), rb(c.x + pw, c.x + pw + 6, c.y - 24, c.y + 24, 14, 14 + stub, 1.5));
    bolt(p, 'x', c.x - pw - 6, c.y, 14 + stub - 24, -1, 5);
    bolt(p, 'x', c.x + pw + 6, c.y, 14 + stub - 24, 1, 5);
  }

  // Main beams. All undersides at 1300, tops flush with the deck.
  const SB = SOUTH_BEAM; const A = ARM; const mw = STEEL.mainWidth; const bw = STEEL.beamWidth;
  p.add('powder', rb(SB.x0, SB.x1, SB.y0, SB.y1, U, T, fr));
  p.add('powder', rb(A.x0, A.x0 + mw, A.y0, A.y1, U, T, fr)); // arm, west
  p.add('powder', rb(A.x1 - mw, A.x1, A.y0, A.y1, U, T, fr)); // arm, east
  p.add('powder', rb(A.x0, A.x1, A.y0, A.y0 + bw, U, T, fr)); // arm, south end
  p.add('powder', rb(WEST_BEAM.x0, WEST_BEAM.x1, WEST_BEAM.y0, WEST_BEAM.y1, U, T, fr)); // bed, west end
  p.add('powder', rb(EAST - mw, EAST, SB.y1, 4989 - pw, U, T, fr)); // bed, east along the wall

  // Upper bed: slats on a middle bearer and two side angles.
  const slats = [];
  for (let x = WEST_BEAM.x1 + 18; x + DECK.slatWidth <= EAST - mw; x += DECK.slatPitch) {
    slats.push(rb(x, x + DECK.slatWidth, SB.y1 + 2, LEDGER_N.y - LEDGER_N.thick - 2, S, T, 2));
  }
  p.add('oak', ...slats);
  p.add('powder', rb(WEST_BEAM.x1, EAST - mw, BEARER.y - BEARER.w / 2, BEARER.y + BEARER.w / 2, BEARER.z0, BEARER.z1, 3));
  p.add('powder', rb(WEST_BEAM.x1, EAST - mw, SB.y1, SB.y1 + 34, S - 6, S, 1.5)); // south seat for the slats

  // North wall angle, with its anchors.
  const L = LEDGER_N;
  p.add('powder', rb(L.x0, L.x1, L.y - L.thick, L.y, L.z0, L.z1, 1.5), rb(L.x0, L.x1, L.y - L.leg, L.y, S - L.thick, S, 1.5));
  for (let i = 0; i < L.anchors; i++) {
    const x = L.x0 + 80 + ((L.x1 - L.x0 - 160) * i) / (L.anchors - 1);
    bolt(p, 'y', x, L.y - L.thick, (L.z0 + S - L.thick) / 2, -1);
  }

  // Lounge arm: oak boards along its length on cross bearers.
  const boardW = 128;
  const boards = [];
  for (let x = A.x0 + mw + 3; x + boardW <= A.x1 - mw + 1; x += boardW + 3) boards.push(rb(x, x + boardW, A.y0 + bw + 2, A.y1 - 2, S, T, 2));
  p.add('oak', ...boards);
  for (let y = A.y0 + 600; y < A.y1 - 100; y += 560) p.add('powder', rb(A.x0 + mw, A.x1 - mw, y - 20, y + 20, S - 40, S, 3));

  // Plates, each face of the joint, so the close-up shows what a bolted frame really looks like.
  const postBolts = (u, axis, fixed, dir) => {
    for (const z of [U - 40, U - 110]) (axis === 'y' ? bolt(p, 'y', u, fixed, z, dir) : bolt(p, 'x', fixed, u, z, dir));
  };
  const beamBolts = (u, axis, fixed, dir, west, east) => {
    const list = [-30, 30];
    if (west) list.push(-105, -170);
    if (east) list.push(105, 170);
    for (const d of list) (axis === 'y' ? bolt(p, 'y', u + d, fixed, (U + T) / 2, dir) : bolt(p, 'x', fixed, u + d, (U + T) / 2, dir));
  };
  const t = STEEL.plate;
  // Posts on the south beam: plates on its south and north faces, in x-z. A knee only where there is room.
  for (const [c, west, east] of [[POSTS[0], true, true], [POSTS[1], true, false], [POSTS[2], true, false]]) {
    const o = gusset(c.x, pw, west, east);
    p.add('powder', plateXZ(o, SB.y0 - t, SB.y0), plateXZ(o, SB.y1, SB.y1 + t));
    postBolts(c.x, 'y', SB.y0 - t, -1);
    beamBolts(c.x, 'y', SB.y0 - t, -1, west, east);
    postBolts(c.x, 'y', SB.y1 + t, 1);
    beamBolts(c.x, 'y', SB.y1 + t, 1, west, east);
  }
  // Arm posts: plates on the faces running north, in y-z.
  const lp = POSTS[4];
  const ow = gusset(lp.y, pw, false, true);
  p.add('powder', plateYZ(ow, A.x0 - t, A.x0), plateYZ(ow, A.x0 + mw, A.x0 + mw + t));
  for (const [fx, d] of [[A.x0 - t, -1], [A.x0 + mw + t, 1]]) { postBolts(lp.y, 'x', fx, d); beamBolts(lp.y, 'x', fx, d, false, true); }
  const dp = POSTS[5];
  p.add('powder', plateYZ(gusset(dp.y, pw, false, true), EAST - mw - t, EAST - mw));
  postBolts(dp.y, 'x', EAST - mw - t, -1); beamBolts(dp.y, 'x', EAST - mw - t, -1, false, true);
  const np = POSTS[3];
  p.add('powder', plateYZ(gusset(np.y, pw, true, false), EAST - mw - t, EAST - mw));
  postBolts(np.y, 'x', EAST - mw - t, -1); beamBolts(np.y, 'x', EAST - mw - t, -1, true, false);
  // Arm beams land on the south beam with an angle each side.
  for (const x of [A.x0 + mw / 2, A.x1 - mw / 2]) {
    p.add('powder', rb(x - mw / 2 - 6, x - mw / 2, SB.y0 - 80, SB.y0, U + 6, T - 6, 1.5));
    bolt(p, 'x', x - mw / 2 - 6, SB.y0 - 40, (U + T) / 2, -1);
  }

  // Wall ties: stop sway, carry no weight. Angle on the post's side and flat on the wall, one anchor.
  for (const w of WALL_TIES) {
    const fy = w.y + w.side * pw;
    const y0 = w.side > 0 ? fy : fy - 72; const y1 = w.side > 0 ? fy + 72 : fy;
    p.add('powder', rb(EAST - 6, EAST, y0, y1, w.z - 45, w.z + 45, 1.5));
    p.add('powder', rb(EAST - mw, EAST, w.side > 0 ? fy : fy - 6, w.side > 0 ? fy + 6 : fy, w.z - 45, w.z + 45, 1.5));
    bolt(p, 'x', EAST - 6, fy + w.side * 44, w.z, -1, 5);
    bolt(p, 'y', EAST - mw / 2, fy + w.side * 6, w.z, w.side, 5);
  }

  // Guard for the sleeper: west end and the open south side.
  const G = GUARD; const q = G.section; const gy = SB.y0 + 15; const gx = WEST_BEAM.x0 + 5;
  const allPosts = [...G.postsSouth.map((x) => [x, gy]), ...G.postsWest.slice(1).map((y) => [gx, y])];
  for (const [x, y] of allPosts) p.add('powder', rb(x - q / 2, x + q / 2, y - q / 2, y + q / 2, T - 6, G.top, 3));
  // Each stands on a little plate bolted to the beam's outer face.
  for (const x of G.postsSouth) {
    p.add('powder', rb(x - 30, x + 30, SB.y0 - 6, SB.y0, U + 8, T + 96, 1.5), rb(x - 30, x + 30, SB.y0 - 6, gy - 15, T + 90, T + 96, 1.5));
    bolt(p, 'y', x - 16, SB.y0 - 6, (U + T) / 2, -1, 4); bolt(p, 'y', x + 16, SB.y0 - 6, (U + T) / 2, -1, 4);
  }
  for (const y of G.postsWest.slice(1)) {
    p.add('powder', rb(WEST_BEAM.x0 - 6, WEST_BEAM.x0, y - 30, y + 30, U + 8, T + 96, 1.5), rb(WEST_BEAM.x0 - 6, gx - 15, y - 30, y + 30, T + 90, T + 96, 1.5));
    bolt(p, 'x', WEST_BEAM.x0 - 6, y - 16, (U + T) / 2, -1, 4); bolt(p, 'x', WEST_BEAM.x0 - 6, y + 16, (U + T) / 2, -1, 4);
  }
  for (const z of [G.top, G.mid]) {
    const r0 = z === G.top ? z - 18 : z - 8; // top is a tube you can grip, the middle a flat bar
    p.add('powder', rb(G.postsSouth[0] - 15, G.xEnd + 15, gy - q / 2 - (z === G.top ? 2 : -9), gy + q / 2 + (z === G.top ? 2 : -9), r0, z, 3));
    p.add('powder', rb(gx - q / 2 - (z === G.top ? 2 : -9), gx + q / 2 + (z === G.top ? 2 : -9), gy - 15, G.postsWest[2] + 15, r0, z, 3));
  }

  // Ladder: two stringers, five rungs, standing on the floor and bolted to the arm's south end. Stringers end in handles.
  const Ld = LADDER;
  const left = [Ld.x0, Ld.x0 + Ld.stringer]; const right = [Ld.x1 - Ld.stringer, Ld.x1];
  for (const [a, b] of [left, right]) {
    p.add('powder', rb(a, b, Ld.y0, Ld.y1, 6, Ld.handleTop, 6));
    p.add('felt', rb(a - 5, b + 5, Ld.y0 - 5, Ld.y1 + 5, 0, 8, 2));
    p.add('powder', rb(a, b, Ld.y1, Ld.y1 + 8 + 3, U + 10, T - 10, 1));
    bolt(p, 'y', (a + b) / 2, Ld.y0, (U + T) / 2, -1, 5);
  }
  for (const z of Ld.rungs) {
    const g = new THREE.CylinderGeometry(Ld.rungDia / 2, Ld.rungDia / 2, left[1] < right[0] ? right[0] - left[1] : 1, 24);
    g.rotateZ(Math.PI / 2);
    g.translate((left[1] + right[0]) / 2, (Ld.y0 + Ld.y1) / 2, z);
    p.add('steelPale', g.toNonIndexed());
    bolt(p, 'x', left[0], (Ld.y0 + Ld.y1) / 2, z, -1, 4);
    bolt(p, 'x', right[1], (Ld.y0 + Ld.y1) / 2, z, 1, 4);
  }
  return p;
}

/** Upper bed: thin mattress, duvet turned back, pillows at the east wall, so the sleeper looks out at the windows. */
function buildUpperBed(M, g) {
  const B = UPPER;
  const mw = B.x1 - B.x0 - 4; const md = B.y1 - B.y0 - 4;
  const matt = cushion(mw, md, B.mattress, { r: 26, crown: 0.025, seed: 19, wrinkle: 0.4, density: 28, pinch: 0.02 });
  matt.translate((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, T + B.mattress / 2);
  g.add(solo(matt, M.linen));
  const dx0 = B.x0 + 4; const dx1 = B.x1 - 660;
  const duvet = cushion(dx1 - dx0, B.y1 - B.y0 + 6, 80, { r: 38, crown: 0.1, seed: 27, wrinkle: 3.4, density: 20, pinch: 0.01 });
  duvet.translate((dx0 + dx1) / 2, (B.y0 + B.y1) / 2 - 3, B.top + 22);
  g.add(solo(duvet, M.duvet));
  const band = cushion(310, B.y1 - B.y0 + 2, 48, { r: 22, crown: 0.14, seed: 33, wrinkle: 2.2, density: 18, pinch: 0.01 });
  band.translate(dx1 - 140, (B.y0 + B.y1) / 2 - 2, B.top + 74);
  g.add(solo(band, M.pillow));
  const pillow = (y, r, z, seed) => {
    const c = cushion(480, 575, 96, { r: 30, crown: 0.42, seed, wrinkle: 3, density: 16, pinch: 0.34, seam: 1.4 });
    c.rotateZ(r); c.rotateY(-0.42); c.translate(B.x1 - 262, y, z);
    return c;
  };
  g.add(solo(pillow(B.y0 + 298, -0.03, B.top + 112, 41), M.pillow));
  g.add(solo(pillow(B.y0 + 898, 0.04, B.top + 108, 42), M.pillow));
}

function buildLounge(M, g) {
  const A = ARM;
  const x0 = A.x0 + 14; const x1 = EAST - 12; const y0 = A.y0 + 50; const y1 = A.y1 - 10;
  const n = 3; const len = (y1 - y0 - (n - 1) * 3) / n;
  for (let i = 0; i < n; i++) {
    const c = cushion(x1 - x0, len, A.cushion, { r: 26, crown: 0.08, seed: 50 + i, wrinkle: 1.3, density: 18, pinch: 0.05, seam: 1.8 });
    c.translate((x0 + x1) / 2, y0 + len / 2 + i * (len + 3), T + A.cushion / 2);
    g.add(solo(c, M.fabric));
  }
  // Back cushions against the wall, loose. ESTIMATE, as on the seat, one more because the arm is longer.
  const m = 4; const w = (y1 - y0 - 60) / m;
  for (let i = 0; i < m; i++) {
    const c = cushion(120, w - 12, 340, { r: 34, crown: 0.14, seed: 60 + i, wrinkle: 2.6, density: 12, pinch: 0.16, seam: 2.2 });
    c.rotateY(-0.16 + i * 0.012);
    c.translate(EAST - 94, y0 + 30 + w / 2 + i * w, T + A.cushion + 168);
    g.add(solo(c, M.fabric));
  }
}

/** The robot's home: a plain white box behind the piano, door on the north. Same flush door as the corner box's. */
function buildRobotBox(M, g) {
  const R = ROBOT_BOX;
  const cx = (R.x0 + R.x1) / 2;
  g.add(solo(rb(R.x0, R.x1, R.y0, R.y1, 0, R.z1, 8), M.white));
  const d = R.door;
  const dx0 = cx - d.w / 2; const dx1 = cx + d.w / 2; const z0 = 12; const z1 = z0 + d.h;
  // Reveal first, leaf proud of it: the shadow line is what reads as a door.
  g.add(solo(extrude(roundRect(dx0 - 3, z0 - 3, dx1 + 3, z1 + 3, 14), 10, { basis: 'xz', at: -(R.y1 + 1), along: 'z' }), M.felt));
  g.add(solo(extrude(roundRect(dx0, z0, dx1, z1, 12), 10, { basis: 'xz', at: -(R.y1 + 3), radius: 2, segs: 2, along: 'z' }), M.white));
}

/** Bench, tucked between the piano's cheeks when no one plays. ESTIMATE: not his, he has not said what he uses. */
function buildBench(M, p, x0) {
  const B = BENCH;
  const y0 = B.y - B.w / 2; const y1 = B.y + B.w / 2; const x1 = x0 + B.d;
  p.add('powder', rb(x0 + 14, x0 + 34, y0 + 12, y1 - 12, B.h - 62, B.h - 30, 3), rb(x1 - 34, x1 - 14, y0 + 12, y1 - 12, B.h - 62, B.h - 30, 3));
  for (const y of [y0 + 12, y1 - 32]) for (const x of [x0 + 14, x1 - 34]) p.add('powder', rb(x, x + 20, y, y + 20, 0, B.h - 30, 3));
  p.add('oak', rb(x0, x1, y0, y1, B.h - 30, B.h, 6));
}

function buildProjector(M, g, p) {
  const P = PROJECTOR;
  const y0 = P.y - P.w / 2; const y1 = P.y + P.w / 2;
  p.add('white', rb(P.x0, P.x1, y0, y1, P.z0, P.z0 + 72, 12));
  p.add('powder', rb(P.x0 + 90, P.x1 - 90, P.y - 40, P.y + 40, P.z0 + 72, P.z1, 2));
  p.add('black', cyl(29, 32, 26, 'x', P.x1 + 12, P.y - 54, P.z0 + 36, 28));
  // The picture, on the bare east wall. Plain 0..1 UVs across it, as the other design's picture has.
  const pic = new THREE.PlaneGeometry(IMAGE.y1 - IMAGE.y0, IMAGE.z1 - IMAGE.z0);
  pic.rotateX(Math.PI / 2);
  pic.rotateZ(-Math.PI / 2);
  pic.translate(EAST - 1.5, (IMAGE.y0 + IMAGE.y1) / 2, (IMAGE.z0 + IMAGE.z1) / 2);
  const m = new THREE.Mesh(pic, M.image);
  m.castShadow = false;
  g.add(m);
}

/* --- people, to scale: a neutral figure, sitting height PERSON.sitting, standing PERSON.height. --- */

function limb(a, b, r0, r1) {
  const A = new THREE.Vector3(...a); const B = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(B, A); const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 16, 1, true).toNonIndexed();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  const end = (v, r) => new THREE.SphereGeometry(r, 16, 12).translate(v.x, v.y, v.z).toNonIndexed();
  return [g, end(A, r0), end(B, r1)];
}
function blob(c, a, b, h) {
  return new THREE.SphereGeometry(1, 28, 20).scale(a, b, h).translate(...c).toNonIndexed();
}

/**
 * Origin at the seat under the hips, facing +x. thigh: degrees above horizontal. shin: degrees forward of straight down.
 * hands: 'rest' on the thighs, 'keys' forward.
 */
function figure({ thigh = 0, shin = 0, hands = 'rest', lift = 0 }) {
  const parts = [];
  const add = (...g) => parts.push(...g);
  const headTop = PERSON.sitting;
  const z = (v) => v + lift;
  add(blob([0, 0, z(112)], 112, 168, 112));
  add(...limb([0, 0, z(190)], [-6, 0, z(330)], 118, 122).map((g) => g.scale(0.8, 1.28, 1)));
  add(...limb([-6, 0, z(330)], [-8, 0, z(500)], 122, 112).map((g) => g.scale(0.84, 1.62, 1)));
  add(...limb([-6, 0, z(610)], [4, 0, z(735)], 50, 46));
  add(blob([16, 0, z(headTop - 108)], 92, 76, 108));
  for (const s of [1, -1]) {
    const hip = [0, s * 92, z(105)];
    const t = THREE.MathUtils.degToRad(thigh);
    const knee = [hip[0] + 470 * Math.cos(t), hip[1], hip[2] + 470 * Math.sin(t)];
    const c = THREE.MathUtils.degToRad(shin);
    const ankle = [knee[0] + 450 * Math.sin(c), knee[1], knee[2] - 450 * Math.cos(c)];
    add(...limb(hip, knee, 78, 52), ...limb(knee, ankle, 50, 32));
    add(blob([ankle[0] + 75 * Math.cos(c), ankle[1], ankle[2] - 22 * Math.cos(c) + 40 * Math.sin(c)], 125, 48, 38));
    const shoulder = [0, s * 212, z(575)];
    const elbow = hands === 'keys' ? [90, s * 240, z(330)] : [24, s * 238, z(315)];
    const wrist = hands === 'keys' ? [345, s * 175, z(250)] : [255, s * 138, z(205 + 470 * Math.sin(t) * 0.5)];
    add(...limb(shoulder, elbow, 48, 38), ...limb(elbow, wrist, 36, 25));
    add(blob([wrist[0] + 52, wrist[1], wrist[2]], 62, 34, 18));
  }
  return mergeGeometries(parts);
}

/** Who sits where. x, y are under the hips, seat the surface they sit on, yaw the way they face. */
export const PEOPLE = {
  loungeBack: { at: [2400, 2500], seat: T + ARM.cushion, yaw: 180, thigh: 45, shin: 20 },
  loungeEdge: { at: [2195, 3000], seat: T + ARM.cushion, yaw: 180, thigh: 0, shin: 8 },
  loungeEdge2: { at: [2215, 1980], seat: T + ARM.cushion, yaw: 195, thigh: 0, shin: 14 },
  upperBed: { at: [2240, 4470], seat: UPPER.top, yaw: 180, thigh: 3, shin: 78 },
  lowPillow: { at: [470, 4470], seat: 320, yaw: 0, thigh: 3, shin: 78 },
  lowMiddle: { at: [1410, 4180], seat: 320, yaw: 0, thigh: 3, shin: 78 },
  piano: { at: [PIANO.x0 - PERSON.headFromKeys, BENCH.y], seat: BENCH.h, yaw: 0, thigh: -6, shin: 4, hands: 'keys' },
  standing: { at: [1330, 2050], seat: 0, yaw: 270, thigh: -90, shin: 0, lift: PERSON.height - PERSON.sitting },
};

function buildPeople(names, g, M) {
  for (const n of names) {
    const d = PEOPLE[n];
    if (!d) continue;
    const m = solo(figure(d), M.figure);
    m.rotation.z = THREE.MathUtils.degToRad(d.yaw);
    m.position.set(d.at[0], d.at[1], d.seat);
    g.add(m);
  }
}

export function buildLoft(M, { people = [] } = {}) {
  const g = new THREE.Group();
  const p = buildFrame(M);
  buildUpperBed(M, g);
  buildLounge(M, g);
  buildRobotBox(M, g);
  // Someone at the piano means the bench is out; otherwise it stays tucked under the keys, out of the walking band.
  buildBench(M, p, people.includes('piano') ? BENCH.useX0 : BENCH.tuckX0);
  buildProjector(M, g, p);
  p.into(g);
  buildPeople(people, g, M);
  // Design B has nothing that folds. The page calls this whichever design is up.
  g.userData.setFold = () => {};
  return g;
}


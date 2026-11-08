// The two pieces at render fidelity: the folding seat with its corner box, and the low bed.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cushion, extrude, fillet, hold, mergeGeometries, pebble, roundRect, slab, softPad } from './forms.mjs';
import { BED, BOX_TOP, CABLE_DIAMETER, CABLE_X, CEILING, CUSHION, CUSHION_EDGE_INSET, DECK_EDGE, DECK_THICK, EAST, HAND_FOLD, HINGE, LEDGER, LIFT_LINE, REEL, SEAT_TOP, VARIANTS, cablePoints, deckOutline, fittingAt, handWinchAt, liftEyeAt } from './plan.mjs';

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function nonIndexed(g) { return g.index ? g.toNonIndexed() : g; }

/**
 * The seat, drawn open with its hinge line at the origin of `pivot`, so setFold only turns one group.
 * Local frame: x runs away from the wall as negative, z up from the seat's top surface.
 */
function buildSeat(variant, M) {
  const pts = deckOutline(variant);
  const outline = fillet(pts, 16).map((p) => new THREE.Vector2(p.x - HINGE.x, p.y));
  // Wing section: top flat, rolled edge, belly rising to the thin free edge. Rings as [inset, z from top].
  const e = DECK_EDGE; const t = DECK_THICK;
  const profile = [[110, 0], [60, 0], [14, 0]];
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI; profile.push([e / 2 - Math.sin(a) * (e / 2) - 3 * Math.sin(a), -(e / 2) + Math.cos(a) * (e / 2)]); }
  profile.push([e / 2 + 16, -e - 0.5], [80, -e - (t - e) * 0.42], [150, -e - (t - e) * 0.8], [230, -t]);
  const deck = mesh(pebble(outline, profile, { along: 'y' }), M.oak);

  // Seat pad, following the outline 30 in at the ends and clear of the cable fittings on the free edge.
  const padLine = fillet(pts.map(([x, y, r], i) => {
    const dx = i < 2 ? -8 : CUSHION_EDGE_INSET; const dy = i === 0 || i === 4 ? 30 : i === 1 || i === 2 ? -30 : 0;
    return [x + dx, y + dy, Math.max(0, r - 24)];
  }), 18).map((p) => new THREE.Vector2(p.x - HINGE.x, p.y));
  const pad = mesh(softPad(padLine, 1, CUSHION, { edgeR: 26, crown: 7, seed: 3 }), M.fabric);

  const seat = new THREE.Group();
  seat.add(deck, pad);

  // Cable fittings set into the free edge, outside the pad.
  for (const y of cablePoints(variant)) {
    const stud = new THREE.CylinderGeometry(15, 19, 12, 24); stud.rotateX(Math.PI / 2);
    stud.translate(CABLE_X - HINGE.x, y, 4);
    seat.add(mesh(stud, M.steel));
  }
  // The eye the lift line hooks into to fold, on the free edge at mid length.
  const eye = new THREE.TorusGeometry(11, 2.6, 8, 20); eye.rotateY(Math.PI / 2);
  const mid = liftEyeAt(variant, 0);
  eye.translate(mid.x - HINGE.x, mid.y, 13);
  seat.add(mesh(eye, M.steel));
  return seat;
}

/** Oak ledger with its hinge knuckles and bolts. Fixed to the wall; the seat turns about its top edge. */
function buildLedger(variant, M) {
  const g = new THREE.Group();
  const { y0, y1 } = VARIANTS[variant].deck;
  const L = LEDGER;
  const section = [[EAST + 10, L.z0, 0], [EAST - L.depth + 4, L.z0, 12], [EAST - L.depth, L.lipZ0, 0], [EAST - L.depth - L.lip, L.lipZ0, 8], [EAST - L.depth - L.lip, L.lipZ1, 6], [EAST - L.depth, L.lipZ1, 0], [EAST - L.depth, L.z1, 4], [EAST + 10, L.z1, 0]];
  const outline = fillet(section, 6);
  const shape = new THREE.Shape(outline);
  void shape;
  const body = extrude(outline, y1 - y0 - 8, { basis: 'xz', at: -(y1 - 4), radius: 6, segs: 3, along: 'y' });
  g.add(mesh(body, M.oak));
  // Bolts on the ledger's face, into the brick behind the plaster. Spacing ESTIMATE.
  const bolts = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const y = y0 + 90 + ((y1 - y0 - 180) * i) / (n - 1);
    const b = new THREE.CylinderGeometry(11, 13, 5, 18); b.rotateZ(Math.PI / 2); b.translate(EAST - L.depth - 2, y, L.z0 + 34);
    bolts.push(nonIndexed(b));
  }
  g.add(mesh(mergeGeometries(bolts), M.steel));
  // Barrel hinges along the top edge, ESTIMATE: 3 x 150 mm.
  const hinges = [];
  for (const k of [0.14, 0.5, 0.86]) {
    const y = y0 + (y1 - y0) * k;
    const h = new THREE.CylinderGeometry(7, 7, 150, 16); h.rotateZ(0); h.translate(HINGE.x, y, HINGE.z + 2);
    hinges.push(nonIndexed(h));
  }
  g.add(mesh(mergeGeometries(hinges), M.steel));
  return g;
}

/** Corner box: white, soft edges, flush robot door low on the south face, holds above it, oak cap. */
function buildBox(variant, M) {
  const g = new THREE.Group();
  const v = VARIANTS[variant];
  const b = v.box;
  const cap = 34; // ESTIMATE
  const R = 26;
  const freeNorth = variant === 'south';
  const plan = fillet([[b.x0, b.y0, R], [EAST + 80, b.y0, 0], [EAST + 80, freeNorth ? b.y1 : b.y1 + 80, 0], [b.x0, freeNorth ? b.y1 : b.y1 + 80, freeNorth ? R : 0]], 8);

  // Body carries a door-shaped recess in its south face, so the closed door reads as a real leaf.
  g.add(mesh(extrude(plan, BOX_TOP - cap + 4, { at: -4, radius: 0, along: 'z' }), M.white));
  const edge = extrude(fillet([[b.x0 - 4, b.y0 - 4, R + 4], [EAST + 40, b.y0 - 4, 0], [EAST + 40, freeNorth ? b.y1 + 4 : b.y1 + 40, 0], [b.x0 - 4, freeNorth ? b.y1 + 4 : b.y1 + 40, freeNorth ? R + 4 : 0]], 8), cap, { at: BOX_TOP - cap, radius: 8, segs: 4, along: 'y' });
  g.add(mesh(edge, M.oak));

  // Robot door, 450 x 500 per study, flush with a 3 mm reveal. Its shadow line is what you see.
  const dx0 = (b.x0 + EAST) / 2 - v.door.w / 2;
  const dx1 = dx0 + v.door.w;
  const z0 = v.door.z0; const z1 = z0 + v.door.h;
  const reveal = extrude(roundRect(dx0 - 3, z0 - 3, dx1 + 3, z1 + 3, 21), 10, { basis: 'xz', at: -(b.y0 + 8), along: 'z' });
  g.add(mesh(reveal, M.felt));
  g.add(mesh(extrude(roundRect(dx0, z0, dx1, z1, 18), 12, { basis: 'xz', at: -(b.y0 + 1.5), radius: 2, segs: 2, along: 'z' }), M.white));
  // A finger scoop instead of a handle, ESTIMATE; a robot pushes it, a person might.
  g.add(mesh(new THREE.TorusGeometry(14, 3, 8, 24).rotateX(Math.PI / 2).translate((dx0 + dx1) / 2, b.y0 - 2, z1 - 44), M.oak));

  // Holds: lumps that seem to grow from the face, bolted through.
  const holdsA = []; const holdsB = []; const bolts = [];
  v.holds.forEach(([x, z], i) => {
    const w = 78 + (i * 37) % 48; const d = 56 + (i * 23) % 30; const h = 40 + (i * 13) % 24; // ESTIMATE around the study's 90 x 70 x 50
    const geo = hold(w, d, h, i + 2);
    geo.rotateZ(((i * 71) % 60 - 30) * Math.PI / 180); // face plane, varied so it does not read as a grid
    geo.rotateX(Math.PI / 2); // out along -y, lip up
    geo.translate(x, b.y0 + 0.5, z);
    (i % 3 === 2 ? holdsB : holdsA).push(nonIndexed(geo));
    const bolt = new THREE.CylinderGeometry(7, 7, 6, 12);
    bolt.translate(x, b.y0 - h * 0.86, z);
    bolts.push(nonIndexed(bolt));
  });
  if (holdsA.length) g.add(mesh(mergeGeometries(holdsA), M.holdA));
  if (holdsB.length) g.add(mesh(mergeGeometries(holdsB), M.holdB));
  g.add(mesh(mergeGeometries(bolts), M.steel));
  return g;
}

export function buildPlatform(variant, M) {
  const root = new THREE.Group();
  root.add(buildBox(variant, M), buildLedger(variant, M));
  const pivot = new THREE.Group();
  pivot.position.set(HINGE.x, 0, HINGE.z);
  pivot.add(buildSeat(variant, M));
  root.add(pivot);

  // Load cables: straight down from a ceiling reel to the outer edge. Rescaled, not rebuilt, so the fold slider stays cheap.
  const reelBottom = CEILING - REEL.height;
  const cables = cablePoints(variant).map((y) => {
    const reel = new THREE.CylinderGeometry(REEL.dia / 2, REEL.dia / 2 + 3, REEL.height, 28);
    reel.rotateX(Math.PI / 2); reel.translate(CABLE_X, y, CEILING - REEL.height / 2);
    root.add(mesh(reel, M.steel));
    const c = mesh(new THREE.CylinderGeometry(CABLE_DIAMETER / 2, CABLE_DIAMETER / 2, 1, 12).rotateX(Math.PI / 2), M.steel);
    c.position.set(CABLE_X, y, 0);
    root.add(c);
    return c;
  });
  // Separate slim lifting line from a small block high on the wall, drawn only while it is hooked on to fold.
  const eyeMid = liftEyeAt(variant, 0);
  const block = new RoundedBoxGeometry(26, 40, 56, 3, 7).translate(EAST - 13, eyeMid.y, LIFT_LINE.z);
  root.add(mesh(block, M.steel));
  const line = mesh(new THREE.CylinderGeometry(LIFT_LINE.diameter / 2, LIFT_LINE.diameter / 2, 1, 8), M.steel);
  root.add(line);
  // He folds it by hand: the haul runs along under the ceiling and down to a small hand winch past the seat's end.
  const w = handWinchAt(variant);
  const wy = EAST - 13;
  root.add(mesh(mergeGeometries([
    new THREE.CylinderGeometry(LIFT_LINE.diameter / 2, LIFT_LINE.diameter / 2, eyeMid.y - w.y, 8).translate(wy, (eyeMid.y + w.y) / 2, HAND_FOLD.runZ),
    new THREE.CylinderGeometry(LIFT_LINE.diameter / 2, LIFT_LINE.diameter / 2, HAND_FOLD.runZ - w.z, 8).rotateX(Math.PI / 2).translate(wy, w.y, (HAND_FOLD.runZ + w.z) / 2),
  ].map(nonIndexed)), M.steel));
  root.add(mesh(new RoundedBoxGeometry(26, 40, 56, 3, 7).translate(wy, w.y, HAND_FOLD.runZ), M.steel));
  root.add(mesh(mergeGeometries([
    new RoundedBoxGeometry(10, 90, 130, 2, 4).translate(EAST - 5, w.y, w.z),
    new THREE.CylinderGeometry(26, 26, 44, 24).rotateZ(Math.PI / 2).translate(EAST - 36, w.y, w.z),
    new RoundedBoxGeometry(70, 12, 10, 2, 3).translate(EAST - 70, w.y, w.z + 34),
    new THREE.CylinderGeometry(7, 7, 50, 12).translate(EAST - 100, w.y + 28, w.z + 34),
  ].map(nonIndexed)), M.steel));

  // Three back cushions against the wall, one per person. Loose, so they come off before folding. ESTIMATE.
  const loose = new THREE.Group();
  const { y0, y1 } = VARIANTS[variant].deck;
  const mid = (y0 + y1) / 2;
  [-1, 0, 1].forEach((k, i) => {
    const c = cushion(120, 390, 300, { r: 34, crown: 0.14, seed: 40 + i, wrinkle: 2.6, density: 12, pinch: 0.16, seam: 2.2 });
    c.rotateY(-0.16 + i * 0.01);
    c.rotateZ(0.015 * k);
    c.translate(EAST - 92, mid + k * 410, SEAT_TOP + CUSHION + 146);
    loose.add(mesh(c, M.fabric));
  });
  root.add(loose);

  const setFold = (t) => {
    const angle = Math.min(1, Math.max(0, t)) * 90;
    pivot.rotation.y = THREE.MathUtils.degToRad(angle);
    loose.visible = t < 0.02;
    // Open: taut and vertical. Any fold at all: reeled up, because they go slack as the edge rises and would only droop.
    const open = t < 0.02;
    const f = fittingAt(0);
    for (const c of cables) {
      const z0 = open ? f.z : reelBottom - 28;
      c.scale.set(1, 1, reelBottom - z0);
      c.position.z = (reelBottom + z0) / 2;
    }
    const eye = liftEyeAt(variant, angle);
    line.visible = !open;
    if (!open) {
      const top = new THREE.Vector3(LIFT_LINE.x, eye.y, LIFT_LINE.z - 28);
      const bottom = new THREE.Vector3(eye.x, eye.y, eye.z + Math.cos(THREE.MathUtils.degToRad(angle)) * 13);
      const d = new THREE.Vector3().subVectors(top, bottom);
      line.scale.set(1, d.length(), 1);
      line.position.copy(top).add(bottom).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    root.updateMatrixWorld(true);
  };
  root.userData.setFold = setFold;
  setFold(0);
  return root;
}

/** Low bed: oak-edged frame hiding a clear 10 cm channel, flush spring flap in the long edge, soft bedding. */
export function buildBed(M, { flapOpen = 0 } = {}) {
  const g = new THREE.Group();
  const B = BED;
  const F = B.flap;
  const rail = 20;
  const plan = roundRect(B.x0, B.y0, B.x1, B.y1, [20, 20, 0, 0]);
  void plan;
  // Long-edge rail with the flap's opening cut through it.
  const hole = roundRect(F.x0, F.z0, F.x1, F.z1, 9);
  const railOutline = roundRect(B.x0, 6, B.x1, B.frameTop, [0, 18, 18, 0]);
  g.add(mesh(extrude(railOutline, rail, { holes: [hole], basis: 'xz', at: -(B.y0 + rail), radius: 5, segs: 4, along: 'x' }), M.bedRail));
  // Foot-end rail on the east side; the box stands against it in one variant, open floor in the other.
  g.add(mesh(extrude(roundRect(B.y0 + 10, 6, B.y1, B.frameTop, [18, 0, 0, 18]), rail, { basis: 'yz', at: B.x1 - rail, radius: 5, segs: 4, along: 'y' }), M.bedRail));
  // Recessed plinth: the 6 mm gap under the rail reads as a shadow line.
  g.add(mesh(slab(B.x0, B.x1 - 30, B.y0 + 30, B.y1, 0, 7), M.felt));
  // Channel: floor board, ceiling board, and a back wall, lined dark so an open flap shows depth.
  g.add(mesh(slab(B.x0 + 4, B.x1 - rail, B.y0 + rail - 1, B.y1, 6, B.channel.z0), M.felt));
  g.add(mesh(slab(B.x0 + 4, B.x1 - rail, B.y0 + rail - 1, B.y1, B.channel.z1, B.frameTop), M.felt));
  g.add(mesh(slab(B.x0 + 4, B.x1 - rail, B.channel.y1, B.channel.y1 + 16, B.channel.z0, B.channel.z1), M.felt));

  // Flap: same outline minus a 1.5 mm reveal, hinged along its top inside the rail.
  const flap = new THREE.Group();
  flap.position.set(0, B.y0 + rail - 2, F.pivotZ);
  const leaf = extrude(roundRect(F.x0 + 1.5, F.z0 + 1.5 - F.pivotZ, F.x1 - 1.5, F.z1 - 1.5 - F.pivotZ, 7.5), rail - 2, { basis: 'xz', at: 0, radius: 4, segs: 3, along: 'x' });
  flap.add(mesh(leaf, M.bedRail));
  flap.rotation.x = THREE.MathUtils.degToRad(flapOpen); // pushing it swings the lower edge into the bed
  g.add(flap);

  // Mattress: boxy, crowned, sitting flush on the frame.
  const mw = B.x1 - B.x0 - 4; const md = B.y1 - B.y0 - 4; const mh = B.mattressTop - B.frameTop;
  const matt = cushion(mw, md, mh, { r: 30, crown: 0.025, seed: 9, wrinkle: 0.4, density: 28, pinch: 0.02 });
  matt.translate((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.frameTop + mh / 2);
  g.add(mesh(matt, M.linen));

  // Duvet: a soft closed form lying on the lower three quarters, its head end turned back in a band.
  const dz = B.mattressTop;
  const dx0 = B.x0 + 640; const dx1 = B.x1 - 6;
  const duvet = cushion(dx1 - dx0, B.y1 - B.y0 + 10, 84, { r: 40, crown: 0.1, seed: 7, wrinkle: 3.4, density: 20, pinch: 0.01 });
  duvet.translate((dx0 + dx1) / 2, (B.y0 + B.y1) / 2 - 6, dz + 24);
  g.add(mesh(duvet, M.duvet));
  const band = cushion(330, B.y1 - B.y0 + 2, 52, { r: 24, crown: 0.14, seed: 13, wrinkle: 2.2, density: 18, pinch: 0.01 });
  band.translate(dx0 + 150, (B.y0 + B.y1) / 2 - 4, dz + 76);
  g.add(mesh(band, M.pillow));

  // Two pillows at the head end, leaning on the wall block.
  const pillow = (y, r, z, seed) => {
    const p = cushion(480, 575, 96, { r: 30, crown: 0.42, seed, wrinkle: 3, density: 16, pinch: 0.34, seam: 1.4 });
    p.rotateZ(r); p.rotateY(0.42); p.translate(B.x0 + 268, y, z);
    return p;
  };
  g.add(mesh(pillow(B.y0 + 298, 0.03, dz + 112, 21), M.pillow));
  g.add(mesh(pillow(B.y0 + 898, -0.04, dz + 108, 22), M.pillow));

  // One accent cushion: the seat pad's colour, so the two pieces belong together.
  const acc = cushion(340, 420, 90, { r: 30, crown: 0.4, seed: 31, wrinkle: 2.6, density: 14, pinch: 0.3, seam: 1.6 });
  acc.rotateZ(0.1); acc.rotateY(0.34); acc.translate(B.x0 + 520, B.y0 + 560, dz + 102);
  g.add(mesh(acc, M.fabric));
  return g;
}

/** The projected picture on the wall at the foot of the bed, where the variant has one. ESTIMATE, illustrative. */
export function buildImage(variant, M) {
  const v = VARIANTS[variant];
  if (!v.image) return null;
  const { y0, y1, z0, z1 } = v.image;
  // Plain 0..1 UVs across the picture; the room's other textures are in metres.
  const g = new THREE.PlaneGeometry(y1 - y0, z1 - z0);
  g.rotateX(Math.PI / 2);
  g.rotateZ(-Math.PI / 2);
  g.translate(EAST - 1.5, (y0 + y1) / 2, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, M.image);
  m.castShadow = false;
  return m;
}

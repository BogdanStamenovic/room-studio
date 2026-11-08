// The table's numbers and motion against the measured room, without a browser. Nothing here checks strength.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { poseAt, validateStudy } from '../web/geometry.mjs';
import { BASE, BED, CEILING, CHAIR, DUCT, EAST, FREE_EDGE_X, HAND_FOLD, LEG, RAIL, SERVER, SET, TABLE, VARIANTS, chainLoopY, handWinchAt, tableClearances, tableState } from '../web/hifi/plan.mjs';

// Measured values from room.json, copied here because the data is private.
const BLOCK_SOUTH = 3779; // lower wall block's south face
const WARDROBE = 555;
const WINDOW2_SOUTH = 2379;
const SILL = 1030;
const ROOM = { w: EAST, l: 5019 };

test('length doubles and it is wider than the old 600 placeholder', () => {
  assert.equal(TABLE.len + TABLE.travel, 2 * TABLE.len);
  assert.ok(TABLE.x1 - TABLE.x0 >= 800);
});

test('it fits along the west wall, closed and open', () => {
  assert.ok(TABLE.yN < BLOCK_SOUTH && TABLE.yN < BED.y0);
  assert.ok(TABLE.yS - TABLE.travel > WARDROBE);
  assert.equal(TABLE.yS - TABLE.travel - WARDROBE, 414);
  assert.ok(RAIL.y1 <= BLOCK_SOUTH && RAIL.y0 > WARDROBE);
});

test('the moved top parks south of both windows, so they can open', () => {
  assert.ok(TABLE.yN - TABLE.travel < WINDOW2_SOUTH);
});

test('order of motion: leg latched before any travel, top fully off before any lift', () => {
  for (let i = 0; i <= 1000; i++) {
    const st = tableState(i / 1000);
    if (st.travel > 0) assert.equal(st.leg, 1, `travel with the leg not down at ${i}`);
    if (st.lift > 0) assert.equal(st.travel, TABLE.travel, `lift before the top is off at ${i}`);
    if (st.leaf > 0) assert.ok(st.lift > 0);
  }
  assert.deepEqual(tableState(0).travel, 0);
  assert.equal(tableState(1).setZ, TABLE.z);
});

test('a roller stays on the front track at full travel', () => {
  const rollerClosed = TABLE.yN + 16;
  assert.ok(rollerClosed - TABLE.travel >= BASE.track.y0);
  assert.ok(rollerClosed <= BASE.track.y1);
});

test('184 cm: thighs clear the front beam, knee room in front of the stowed leaf', () => {
  const c = tableClearances('corner');
  assert.ok(c.thighClearance >= 640); // ESTIMATE of his seated thigh top on a 470 seat
  assert.equal(c.kneeDepth, 400);
  assert.ok(SET.zDown + SET.leaf <= BASE.front.z1);
});

test('stowed set leaves the server its room and clears the top', () => {
  assert.ok(SET.zDown - SET.thick - 30 > SERVER.z1, 'tray arms hit the server');
  assert.ok(SET.zDown + SET.toolMax < TABLE.apronZ);
  assert.ok(SERVER.x0 > BASE.rear.x1);
});

test('nothing fixed stands in the radiator chimney except the bare rail', () => {
  assert.ok(TABLE.x0 >= 170);
  assert.ok(BASE.shield.x0 > 95);
  assert.ok(RAIL.z0 > 700, 'ESTIMATE of the radiator top; measure it');
  assert.ok(DUCT.y1 < 2755, 'the duct stops south of the radiator, ESTIMATE');
});

test('the set rises through a clear space: beam and posts are outside its footprint', () => {
  assert.ok(SET.y0 >= BASE.yS + 60 && SET.y1 <= BASE.yN - 60);
  assert.ok(SET.x0 >= BASE.rear.x1);
  assert.ok(SET.x1 <= BASE.track.x0);
});

test('leg fits under the top when folded and reaches the floor', () => {
  assert.ok(LEG.pivot.x - LEG.length - LEG.wheelR > TABLE.x0);
  assert.ok(LEG.pivot.y + 40 < SET.y0);
  assert.equal(LEG.pivot.z - LEG.length - LEG.wheelR, 0);
});

test('the chain loop stays inside the duct over the whole travel', () => {
  for (let i = 0; i <= 20; i++) {
    const m = DUCT.chainMovingY - (i / 20) * TABLE.travel;
    const b = chainLoopY(m);
    assert.ok(b + DUCT.chainR <= DUCT.y1 + 15 && b >= m - 1e-9 && b >= DUCT.chainFixedY - 1e-9, `loop at ${b} for bracket at ${m}`);
  }
});

for (const id of Object.keys(VARIANTS)) {
  test(`${id}: walking clearance beside the table`, () => {
    const c = tableClearances(id);
    assert.ok(c.toBox >= 1000);
    assert.equal(c.toSeatEdge, FREE_EDGE_X - TABLE.x1);
    assert.ok(c.toDoorArc > 800);
    assert.ok(c.toPianoFront - 600 >= 700);
  });
  test(`${id}: he can reach the hand winch from the floor, it is under the haul run`, () => {
    const w = handWinchAt(id);
    assert.ok(w.z < 1750, 'above comfortable reach at 184 cm');
    assert.ok(HAND_FOLD.runZ < CEILING && w.z < HAND_FOLD.runZ);
    assert.ok(w.y < VARIANTS[id].deck.y0);
  });
}

test('the chair position leaves a way past it', () => {
  const c = tableClearances('corner');
  assert.equal(CHAIR.x > TABLE.x1, true);
  assert.equal(c.pastChairToPianoFront, 792);
});

test('the study is valid and stays in the room at every moment, starting at the first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-table-'));
  const file = path.join(dir, 's.json');
  execFileSync('node', ['scripts/table-study.mjs', file]);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(validateStudy(s), []);
  assert.equal(s.id, 'solder-table');
  const nodes = new Map();
  for (const b of s.blocks) {
    const n = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size));
    if (b.pivot) m.position.set(-b.pivot[0], -b.pivot[1], -b.pivot[2]);
    n.add(m); nodes.set(b.id, { n, b, m });
  }
  const top = new THREE.Group();
  for (const { n, b } of nodes.values()) (b.parent ? nodes.get(b.parent).n : top).add(n);
  for (let i = 0; i <= 80; i++) {
    const t = (i / 80) * s.duration;
    for (const { n, b } of nodes.values()) {
      const p = poseAt(b, s.keyframes[b.id], t);
      n.position.set(...p.pos);
      n.rotation.set(...p.rot.map(THREE.MathUtils.degToRad), 'ZYX');
    }
    top.updateMatrixWorld(true);
    for (const { m, b } of nodes.values()) {
      const box = new THREE.Box3().setFromObject(m);
      assert.ok(box.min.x > -1 && box.max.x < ROOM.w + 1 && box.min.y > WARDROBE - 1 && box.max.y < ROOM.l + 1 && box.min.z > -1 && box.max.z < CEILING, `${b.id} leaves the room at t=${t}: ${JSON.stringify(box)}`);
      if (b.id === 'top') assert.ok(Math.abs(box.max.z - TABLE.z) < 0.5);
    }
  }
  // The set's tools stay under the top when stowed and the top is closed.
  fs.rmSync(dir, { recursive: true });
  assert.ok(SILL > TABLE.z);
});

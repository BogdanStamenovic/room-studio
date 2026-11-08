// Design B's numbers against the measured room and the pieces that stay, without a browser. Nothing here checks strength.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { poseAt, validateStudy } from '../web/geometry.mjs';
import { BASE, BED, CEILING, CHAIR, EAST, TABLE } from '../web/hifi/plan.mjs';
import { ARM, BEARER, BENCH, DECK, DOOR, DROP_X, FAN, GUARD, IMAGE, LADDER, LEDGER_N, PERSON, PIANO, POSTS, PROJECTOR, ROBOT, ROBOT_BOX, SOUTH_BEAM, STEEL, UPPER, WALL_TIES, loftClearances } from '../web/hifi/loft-plan.mjs';

const c = loftClearances();
const WARDROBE = 555;
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const footprint = (p) => ({ x0: p.x - STEEL.post / 2, x1: p.x + STEEL.post / 2, y0: p.y - STEEL.post / 2, y1: p.y + STEEL.post / 2 });
const lowBed = { x0: BED.x0, x1: BED.x1, y0: BED.y0, y1: BED.y1 };
const tableReach = { x0: TABLE.x0, x1: 995, y0: TABLE.yS - TABLE.travel, y1: BASE.yN }; // 995 is its stop button
const inDoorArc = (x, y) => y < DOOR.y1 && y > DOOR.y0 && Math.hypot(EAST - x, y - DOOR.y0) < DOOR.leaf;

test('six posts, and none of them stands in the low bed, on the table, or in the door', () => {
  assert.equal(POSTS.length, 6);
  for (const p of POSTS) {
    const f = footprint(p);
    assert.ok(!hit(f, lowBed), `${p.id} stands in the low bed`);
    assert.ok(!hit(f, tableReach), `${p.id} is in the table's path`);
    assert.ok(f.x1 <= EAST && f.y1 <= 5019);
    assert.ok(f.y0 >= DOOR.frameN, `${p.id} touches the door frame`);
    const [fx0, fx1, fy0, fy1] = p.foot;
    assert.ok(!hit({ x0: fx0, x1: fx1, y0: fy0, y1: fy1 }, lowBed), `${p.id}'s floor plate runs under the bed`);
    assert.ok(!hit({ x0: fx0, x1: fx1, y0: fy0, y1: fy1 }, tableReach), `${p.id}'s floor plate is in the table's path`);
    assert.ok(fx0 <= f.x0 && fx1 >= f.x1 && fy0 <= f.y0 && fy1 >= f.y1, `${p.id}'s plate does not surround the post`);
  }
});

test('the flap in the bed edge stays reachable: no post or box in front of it', () => {
  const flap = { x0: BED.flap.x0, x1: BED.flap.x1, y0: BED.y0 - 400, y1: BED.y0 };
  for (const p of POSTS) assert.ok(!hit(footprint(p), flap), `${p.id} stands before the flap`);
  assert.ok(!hit(ROBOT_BOX, flap));
  assert.ok(!hit({ x0: PIANO.x0, x1: PIANO.x1, y0: PIANO.y0, y1: PIANO.y1 }, flap));
});

test('184 cm with a 96 cm sitting height (estimate): head clearances', () => {
  assert.equal(PERSON.sitting, 960);
  assert.ok(c.lowBedUnderBeam > 0, 'sitting up mid-bed hits the beam');
  assert.ok(c.lowBedUnderBearer > 0);
  assert.equal(c.lowBedUnderBeam, 20);
  assert.equal(c.lowBedBetweenBeams, 82);
  assert.equal(c.upperBedHead, 80);
  assert.equal(c.loungeHead, 160);
  // The study's deck at 1250 on the same mattress is 30 into the head; kept here as the reason for the change.
  assert.equal(1250 - (BED.mattressTop + PERSON.sitting), -30);
});

test('upper bed is 120 x 200, off the ceiling drop, and stays in the room', () => {
  assert.equal(UPPER.x1 - UPPER.x0, 2000);
  assert.equal(UPPER.y1 - UPPER.y0, 1200);
  assert.equal(UPPER.x0, 667);
  assert.ok(SOUTH_BEAM.x0 > DROP_X);
  assert.ok(UPPER.x1 <= EAST && UPPER.y1 <= 5019);
  assert.ok(UPPER.top < CEILING);
});

test('sitting up at the low bed\'s pillow end, the deck is not over your head', () => {
  assert.ok(c.lowBedPillowHeadToDeck > 100);
});

test('every beam underside is level with the deck line, and the projector hangs below only the free part', () => {
  assert.equal(DECK.top - DECK.underside, STEEL.beamDepth);
  assert.ok(BEARER.z0 >= DECK.underside);
  assert.ok(PROJECTOR.x0 > SOUTH_BEAM.x0);
  assert.ok(PROJECTOR.z1 <= BEARER.z0);
});

test('the door: arm and ladder clear the frame and the arc, ladder is on the room side', () => {
  assert.ok(ARM.y0 > DOOR.frameN);
  assert.equal(c.armToDoorFrame, 20);
  assert.ok(c.ladderToDoorArc > 0);
  assert.ok(LADDER.y0 > DOOR.y1, 'stringers are north of where the door ever reaches');
  for (const [x, y] of [[LADDER.x1, LADDER.y0], [LADDER.x0, LADDER.y0]]) assert.ok(!inDoorArc(x, y));
  // Wall fixings stay north of the frame, where things may be mounted.
  for (const t of WALL_TIES) assert.ok(t.y > DOOR.frameN);
});

test('the table slides its full path past all of it', () => {
  assert.ok(c.tableToPost >= 20);
  assert.ok(ARM.x0 > TABLE.x1);
  assert.ok(!hit({ x0: ARM.x0, x1: ARM.x1, y0: ARM.y0, y1: ARM.y1 }, tableReach));
  assert.ok(SOUTH_BEAM.y0 > TABLE.yN - 20);
  // Where the south beam does cross above the table's end, it is far above anything on it.
  assert.ok(DECK.underside > TABLE.z + 400);
});

test('a walking band as wide as beside the folding seat', () => {
  assert.equal(c.walkingBandAtTable, 797);
  assert.equal(c.bandPastChair, 197);
  assert.ok(c.bandAtPiano >= 700);
  assert.ok(TABLE.x1 + CHAIR.reach <= PIANO.x0);
  assert.ok(PIANO.y1 <= CHAIR.y - 300, 'with someone at the desk, the piano must not pinch the way past');
});

test('piano stays clear of the frame, and the player\'s head is out in open air', () => {
  assert.equal(PIANO.w, 1350);
  assert.equal(PIANO.d, 305);
  assert.ok(PIANO.h < DECK.underside);
  assert.ok(c.pianoHeadToDeckEdge >= 150, `head to deck edge ${c.pianoHeadToDeckEdge}`);
  assert.equal(c.pianoIfAgainstWall, -110); // why it moved
  for (const p of POSTS) assert.ok(!hit(footprint(p), { x0: PIANO.x0, x1: PIANO.x1, y0: PIANO.y0, y1: PIANO.y1 }), `${p.id} stands in the piano`);
  assert.ok(BENCH.tuckX0 + BENCH.d <= PIANO.x1, 'the bench tucks between the cheeks');
  assert.ok(BENCH.w <= PIANO.w - 84);
  assert.ok(BENCH.h < 575, 'the bench goes under the key bed');
  assert.ok(BENCH.useX0 > TABLE.x1);
});

test('robot: a full 50 cm robot fits the box, the box clears the deck, and its way out is free', () => {
  assert.ok(c.robotBoxInside >= ROBOT.w + 20);
  assert.ok(ROBOT_BOX.door.w >= ROBOT.w + 10 && ROBOT_BOX.door.h >= ROBOT.h + 20);
  assert.ok(ROBOT_BOX.z1 < DECK.underside);
  assert.ok(ROBOT_BOX.x0 >= PIANO.x1 && ROBOT_BOX.x1 <= POSTS[2].x - STEEL.post / 2);
  // Its door faces north: from there the way west past the piano's north end is open.
  const way = { x0: ARM.x0, x1: ROBOT_BOX.x1, y0: Math.max(PIANO.y1, ROBOT_BOX.y1), y1: Math.max(PIANO.y1, ROBOT_BOX.y1) + ROBOT.w + 20 };
  for (const p of POSTS) assert.ok(!hit(footprint(p), way), `${p.id} blocks the robot`);
  assert.ok(way.y1 <= SOUTH_BEAM.y0 - 20);
  assert.ok(ROBOT.h < DECK.slatUnder);
});

test('projector picture on the bare east wall, clear of posts, deck and the duvet', () => {
  assert.ok(IMAGE.y0 >= POSTS[2].y + 30);
  assert.ok(IMAGE.y1 <= POSTS[3].y - 30);
  assert.ok(IMAGE.z1 < DECK.underside);
  for (const t of WALL_TIES) if (t.y + t.side * 102 < IMAGE.y1 && t.y > IMAGE.y0) assert.ok(t.z - 45 >= IMAGE.z1, 'a wall tie sits in the picture');
  assert.ok(IMAGE.z0 > BED.mattressTop + 100);
  assert.ok(c.throwRatio > 1.0 && c.throwRatio < 2.2, 'a common throw, ESTIMATE until his model is known');
  // Nothing of the frame between a head on the pillow and the picture.
  const eye = { x: BED.x0 + 280, z: BED.mattressTop + 240 };
  const atDeck = (z) => eye.z + ((z - eye.z) * (SOUTH_BEAM.x0 - eye.x)) / (EAST - eye.x);
  assert.ok(atDeck(IMAGE.z1) < DECK.underside);
});

test('the guard rail is above the mattress by at least the 160 quoted for bunk beds, and leaves the lounge side open', () => {
  assert.ok(c.guardAboveMattress >= 160);
  assert.ok(GUARD.mid > UPPER.top && GUARD.mid < GUARD.top);
  assert.equal(GUARD.xEnd, ARM.x0);
  assert.ok(GUARD.top < CEILING - PERSON.sitting + 200);
});

test('guard plates and joint plates do not sit on the same stretch of beam', () => {
  for (const x of GUARD.postsSouth) {
    for (const p of POSTS.slice(0, 3)) {
      assert.ok(x + 30 <= p.x - 190 || x - 30 >= p.x + 190, `guard post at ${x} meets ${p.id}'s plate`); // 190: a gusset's half-width with a knee
    }
    assert.ok(x + 30 <= ARM.x0, 'and none on the arm beam');
  }
});

test('the player\'s knee fits under the key bed', () => {
  const kneeTop = BENCH.h + 105 - 470 * Math.sin((6 * Math.PI) / 180) + 52; // ESTIMATE of a 184 cm thigh, as drawn in loft.mjs
  assert.ok(kneeTop < PIANO.h - 200, `knee top ${kneeTop}`);
});

test('the fan is outside the arm', () => {
  assert.ok(FAN.x1 < ARM.x0);
  assert.equal(c.fanToArmEdge, 169);
  // A standing person passes under it, and the deck is below it.
  assert.ok(FAN.bottom > PERSON.height + 400 && FAN.bottom > UPPER.top);
});

test('the north angle stays on the north wall, and the frame reaches no wall it should not', () => {
  assert.equal(LEDGER_N.y, 5019);
  assert.ok(LEDGER_N.x0 >= BED.x0);
  assert.ok(ARM.x1 === EAST);
});

test('the study is valid and stays in the room at every moment, starting at the first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-loft-'));
  const file = path.join(dir, 's.json');
  execFileSync('node', ['scripts/loft-study.mjs', file]);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.rmSync(dir, { recursive: true });
  assert.deepEqual(validateStudy(s), []);
  assert.equal(s.id, 'steel-loft');
  assert.deepEqual(s.place, { x: 0, y: 0 });
  const nodes = new Map();
  for (const b of s.blocks) {
    const n = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size));
    if (b.pivot) m.position.set(-b.pivot[0], -b.pivot[1], -b.pivot[2]);
    n.add(m); nodes.set(b.id, { n, b, m });
  }
  const top = new THREE.Group();
  for (const { n } of nodes.values()) top.add(n);
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * s.duration;
    for (const { n, b } of nodes.values()) {
      const p = poseAt(b, s.keyframes[b.id], t);
      n.position.set(...p.pos);
      n.rotation.set(...p.rot.map(THREE.MathUtils.degToRad), 'ZYX');
    }
    top.updateMatrixWorld(true);
    for (const { m, b } of nodes.values()) {
      const box = new THREE.Box3().setFromObject(m);
      assert.ok(box.min.x > -1 && box.max.x < EAST + 1 && box.min.y > WARDROBE - 1 && box.max.y < 5019 + 1 && box.min.z > -1 && box.max.z < CEILING + 1, `${b.id} leaves the room at t=${t}: ${JSON.stringify(box)}`);
    }
  }
});

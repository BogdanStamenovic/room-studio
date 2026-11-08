// The design's numbers against the measured room, without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BED, CEILING, CUSHION, DECK_THICK, EAST, HINGE, LEDGER, PULLEY_X, SEAT_TOP, VARIANTS, cablePoints, deckOutline, fittingAt, foldedTop, pianoPlace } from '../web/hifi/plan.mjs';

// Measured values from room.json and items.json on 2026-11-08, copied here because the data is private.
const DOOR_FRAME_NORTH = 1570; // east wall, door trim's north edge
const PIANO = { w: 1350, d: 305, h: 775 };
const ROBOT_CLEAR = 600; // my estimate of the robot's clear path, from its item

test('seat height and headroom match the study', () => {
  assert.equal(SEAT_TOP, 1500);
  assert.equal(CEILING - SEAT_TOP, 1080);
});

test('the folded seat fits under the ceiling and between hinge and wall', () => {
  assert.ok(foldedTop() < CEILING);
  assert.equal(foldedTop(), 2337);
  // Folded, deck is on the room side of the hinge line and the cushion on the wall side.
  assert.ok(HINGE.x + CUSHION <= EAST, 'cushion would hit the wall');
  assert.equal(DECK_THICK, 60);
  assert.equal(LEDGER.depth, 63);
});

test('the cables can actually pull the seat to vertical', () => {
  // A pulley further into the room than the hinge pulls the edge away from the wall near the top.
  assert.ok(PULLEY_X >= HINGE.x);
  const open = fittingAt(0); const shut = fittingAt(90);
  assert.ok(open.x < HINGE.x - 700);
  assert.ok(Math.abs(shut.x - HINGE.x) < 1);
  assert.ok(shut.z > SEAT_TOP + 700 && shut.z < CEILING);
});

for (const [id, v] of Object.entries(VARIANTS)) {
  test(`${id}: box and seat stay in the room and clear of the door`, () => {
    assert.ok(v.box.y0 >= DOOR_FRAME_NORTH + 150);
    assert.equal(v.box.x1, EAST);
    assert.equal(v.box.x1 - v.box.x0, 525);
    assert.ok(v.deck.y0 >= DOOR_FRAME_NORTH + 150);
    assert.equal(v.deck.y1 - v.deck.y0, 1350);
    const xs = deckOutline(id).map((p) => p[0]);
    assert.equal(Math.min(...xs), EAST - 900);
  });

  test(`${id}: the piano leaves the robot door free`, () => {
    const { y0, y1 } = v.piano;
    assert.equal(y1 - y0, PIANO.w);
    assert.ok(y0 >= DOOR_FRAME_NORTH);
    // The door is on the box's south face; nothing may stand in front of it.
    const doorY = v.box.y0;
    assert.ok(y1 <= doorY - ROBOT_CLEAR || y0 >= v.box.y1, 'piano blocks the robot door');
    const p = pianoPlace(id);
    assert.equal(p.x + PIANO.d / 2, EAST);
  });

  test(`${id}: holds sit above the robot door`, () => {
    for (const [x, z] of v.holds) {
      assert.ok(z > v.door.z0 + v.door.h);
      assert.ok(x > v.box.x0 && x < v.box.x1);
    }
  });

  test(`${id}: two cables inside the seat`, () => {
    const [a, b] = cablePoints(id);
    assert.ok(a > v.deck.y0 && b < v.deck.y1);
  });
}

test('corner box stands against the foot of the bed; south variant frees that wall', () => {
  assert.equal(VARIANTS.corner.box.x0, BED.x1);
  assert.equal(VARIANTS.corner.box.y1, BED.y1);
  const s = VARIANTS.south;
  assert.ok(s.box.y1 <= BED.y0 && s.deck.y1 <= BED.y0 && s.piano.y1 <= BED.y0);
  assert.ok(s.image.y0 >= BED.y0 && s.image.y1 <= BED.y1);
});

test('the corner seat leaves a slot in front of the holds', () => {
  const c = VARIANTS.corner;
  assert.ok(c.box.y0 - c.deck.y1 >= 450);
});

test('bed: 120 x 200 mattress, about 10 cm channel, flap inside the rail', () => {
  assert.equal(BED.x1 - BED.x0, 2000);
  assert.equal(BED.y1 - BED.y0, 1200);
  assert.equal(BED.channel.z1 - BED.channel.z0, 100);
  assert.ok(BED.flap.z1 <= BED.frameTop);
  assert.equal(BED.flap.x1 - BED.flap.x0, 220);
  assert.equal(BED.flap.z1 - BED.flap.z0, 50);
});

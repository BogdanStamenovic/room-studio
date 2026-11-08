// Design B in plan, as plain numbers (mm; +y north, z up; x=0 west wall, x=2667 east wall).
// No three.js here, so a test can check it against the measured room and the other pieces without a browser.
//
// Starting point: studies/steel-loft.json revision 2. CHANGE marks a departure from that study, with the reason.
// ESTIMATE marks anything not measured. Nothing here is a structural check: every section size is a proposal that
// the worst-case simulation (his rule: estimate forces high) has yet to confirm or replace.
import { BED, CEILING, CHAIR, EAST, TABLE } from './plan.mjs';

// Facts from room.json, copied here because the data is private.
export const DOOR = { y0: 675, y1: 1515, frameN: 1570, height: 2020, hinge: { x: EAST, y: 675 }, leaf: 840 }; // hinge on the south side, swings south into the room
export const FAN = { x0: 1068, x1: 1598, y0: 2245, y1: 2775, bottom: 2365 }; // ESTIMATE from a photo (room.mjs); 215 down from the ceiling
export const DROP_X = 457; // ceiling drop's room-side edge

// ESTIMATE from standard proportions: seated height 96 cm at 184 cm tall. He has not measured it.
export const PERSON = { height: 1840, sitting: 960, benchSeat: 450, headFromKeys: 420, headR: 100 };

// Joined by bolts because he may not weld. Welded instead: the plates, knees and most bolt heads go, the joints get
// cleaner and stiffer, and sway ties may matter less. But the frame must still come through an 840 door, so it needs
// site welds over parquet or bolted splices anyway, and the black finish has to go on after welding. Heights do not change.
export const STEEL = {
  post: 60, // 60 x 60 x 3 square tube, ESTIMATE
  beamDepth: 80, // 80 x 40 x 3 rectangular tube, strong axis up, ESTIMATE
  beamWidth: 40,
  mainWidth: 60, // 80 x 60 x 4 for the beams on posts: the bed's and the arm's load lands there, and plates sit flat on post and beam, ESTIMATE
  plate: 8, // bolted flitch plates, ESTIMATE
  bolt: 12, // M12 through-bolts with crush sleeves in the tube, ESTIMATE
};

// CHANGE: the study's 1250 underside puts a 96 cm sitter's head 30 mm INTO the deck when sitting up anywhere but the
// pillow end. 1300 leaves 20 under a beam and 82 between beams, and the upper bed keeps more than the study's sum.
export const DECK = { underside: 1300, top: 1380, slat: 18, slatPitch: 120, slatWidth: 90 };
DECK.slatUnder = DECK.top - DECK.slat;

// CHANGE: 160 mattress instead of the study's 180, because 100 mm is all there is to share between two heads.
export const UPPER = { x0: 667, x1: EAST, y0: 3815, y1: 5015, mattress: 160 }; // 120 x 200, 67 off the west wall per study
UPPER.top = DECK.top + UPPER.mattress;

// Beam centre lines. The south beam is one straight line along the low bed's south edge.
export const SOUTH_BEAM = { x0: UPPER.x0 - STEEL.beamWidth, x1: EAST, y0: 3755, y1: 3815 };
export const WEST_BEAM = { x0: UPPER.x0 - STEEL.beamWidth, x1: UPPER.x0, y0: SOUTH_BEAM.y1, y1: 5011 };

// CHANGE: 900 wide, not 1000. The same reach as the folding seat, which gives the same 797 walking band beside the
// table, and 169 instead of 69 in plan between the arm's edge and the fan (the fan is an estimate).
export const ARM = { x0: EAST - 900, x1: EAST, y0: 1590, y1: SOUTH_BEAM.y0, cushion: 80 };

// CHANGE, all but one: the study's posts at (697, 3849), (697, 4989) and (1697, 3819) stand inside the low bed, whose
// mattress fills the wall-to-table gap exactly, and the first blocks the conveyor channel. A post beside the table
// must clear the table's stop button (x 995), and the one at 1725 stops short of the bed's flap (x 1790).
export const POSTS = [
  // foot: the floor plate, cut off where the bed, the piano or the door frame would meet it.
  { id: 'pTable', x: 1045, y: 3785, foot: [1000, 1115, 3665, 3815] }, // between the table's corner and the bed
  { id: 'pFlap', x: 1725, y: 3785, foot: [1645, 1785, 3665, 3815] }, // just west of the flap, so the flap stays reachable
  { id: 'pEast', x: 2637, y: 3785, foot: [2527, 2667, 3665, 3815] }, // CHANGE: splits the study's 3340 mm east wall span into 2165 and 1204
  { id: 'pCorner', x: 2637, y: 4989, foot: [2527, 2667, 4869, 5019] },
  { id: 'pLadder', x: 1797, y: 1620, foot: [1727, 1867, 1590, 1670] },
  { id: 'pDoor', x: 2637, y: 1620, foot: [2527, 2667, 1590, 1740] }, // 20 clear of the door frame, which takes no fixings
];

// CHANGE: the deck's north edge rests on a steel angle bolted to the north wall, because no post can stand there: the
// low bed reaches the wall, and the mattress cannot be notched. So this is not fully freestanding. Brick wall per his
// description; anchor type and pull-out are unverified.
export const LEDGER_N = { x0: WEST_BEAM.x0, x1: 2607, y: 5019, leg: 68, thick: 8, z0: DECK.underside, z1: DECK.slatUnder, anchors: 5 };

// CHANGE: small angles tie the three east posts back to the wall. They carry no weight, only stop sway: six bolted
// posts with no diagonals would rack, and diagonals would cross the low bed or the walking band. ESTIMATE.
export const WALL_TIES = [{ y: 3785, side: -1, z: 1180 }, { y: 4989, side: -1, z: 1180 }, { y: 1620, side: 1, z: 1180 }];

// PROPOSED, for someone asleep; he said he does not worry about falling from a seat, but sleeping is different.
// Top 200 above the mattress. Secondary sources give EN 747, a bunk-bed standard written for children, as at least 160;
// the standard itself was not read. The two gaps are wider than its 75, so this stops an adult rolling, not a child.
// West end and the open south side, running on past its last post to the arm. Posts keep off the joints' plates. Lounge side stays open: rolling that way lands on the lounge.
export const GUARD = { top: UPPER.top + 200, mid: UPPER.top + 90, section: 30, xEnd: ARM.x0, postsSouth: [SOUTH_BEAM.x0 + 15, 1290, 1505], postsWest: [3785, 4400, 4990] };

// Ladder on the arm's south face, using the door-end post as one stringer, so it stands as far from the door as it can.
// The rungs and the second stringer stand north of the door's reach everywhere. Stringers run on above the deck as handles.
export const LADDER = { x0: 1767, x1: 2187, y0: 1550, y1: 1590, rungs: [260, 520, 780, 1040, 1300], rungDia: 30, stringer: 40, handleTop: 1930 };

// CHANGE: the piano stands back to the east, keys west, at the arm's edge rather than against the wall. Against the
// wall the player's head is 305 + 420 in, under a 1300 deck: 110 mm of skull into steel. Here the head is in open air.
export const PIANO = { w: 1350, d: 305, h: 775, x0: 1725, y0: 1675 };
PIANO.x1 = PIANO.x0 + PIANO.d; PIANO.y1 = PIANO.y0 + PIANO.w;
export const BENCH = { w: 600, d: 300, h: PERSON.benchSeat, tuckX0: 1705, useX0: PIANO.x0 - PERSON.headFromKeys - 175, y: (PIANO.y0 + PIANO.y1) / 2 };

// The robot's home, which the corner box used to be: behind the piano, under the arm. Wider than the corner box's 48 cm
// inside, so the full 50 cm robot fits. Door on the north face, way out past the piano's north end.
export const ROBOT_BOX = { x0: PIANO.x1 + 10, x1: PIANO.x1 + 570, y0: 2440, y1: PIANO.y1 - 25, z1: 640, wall: 15, door: { w: 520, h: 540 } };
export const ROBOT = { w: 500, d: 500, h: 500 };

// Projector: now on the east wall at the foot of the low bed, under the deck, from the bare wall the box used to cover.
// ESTIMATE: his model and its throw are unknown. The projector hangs from the deck's middle bearer.
export const IMAGE = { y0: 3860, y1: 4940, z0: 620 };
IMAGE.z1 = IMAGE.z0 + ((IMAGE.y1 - IMAGE.y0) * 9) / 16;
export const PROJECTOR = { x0: 880, x1: 1180, y: 4417, w: 250, z0: 1225, z1: 1320 };

export const BEARER = { y: 4417, w: 40, z0: 1320, z1: DECK.slatUnder };

const distToHinge = (x, y) => Math.hypot(DOOR.hinge.x - x, DOOR.hinge.y - y);

/** Plain-number clearances, stated in the report and asserted in the test. */
export function loftClearances() {
  const P = PERSON;
  return {
    lowBedUnderBeam: DECK.underside - (BED.mattressTop + P.sitting),
    lowBedBetweenBeams: DECK.slatUnder - (BED.mattressTop + P.sitting),
    lowBedUnderBearer: BEARER.z0 - (BED.mattressTop + P.sitting),
    lowBedPillowHeadToDeck: SOUTH_BEAM.x0 - (BED.x0 + 280), // head when sitting back against the wall block, ESTIMATE 280
    upperBedHead: CEILING - (UPPER.top + P.sitting),
    loungeHead: CEILING - (DECK.top + ARM.cushion + P.sitting),
    deckToCeiling: CEILING - DECK.top,
    walkingBandAtTable: ARM.x0 - TABLE.x1,
    bandAtPiano: PIANO.x0 - TABLE.x1,
    bandPastChair: ARM.x0 - (TABLE.x1 + CHAIR.reach), // chair and sitter reach x 1570, same figure the table's plan uses
    tableToPost: POSTS[0].x - STEEL.post / 2 - 995, // the table's stop button is its easternmost part
    pianoHeadToDeckEdge: ARM.x0 - (PIANO.x0 - P.headFromKeys) - P.headR,
    pianoIfAgainstWall: DECK.underside - (P.benchSeat + P.sitting),
    pastBenchInUse: BENCH.useX0 - TABLE.x1,
    fanToArmEdge: ARM.x0 - FAN.x1,
    robotBoxInside: ROBOT_BOX.x1 - ROBOT_BOX.x0 - 2 * ROBOT_BOX.wall,
    armToDoorFrame: ARM.y0 - DOOR.frameN,
    ladderToDoorArc: Math.min(distToHinge(LADDER.x1, LADDER.y0), distToHinge(LADDER.x0, LADDER.y0)) - DOOR.leaf,
    pillarToFlap: 1790 - (POSTS[1].x + STEEL.post / 2),
    postToBedEdge: BED.y0 - SOUTH_BEAM.y1,
    guardAboveMattress: GUARD.top - UPPER.top,
    imageWidth: IMAGE.y1 - IMAGE.y0,
    imageHeight: IMAGE.z1 - IMAGE.z0,
    throwRatio: (EAST - PROJECTOR.x0) / (IMAGE.y1 - IMAGE.y0),
  };
}

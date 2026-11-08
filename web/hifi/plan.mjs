// The design in plan, as plain numbers (mm; +y north, z up; x=0 west wall, x=2667 east wall).
// No three.js here, so a test can check it against the measured room without a browser.
//
// Numbers come from studies/living-tower.json revision 5 and studies/bed-storage.json revision 2.
// CHANGE marks a departure from the study, with the reason. ESTIMATE marks anything not measured.

export const EAST = 2667;
export const CEILING = 2580;
export const SEAT_TOP = 1500; // study: 1.50 m, leaving 1.08 m to the ceiling
export const DECK_THICK = 60; // study, at the hinge
export const DECK_EDGE = 34; // ESTIMATE, CHANGE: free edge tapers, so it reads as a wing and not a plank
export const CUSHION = 60; // study
export const OPEN_REACH = 900; // study: opens to 90 cm from the wall
export const FREE_EDGE_X = EAST - OPEN_REACH;
export const CABLE_DIAMETER = 12; // study; no load calculation behind it

// CHANGE: the study's ledger is at z 1280..1400 and hinges at the wall. A seat folding cushion-side to
// the wall needs 120 mm of depth for deck plus cushion, and the ledger is 60 deep. Hinging on the top
// edge of the ledger's room-side face puts deck and cushion just inside 123 mm, so the ledger stays
// 63 deep and moves up 100 mm to carry it. A lip under the deck takes the load when open. ESTIMATE.
export const LEDGER = { depth: 63, z0: 1380, z1: 1500, lip: 44, lipZ0: 1416, lipZ1: 1466 };
export const HINGE = { x: EAST - LEDGER.depth, z: SEAT_TOP };

// Revision 6: load cables hang straight down from the ceiling, directly above the seat's outer edge, so the
// space above the seat stays clear. They only hold it open. A vertical cable goes slack as the seat rises, so
// it cannot fold the seat: folded, the cables are reeled up to the ceiling, and a separate slim line from high
// on the wall lifts it, hauled by hand (see HAND_FOLD; motorising stays possible later). That line would cross
// the seat if it stayed attached while open, so it hooks on only to fold. What is drawn is likely place and rough size. ESTIMATE.
export const LIFT_LINE = { x: EAST - 24, z: 2510, diameter: 4 };
export const REEL = { dia: 74, height: 46 };

export const BED = {
  x0: 142, x1: 2142, y0: 3819, y1: 5019, // study: 2000 x 1200 centred on 1142, 4419
  frameTop: 120, // study
  mattressTop: 320, // study: 200 mm mattress on the 120 mm frame
  channel: { z0: 14, z1: 114, y1: 3990 }, // about 10 cm per brief; 14 and 3990 are ESTIMATE
  flap: { x0: 1790, x1: 2010, z0: 70, z1: 120, pivotZ: 114 }, // study: 220 x 50 at x 1900; set just under the frame top
};

const BOX_DOOR = { w: 450, h: 500, z0: 10 }; // study
// Holds on the south face above the door: the first four are the study's, the rest ESTIMATE.
const HOLDS_SOUTH = [[2250, 650], [2520, 880], [2280, 1100], [2500, 1320], [2400, 760], [2610, 1040], [2195, 880], [2400, 1190], [2205, 1340], [2620, 1400]];

export const VARIANTS = {
  corner: {
    id: 'corner',
    title: 'Box in the north-east corner',
    box: { x0: 2142, x1: EAST, y0: 3819, y1: 5019 }, // study
    // CHANGE: the study runs the seat from y 2469 right up to the box, directly over the south face.
    // Open, that roofs the holds and the climber meets the underside. It also leaves the piano no way to
    // sit under the seat without blocking the robot's door. So the seat stops 450 short of the box: a
    // slot to climb in, with one long step across at the top. ESTIMATE.
    deck: { y0: 2019, y1: 3369 },
    // Under the seat as asked, but its north end stops 600 clear of the robot's door (ESTIMATE, from
    // the 60 cm clear path noted on the robot item), so 150 of it shows past the seat's south end.
    piano: { y0: 1869, y1: 3219 },
    door: BOX_DOOR,
    holds: HOLDS_SOUTH,
    image: null,
  },
  south: {
    id: 'south',
    title: 'Box south, wall at the foot of the bed free',
    // ESTIMATE, all of it; he described this one only as "for example". The box starts 150 north of the
    // door frame, the rule the old tower had. CHANGE: 720 long, not 1200, because that is what lets a
    // 1350 seat and the 1350 piano both fit between it and the bed's south edge. A 500 deep robot still fits.
    box: { x0: 2142, x1: EAST, y0: 1720, y1: 2440 },
    deck: { y0: 2440, y1: 3790 },
    piano: { y0: 2440, y1: 3790 },
    door: BOX_DOOR,
    holds: HOLDS_SOUTH,
    // ESTIMATE: 16:9 filling the 1200 mm of wall with a small margin. Projector model and throw unknown.
    image: { y0: 3840, y1: 5000, z0: 660, z1: 1312 },
  },
};

export const BOX_TOP = SEAT_TOP; // study revision 5: the box is 1500 tall

/** Seat outline in plan, CCW [x, y, fillet radius]. CHANGE: gently bowed free edge and soft corners, not a rectangle. */
export function deckOutline(variant) {
  const { y0, y1 } = VARIANTS[variant].deck;
  const mid = (y0 + y1) / 2;
  const endX = FREE_EDGE_X + 42; // ESTIMATE
  // All four corners stay above the belly's 230 inset, or the offset rings cross and the underside tears.
  return [[HINGE.x, y0, 245], [HINGE.x, y1, 245], [endX, y1, 275], [FREE_EDGE_X, mid, 5000], [endX, y0, 275]];
}

// CHANGE: the study puts the cables 19 and 11 mm from the seat's ends (y 3800 and 2480). The rounded corners
// pull the edge away there, so they land where the corner meets the straight run instead, 275 from each end.
const CABLE_FROM_END = 275;
const EDGE_AT_CABLE = FREE_EDGE_X + 42 - (42 * CABLE_FROM_END) / 675;
export const CABLE_INSET = 32; // ESTIMATE: fitting back from the free edge
export const CUSHION_EDGE_INSET = 72; // CHANGE: pad stops short of the fittings, so no cable touches it (study 30)
export const CABLE_X = EDGE_AT_CABLE + CABLE_INSET;

export function cablePoints(variant) {
  const { y0, y1 } = VARIANTS[variant].deck;
  return [y0 + CABLE_FROM_END, y1 - CABLE_FROM_END];
}

/** Where the cable fitting is at a given fold angle (0 open, 90 degrees folded), x and z only. */
export function fittingAt(angleDeg) {
  const s = HINGE.x - CABLE_X;
  const a = (angleDeg * Math.PI) / 180;
  return { x: HINGE.x - s * Math.cos(a), z: HINGE.z + s * Math.sin(a) };
}

/** The lift line's hook on the free edge, at mid length. */
export function liftEyeAt(variant, angleDeg) {
  const s = HINGE.x - (FREE_EDGE_X + 26);
  const a = (angleDeg * Math.PI) / 180;
  const { y0, y1 } = VARIANTS[variant].deck;
  return { x: HINGE.x - s * Math.cos(a), y: (y0 + y1) / 2, z: HINGE.z + s * Math.sin(a) };
}

export function foldedTop() {
  return HINGE.z + (HINGE.x - FREE_EDGE_X);
}

export function pianoPlace(variant) {
  const { y0, y1 } = VARIANTS[variant].piano;
  return { x: EAST - 305 / 2, y: (y0 + y1) / 2, rot: -90 };
}

// --- The expanding table. Every number below is a proposal, not his measurement. ---
// Facts it answers to, from room.json: lower wall block ends at y 3779, wardrobe front at y 555, windows at
// y 2379..3289 and 3314..4224 with the sill at 1030. Radiator numbers are ESTIMATE from a photo (room.mjs).
// His height is 184 cm. ESTIMATE from standard body proportions: seated with a 470 seat, knee top about 590,
// thigh top about 640, elbow about 740, eye about 1310.
export const TABLE = {
  x0: 170, x1: 970, // 800 deep. The 170 at the wall is the radiator's chimney, so the top never roofs it.
  yN: 3769, // 10 south of the block's face, 50 south of the bed
  len: 1400, travel: 1400, // length doubles. 1400 is what parks the moved top just south of window 2's 2379.
  z: 760, thick: 30, apron: 40, // 760 not 740: 184 cm needs thigh room under the front beam, see BASE
  moveMmPerS: 50, // ESTIMATE: 28 s end to end, slow enough to stop by letting go
};
TABLE.yS = TABLE.yN - TABLE.len;
TABLE.apronZ = TABLE.z - TABLE.thick - TABLE.apron;

// Fixed under-frame. Front beam is steel, 70 x 30: the 650 clearance under it is what 184 cm's thighs get.
export const BASE = {
  yS: 2425, yN: 3780, // posts 60 long at each end; the south 56 past the top's end leaves room for the folded leg
  front: { x0: 860, x1: 930, z0: 650, z1: 680 },
  rear: { x0: 175, x1: 205, z0: 640, z1: 680 },
  track: { x0: 930, x1: 965, y0: 2375, y1: 3795, z0: 668, z1: 680 },
  shield: { x0: 168, x1: 174, z0: 100, z1: 640 }, // white aluminium sheet between radiator and everything else
};

// Wall rail: a 20 mm profile rail on stand-offs, above the radiator (ESTIMATE top 700), with the belt on it.
export const RAIL = { x0: 30, x1: 50, z0: 712, z1: 732, y0: 985, y1: 3775, trucks: [60, 1000] }; // trucks from the top's north end

// Duct south of the radiator only: over the radiator the rail stays bare so the heat can rise past it.
export const DUCT = { x1: 118, y0: 985, y1: 2420, z0: 734, z1: 840, chainFixedY: 1700, chainMovingY: 2400, chainR: 30 };

// One leg, front south corner, swings in the x-z plane. Stored flat under the top's south end.
export const LEG = { pivot: { x: 905, y: 2410, z: 672 }, length: 632, wheelR: 40, brace: { at: 200, z: 688, x0: 337, x1: 605 } };
LEG.brace.length = Math.hypot(LEG.pivot.x - LEG.brace.x1, LEG.pivot.z - LEG.brace.at - LEG.brace.z);

// Set: fixed rear tray with the tools, and a leaf that stands up as a modesty panel when stowed and folds
// out flat when raised. Without the fold there is no knee room when the table is closed: a 700 deep tray
// under the top leaves 184 cm's thighs nowhere to go.
export const SET = {
  x0: 210, hinge: 545, leaf: 350, thick: 25, y0: 2495, y1: 3705,
  zUp: TABLE.z, // flush with the top once raised
  toolMax: 230, // tallest thing on the rear tray when stowed
};
SET.x1 = SET.hinge + SET.leaf;
SET.zDown = BASE.front.z1 - SET.leaf; // leaf stands to just under the beam's level, clear of the top's cross apron
SET.stroke = SET.zUp - SET.zDown;
export const LIFT = { columns: [2900, 3500], carriage: 190, x: 224 };
export const CHAIR = { x: 1330, y: 3325, seat: 470, reach: 600 }; // ESTIMATE: a chair and someone in it take 600 from the table's edge

// ESTIMATE: lying on its side. His tower's real size is unknown, so measure it before cutting anything.
export const SERVER = { x0: 250, x1: 700, y0: 2495, y1: 2945, z0: 40, z1: 250 };
export const MONITOR = { y: CHAIR.y, width: 620, x: 430, z0: 870, z1: 1240 };

const smooth = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

/**
 * The machine's order of motion. t is the single slider, 0 closed to 1 fully open. Phases never overlap: that
 * is what the interlocks enforce on the real thing, and a test checks it here.
 */
export function tableState(t) {
  const leg = smooth(0, 0.16, t); // down and latched first; the latch is what frees the bolt holding the top
  const slide = smooth(0.19, 0.62, t);
  const lift = smooth(0.66, 1, t); // only with the top all the way off
  const leaf = smooth(0.8, 0.98, t); // folds out once high enough to swing clear of the server and the floor
  return { leg, slide, lift, leaf, travel: slide * TABLE.travel, setZ: SET.zDown + lift * SET.stroke };
}

/** Where the chain's loop sits for a given position of the moving bracket: it travels at half speed. */
export function chainLoopY(movingY) {
  return (DUCT.chainFixedY + movingY) / 2 + TABLE.travel / 4;
}

/** Plain-number clearances, stated in the report and asserted in the test. */
export function tableClearances(variant, room = { wardrobeFront: 555, bedSouth: BED.y0, doorArcX: EAST - 840 }) {
  const v = VARIANTS[variant];
  const front = TABLE.x1;
  const pianoFront = EAST - 305;
  return {
    closedLength: TABLE.len,
    openLength: TABLE.len + TABLE.travel,
    toWardrobeOpen: TABLE.yS - TABLE.travel - room.wardrobeFront,
    toWardrobeClosed: TABLE.yS - room.wardrobeFront,
    toBed: room.bedSouth - TABLE.yN,
    toPianoFront: pianoFront - front,
    pianoBenchLeft: pianoFront - 600 - front,
    pastChairToBench: pianoFront - 600 - front - CHAIR.reach,
    pastChairToPianoFront: pianoFront - front - CHAIR.reach,
    toBox: v.box.x0 - front,
    toSeatEdge: FREE_EDGE_X - front, // full-height walking band: the seat's underside is at 1440
    toDoorArc: room.doorArcX - front,
    kneeDepth: front - (SET.hinge + SET.thick),
    thighClearance: BASE.front.z0,
    gapSetToTop: SET.y0 - (TABLE.yS - 0),
  };
}

// Hand fold, his decision: the line runs from the eye on the seat's free edge, up to a block high on the wall,
// along under the ceiling to a second block past the seat's south end, and down to a small self-braking hand
// winch he can reach from the floor. ESTIMATE, all of it; a 2:1 purchase may be needed once the seat's mass is known.
export const HAND_FOLD = { runZ: 2470, past: 120, winchZ: 1560 };

export function handWinchAt(variant) {
  const { y0 } = VARIANTS[variant].deck;
  return { y: y0 - HAND_FOLD.past, z: HAND_FOLD.winchZ };
}

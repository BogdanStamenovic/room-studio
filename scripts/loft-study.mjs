// Writes Design B's block study from the same numbers as the render, so they cannot drift apart.
// Run: node scripts/loft-study.mjs OUT.json, then room-studio study put OUT.json
import fs from 'node:fs';
import { ARM, BEARER, BENCH, DECK, GUARD, IMAGE, LADDER, LEDGER_N, PERSON, PIANO, POSTS, PROJECTOR, ROBOT_BOX, SOUTH_BEAM, STEEL, UPPER, WEST_BEAM, loftClearances } from '../web/hifi/loft-plan.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ size: [x1 - x0, y1 - y0, z1 - z0], pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const STEELC = '#1c2925'; const OAK = '#c99a5b'; const SOFT = '#a8452f'; const WHITE = '#f3f2ec'; const WHO = '#8fb4c9';
const U = DECK.underside; const T = DECK.top;
const c = loftClearances();

const blocks = [
  ...POSTS.map((p, i) => ({ id: `post${i + 1}`, ...(i === 0 ? { label: 'Šest čeličnih stubova, ni jedan u donjem krevetu' } : {}), ...box(p.x - 30, p.x + 30, p.y - 30, p.y + 30, 0, U), color: STEELC })),
  { id: 'beamS', label: 'Glavna greda duž južne ivice kreveta', ...box(SOUTH_BEAM.x0, SOUTH_BEAM.x1, SOUTH_BEAM.y0, SOUTH_BEAM.y1, U, T), color: STEELC },
  { id: 'beamW', ...box(WEST_BEAM.x0, WEST_BEAM.x1, WEST_BEAM.y0, WEST_BEAM.y1, U, T), color: STEELC },
  { id: 'beamBedE', ...box(ARM.x1 - STEEL.mainWidth, ARM.x1, SOUTH_BEAM.y1, POSTS[3].y - 30, U, T), color: STEELC },
  { id: 'ledger', label: 'Ugaonik na severnom zidu nosi severnu ivicu', ...box(LEDGER_N.x0, LEDGER_N.x1, LEDGER_N.y - LEDGER_N.leg, LEDGER_N.y, U, DECK.slatUnder), color: STEELC },
  { id: 'bearer', ...box(WEST_BEAM.x1, ARM.x1 - STEEL.mainWidth, BEARER.y - BEARER.w / 2, BEARER.y + BEARER.w / 2, BEARER.z0, BEARER.z1), color: STEELC },
  { id: 'armW', ...box(ARM.x0, ARM.x0 + STEEL.mainWidth, ARM.y0, ARM.y1, U, T), color: STEELC },
  { id: 'armE', ...box(ARM.x1 - STEEL.mainWidth, ARM.x1, ARM.y0, ARM.y1, U, T), color: STEELC },
  { id: 'armS', ...box(ARM.x0, ARM.x1, ARM.y0, ARM.y0 + STEEL.beamWidth, U, T), color: STEELC },
  { id: 'slats', label: 'Letvice ispod gornjeg dušeka', ...box(WEST_BEAM.x1, ARM.x1 - STEEL.mainWidth, SOUTH_BEAM.y1, LEDGER_N.y - LEDGER_N.thick, DECK.slatUnder, T), color: OAK },
  { id: 'boards', label: 'Hrastove daske, krak do vrata', ...box(ARM.x0 + STEEL.mainWidth, ARM.x1 - STEEL.mainWidth, ARM.y0 + STEEL.beamWidth, ARM.y1, DECK.slatUnder, T), color: OAK },
  { id: 'mattress', label: 'Gornji dušek 120 x 200 x 16', ...box(UPPER.x0, UPPER.x1, UPPER.y0, UPPER.y1, T, UPPER.top), color: '#b8cdd8' },
  { id: 'cushion', label: 'Jastuci za sedenje', ...box(ARM.x0 + 14, ARM.x1 - 12, ARM.y0 + 50, ARM.y1 - 10, T, T + ARM.cushion), color: SOFT },
  { id: 'guardS', label: 'Ogradica za spavanje, predlog', ...box(GUARD.postsSouth[0] - 15, GUARD.xEnd + 15, SOUTH_BEAM.y0, SOUTH_BEAM.y0 + 30, T, GUARD.top), color: STEELC },
  { id: 'guardW', ...box(WEST_BEAM.x0, WEST_BEAM.x0 + 30, SOUTH_BEAM.y0, GUARD.postsWest[2] + 15, T, GUARD.top), color: STEELC },
  { id: 'ladderL', label: 'Merdevine, van putanje vrata', ...box(LADDER.x0, LADDER.x0 + LADDER.stringer, LADDER.y0, LADDER.y1, 0, LADDER.handleTop), color: STEELC },
  { id: 'ladderR', ...box(LADDER.x1 - LADDER.stringer, LADDER.x1, LADDER.y0, LADDER.y1, 0, LADDER.handleTop), color: STEELC },
  ...LADDER.rungs.map((z, i) => ({ id: `rung${i + 1}`, ...box(LADDER.x0 + LADDER.stringer, LADDER.x1 - LADDER.stringer, LADDER.y0 + 5, LADDER.y1 - 5, z - 15, z + 15), color: '#a8adb2' })),
  { id: 'piano', label: 'Klavir na ivici kraka, dirke ka zapadu: glava ostaje van palube', ...box(PIANO.x0, PIANO.x1, PIANO.y0, PIANO.y1, 0, PIANO.h), color: WHITE },
  { id: 'bench', label: 'Klupa, ugurana pod dirke', ...box(BENCH.tuckX0, BENCH.tuckX0 + BENCH.d, BENCH.y - BENCH.w / 2, BENCH.y + BENCH.w / 2, 0, BENCH.h), color: OAK },
  { id: 'robotBox', label: 'Kućica za robota iza klavira, 53 cm iznutra', ...box(ROBOT_BOX.x0, ROBOT_BOX.x1, ROBOT_BOX.y0, ROBOT_BOX.y1, 0, ROBOT_BOX.z1), color: WHITE },
  { id: 'image', label: `Slika projektora ${c.imageWidth} x ${Math.round(c.imageHeight)}`, ...box(2660, 2666, IMAGE.y0, IMAGE.y1, IMAGE.z0, IMAGE.z1), color: '#3c5a78' },
  { id: 'projector', label: 'Projektor', ...box(PROJECTOR.x0, PROJECTOR.x1, PROJECTOR.y - PROJECTOR.w / 2, PROJECTOR.y + PROJECTOR.w / 2, PROJECTOR.z0, PROJECTOR.z1), color: '#d8d6cf' },
  // People: 96 cm sitting height is an ESTIMATE. Their pivot is the seat, so pos is the seat itself.
  { id: 'sitUpper', label: `Sedi gore: ${c.upperBedHead} mm do plafona`, size: [420, 420, PERSON.sitting], pivot: [0, 0, -PERSON.sitting / 2], pos: [2240, 4470, UPPER.top], color: WHO },
  { id: 'sitLounge', label: `Sedi na kraku: ${c.loungeHead} mm do plafona`, size: [420, 420, PERSON.sitting], pivot: [0, 0, -PERSON.sitting / 2], pos: [2300, 2800, T + ARM.cushion], color: WHO },
  { id: 'sitLow', label: `Sedi u donjem krevetu: ${c.lowBedUnderBeam} ispod grede`, size: [420, 420, PERSON.sitting], pivot: [0, 0, -PERSON.sitting / 2], pos: [1400, 4300, 320], color: WHO },
  { id: 'pianist', label: 'Svira: glava van palube', size: [420, 420, PERSON.sitting], pivot: [0, 0, -PERSON.sitting / 2], pos: [PIANO.x0 - PERSON.headFromKeys, BENCH.y, BENCH.h], color: WHO },
  { id: 'climber', label: 'Penje se', size: [420, 300, PERSON.sitting], pivot: [0, 0, -PERSON.sitting / 2], pos: [1977, 1350, 0], color: '#6d93aa' },
];

const study = {
  id: 'steel-loft',
  title: 'Dizajn B: čelični ram, drugi krevet gore, do vrata',
  understanding: `Second design option. Black steel frame with a full second bed above the low bed and a 90 cm lounge arm along the east wall ending just before the door frame. Deck underside now 1.30 m, not 1.25: a 96 cm sitter (estimate) fits under the deck on the low bed by ${c.lowBedUnderBeam} mm under a beam and ${c.lowBedBetweenBeams} mm between them, with ${c.upperBedHead} above the head on the upper bed and ${c.loungeHead} on the lounge. Six posts, moved so none stands in the low bed, plus a steel angle on the north wall and sway ties to the east wall, so it is not fully freestanding. The piano moves to the arm's edge, keys west, because against the wall the player's head would be under the deck. The robot's box sits behind the piano. Projector picture ${c.imageWidth} mm wide on the east wall at the foot of the low bed. Guard rail on the upper bed proposed. It does not fold. Sizes are my proposal and nothing is simulated.`,
  duration: 6,
  place: { x: 0, y: 0 },
  blocks,
  keyframes: {
    climber: [
      { t: 0.8, pos: [1977, 1350, 0] },
      { t: 2.6, pos: [1977, 1440, 700] },
      { t: 3.6, pos: [1977, 1500, 1180] },
      { t: 4.4, pos: [1977, 1800, T + ARM.cushion] },
      { t: 5.2, pos: [2200, 2150, T + ARM.cushion] },
    ],
  },
  captions: [
    { t: 0, text: 'Ram stoji na podu i oslanja se na severni zid: dva kreveta i krak do vrata' },
    { t: 0.8, text: 'Penješ se merdevinama, vrata se otvaraju pored njih' },
    { t: 4.4, text: 'Gore se sedi, glava ispod plafona' },
  ],
};

fs.writeFileSync(process.argv[2], `${JSON.stringify(study, null, 1)}\n`);

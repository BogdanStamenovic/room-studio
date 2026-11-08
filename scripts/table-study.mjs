// Writes the expanding table's block study from the same numbers as the render, so they cannot drift apart.
// Run: node scripts/table-study.mjs OUT.json, then room-studio study put OUT.json
import fs from 'node:fs';
import { BASE, DUCT, LEG, LIFT, MONITOR, RAIL, SERVER, SET, TABLE, tableState } from '../web/hifi/plan.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ size: [x1 - x0, y1 - y0, z1 - z0], pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const T = TABLE;
const D = 16; // seconds for the whole cycle
const t2s = (t) => t * D;

const blocks = [
  { id: 'rail', label: 'Zidna šina', ...box(RAIL.x0, RAIL.x1, RAIL.y0, RAIL.y1, RAIL.z0, RAIL.z1), color: '#55606a' },
  { id: 'duct', label: 'Kanal: kaiš i lanac za kablove', ...box(0, DUCT.x1, DUCT.y0, DUCT.y1, DUCT.z0, DUCT.z1), color: '#eeece5' },
  { id: 'shield', ...box(BASE.shield.x0, BASE.shield.x1, BASE.yS, BASE.yN, BASE.shield.z0, BASE.shield.z1), color: '#f3f2ec' },
  { id: 'postFS', ...box(BASE.front.x0, BASE.front.x1, BASE.yS, BASE.yS + 60, 0, BASE.front.z0), color: '#f3f2ec' },
  { id: 'postFN', ...box(BASE.front.x0, BASE.front.x1, BASE.yN - 60, BASE.yN, 0, BASE.front.z0), color: '#f3f2ec' },
  { id: 'postRS', ...box(BASE.rear.x0, BASE.rear.x1, BASE.yS, BASE.yS + 60, 0, BASE.rear.z0), color: '#f3f2ec' },
  { id: 'postRN', ...box(BASE.rear.x0, BASE.rear.x1, BASE.yN - 60, BASE.yN, 0, BASE.rear.z0), color: '#f3f2ec' },
  { id: 'beamF', label: 'Prednja greda, nosi set kad je gore', ...box(BASE.front.x0, BASE.front.x1, BASE.yS, BASE.yN, BASE.front.z0, BASE.front.z1), color: '#f3f2ec' },
  { id: 'beamR', ...box(BASE.rear.x0, BASE.rear.x1, BASE.yS, BASE.yN, BASE.rear.z0, BASE.rear.z1), color: '#f3f2ec' },
  { id: 'track', ...box(BASE.track.x0, BASE.track.x1, BASE.track.y0, BASE.track.y1, BASE.track.z0, BASE.track.z1), color: '#a8adb2' },
  ...LIFT.columns.map((y, i) => ({ id: `column${i + 1}`, ...box(178, 205, y - 30, y + 30, 12, BASE.rear.z0), color: '#55606a' })),
  { id: 'server', label: 'Server, ne pomera se', ...box(SERVER.x0, SERVER.x1, SERVER.y0, SERVER.y1, SERVER.z0, SERVER.z1), color: '#2b3338' },

  { id: 'top', label: 'Ploča sa monitorom i PS4, klizi na jug', ...box(T.x0, T.x1, T.yS, T.yN, T.z - T.thick, T.z), color: '#d6b284' },
  { id: 'apronF', parent: 'top', size: [30, T.len - 60, T.apron], pos: [(T.x1 - 20) - (T.x0 + T.x1) / 2, 0, -T.thick / 2 - T.apron / 2], color: '#f3f2ec' },
  { id: 'apronR', parent: 'top', size: [30, T.len - 20, T.apron], pos: [(T.x0 + 15) - (T.x0 + T.x1) / 2, 0, -T.thick / 2 - T.apron / 2], color: '#f3f2ec' },
  { id: 'monitor', label: 'Monitor', parent: 'top', size: [44, MONITOR.width, MONITOR.z1 - MONITOR.z0], pos: [MONITOR.x - (T.x0 + T.x1) / 2, MONITOR.y - (T.yS + T.yN) / 2, (MONITOR.z0 + MONITOR.z1) / 2 - (T.z - T.thick / 2)], color: '#22272b' },
  { id: 'ps4', label: 'PS4', parent: 'top', size: [275, 300, 56], pos: [387 - (T.x0 + T.x1) / 2, (T.yS + 260) - (T.yS + T.yN) / 2, T.thick / 2 + 28], color: '#30363b' },
  // Leg: pivots at its top. Its parent, the top, starts at the closed position, so it never starts outside the room.
  { id: 'leg', label: 'Noga: prvo dole, zaključana, tek onda klizi', parent: 'top', size: [32, 30, LEG.length + LEG.wheelR], pivot: [0, 0, (LEG.length + LEG.wheelR) / 2],
    pos: [LEG.pivot.x - (T.x0 + T.x1) / 2, LEG.pivot.y - (T.yS + T.yN) / 2, LEG.pivot.z - (T.z - T.thick / 2)], rot: [0, 90, 0], color: '#f5b700' },

  { id: 'setTray', label: 'Set: zadnji deo sa alatom', ...box(SET.x0, SET.hinge, SET.y0, SET.y1, SET.zDown - SET.thick, SET.zDown), color: '#2b3a42' },
  { id: 'leaf', label: 'Preklop: stoji kad je dole, ostavlja mesta za noge', parent: 'setTray', size: [SET.leaf, SET.y1 - SET.y0, SET.thick], pivot: [-SET.leaf / 2, 0, SET.thick / 2],
    pos: [(SET.hinge - SET.x0) / 2, 0, SET.thick / 2], rot: [0, -90, 0], color: '#3a4d57' },
  { id: 'station', label: 'Stanica za lemljenje', parent: 'setTray', size: [190, 190, 96], pos: [323 - (SET.x0 + SET.hinge) / 2, (SET.y0 + 145) - (SET.y0 + SET.y1) / 2, SET.thick / 2 + 48], color: '#b8cdd8' },
  { id: 'psu', parent: 'setTray', size: [190, 210, 127], pos: [323 - (SET.x0 + SET.hinge) / 2, (SET.y0 + 485) - (SET.y0 + SET.y1) / 2, SET.thick / 2 + 64], color: '#b8cdd8' },
  { id: 'extractor', label: 'Odsis za dim', parent: 'setTray', size: [190, 240, 147], pos: [323 - (SET.x0 + SET.hinge) / 2, (SET.y1 - 160) - (SET.y0 + SET.y1) / 2, SET.thick / 2 + 74], color: '#b8cdd8' },
];

// Keyframes come from the same state function the render uses, so the order of motion is the same one.
const samples = [0, 0.04, 0.08, 0.12, 0.16, 0.19, 0.3, 0.4, 0.5, 0.62, 0.66, 0.75, 0.8, 0.9, 0.98, 1];
const topZ = T.z - T.thick / 2; const cy = (T.yS + T.yN) / 2; const cx = (T.x0 + T.x1) / 2;
const trayZ = (st) => st.setZ - SET.thick / 2;
const keyframes = {
  top: samples.map((t) => ({ t: t2s(t), pos: [cx, cy - tableState(t).travel, topZ] })),
  leg: samples.map((t) => ({ t: t2s(t), rot: [0, (1 - tableState(t).leg) * 90, 0] })),
  setTray: samples.map((t) => ({ t: t2s(t), pos: [(SET.x0 + SET.hinge) / 2, (SET.y0 + SET.y1) / 2, trayZ(tableState(t))] })),
  leaf: samples.map((t) => ({ t: t2s(t), rot: [0, -(1 - tableState(t).leaf) * 90, 0] })),
};

const study = {
  id: 'solder-table',
  title: 'Sto koji se širi, sa stanicom za lemljenje',
  understanding: 'Revision 3, placed in the room under the west windows, using the same numbers as the render. Top 1400 x 800 at 760, slides 1400 south along the wall. Leg goes down and latches first, and only that frees the top. Soldering set then rises into the uncovered 1210 x 685 space. Location is my proposal, not yet confirmed by him. All sizes are proposals, the radiator is unmeasured, and no structural claim here has been checked.',
  duration: D,
  place: { x: 0, y: 0, rot: 0 },
  blocks,
  keyframes,
  captions: [
    { t: 0, text: 'Zatvoren: 140 x 80 cm, set sklopljen ispod, mesto za noge ispred preklopa' },
    { t: t2s(0.01), text: 'Noga se spušta i zaključava. Tek zaključana oslobađa ploču' },
    { t: t2s(0.19), text: 'Cela ploča, sa monitorom i PS4, klizi 140 cm na jug. Noga je na točku' },
    { t: t2s(0.66), text: 'Set se diže iz postolja u oslobođeni prostor' },
    { t: t2s(0.8), text: 'Preklop se spušta, set je širok 68 cm i ravan sa pločom' },
    { t: t2s(1), text: 'Otvoren: 280 cm. Monitor je južno od oba prozora; prozori se otvaraju, s tim što se za puno otvaranje odsis spušta' },
  ],
};

fs.writeFileSync(process.argv[2] || '/dev/stdout', JSON.stringify(study, null, 1));

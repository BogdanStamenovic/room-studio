// How much direct window light each design leaves on a surface, as a number and not a look.
// Run: node scripts/loft-light.mjs
//
// For a grid of up-facing points, the cosine-weighted view factor to the two window openings, with what stands in the
// way as boxes. This is the share of sky-from-the-window a surface sees directly. It leaves out bounce off the walls and
// ceiling, which in a white room is a large part of the light, so read it as a screen: it says which surfaces lose their
// view of the window, not how bright the room will look. Sun patches are not modelled either.
import { ARM, DECK, POSTS, SOUTH_BEAM, UPPER } from '../web/hifi/loft-plan.mjs';
import { BED, TABLE, VARIANTS } from '../web/hifi/plan.mjs';

// room.json: windows on the west wall, sill 1030, 1255 high.
const WINDOWS = [{ y0: 2379, y1: 3289 }, { y0: 3314, y1: 4224 }];
const Z0 = 1030; const Z1 = 2285;

const box = (x0, x1, y0, y1, z0, z1) => ({ x0, x1, y0, y1, z0, z1 });
const postBoxes = POSTS.map((p) => box(p.x - 30, p.x + 30, p.y - 30, p.y + 30, 0, DECK.underside));
const designs = {
  'no furniture': [],
  'folding seat, box in corner': [
    box(VARIANTS.corner.box.x0, VARIANTS.corner.box.x1, VARIANTS.corner.box.y0, VARIANTS.corner.box.y1, 0, 1500),
    box(1767, 2604, VARIANTS.corner.deck.y0, VARIANTS.corner.deck.y1, 1440, 1560),
  ],
  'Design B': [
    ...postBoxes,
    box(SOUTH_BEAM.x0, UPPER.x1, SOUTH_BEAM.y0, UPPER.y1, DECK.underside, UPPER.top), // upper bed, deck and mattress
    box(ARM.x0, ARM.x1, ARM.y0, ARM.y1, DECK.underside, DECK.top + ARM.cushion),
  ],
};

/** Slab test: does the segment from a to b pass through the box? */
function blocked(a, b, B) {
  let t0 = 0; let t1 = 1;
  for (const [p, q, lo, hi] of [[a[0], b[0], B.x0, B.x1], [a[1], b[1], B.y0, B.y1], [a[2], b[2], B.z0, B.z1]]) {
    const d = q - p;
    if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) return false; continue; }
    let u = (lo - p) / d; let v = (hi - p) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  return true;
}

function viewFactor(pt, blockers, nu = 24, nv = 30) {
  let f = 0;
  for (const w of WINDOWS) {
    const dA = ((w.y1 - w.y0) / nu) * ((Z1 - Z0) / nv);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const q = [0, w.y0 + (w.y1 - w.y0) * (i + 0.5) / nu, Z0 + (Z1 - Z0) * (j + 0.5) / nv];
      const dx = q[0] - pt[0]; const dy = q[1] - pt[1]; const dz = q[2] - pt[2];
      if (dz <= 0) continue;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (blockers.some((b) => blocked(pt, q, b))) continue;
      f += ((dz / Math.sqrt(r2)) * (-dx / Math.sqrt(r2)) / (Math.PI * r2)) * dA;
    }
  }
  return f;
}

function zoneMean(x0, x1, y0, y1, z, blockers, n = 12) {
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += viewFactor([x0 + (x1 - x0) * (i + 0.5) / n, y0 + (y1 - y0) * (j + 0.5) / n, z], blockers);
  return s / (n * n);
}

export const ZONES = {
  'low bed, pillow end': [BED.x0, 667, BED.y0, BED.y1, BED.mattressTop + 1],
  'low bed, under the deck': [667, BED.x1, BED.y0, BED.y1, BED.mattressTop + 1],
  'table top': [TABLE.x0, TABLE.x1, TABLE.yS, TABLE.yN, TABLE.z + 1],
  'floor, walking band': [TABLE.x1, ARM.x0, 1600, 3700, 1],
  'piano keys': [1500, 1800, 1700, 3000, 720],
  'upper mattress': [UPPER.x0, UPPER.x1, UPPER.y0, UPPER.y1, UPPER.top + 1],
};

const rows = Object.entries(ZONES).map(([name, z]) => {
  const out = { zone: name };
  const base = zoneMean(...z, designs['no furniture']);
  for (const [d, bl] of Object.entries(designs)) out[d] = `${((zoneMean(...z, bl) / base) * 100).toFixed(0)}%`;
  out['empty room, view factor'] = base.toFixed(3);
  return out;
});
console.table(rows);

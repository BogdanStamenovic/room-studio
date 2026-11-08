// Shared by the browser and the server. All lengths are millimetres.
// Plan convention: +y is north. Corners run clockwise from above: a=NW, b=NE, c=SE, d=SW.
// Stored keys stay ab/bc/cd/da so saved data never needs migrating; people only see compass names.

export const PLACEHOLDER = {
  walls: { ab: 4000, bc: 3500, cd: 4000, da: 3500 },
  height: 2600,
};
export const CHECK_TOLERANCE_MM = 15;
export const WALL_NAMES = { ab: 'North', bc: 'East', cd: 'South', da: 'West' };
export const CORNER_NAMES = { a: 'NW', b: 'NE', c: 'SE', d: 'SW' };
// Offsets run clockwise along a wall, so each wall measures from a different end.
export const WALL_START = { ab: 'west end', bc: 'north end', cd: 'east end', da: 'south end' };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function triangleApex(p, q, dp, dq) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const base = Math.hypot(dx, dy);
  const a = (dp * dp - dq * dq + base * base) / (2 * base);
  const h2 = dp * dp - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(h2);
  const mx = p[0] + (a * dx) / base;
  const my = p[1] + (a * dy) / base;
  // Right-hand side of p->q; which is the interior for a clockwise polygon.
  return [mx + (h * dy) / base, my - (h * dx) / base];
}

/** Four wall lengths and a diagonal fix the shape. The other diagonal then checks it. */
export function solveQuad({ ab, bc, cd, da, ac, bd }) {
  if (![ab, bc, cd, da, ac].every((v) => num(v))) return { error: 'needs four walls and the NW to SE diagonal' };
  const A = [0, 0];
  const B = [ab, 0];
  const C = triangleApex(A, B, ac, bc);
  if (!C) return { error: 'The north wall, east wall and NW to SE diagonal cannot form a triangle; one of them is mis-measured.' };
  const D = triangleApex(A, C, da, cd);
  if (!D) return { error: 'The south wall, west wall and NW to SE diagonal cannot form a triangle; one of them is mis-measured.' };
  const minY = Math.min(A[1], B[1], C[1], D[1]);
  const corners = [A, B, C, D].map(([x, y]) => [x, y - minY]);
  const predictedBd = Math.hypot(B[0] - D[0], B[1] - D[1]);
  const check = num(bd)
    ? { predicted: predictedBd, measured: bd, errorMm: Math.abs(predictedBd - bd), ok: Math.abs(predictedBd - bd) <= CHECK_TOLERANCE_MM }
    : { predicted: predictedBd, measured: null, errorMm: null, ok: null };
  return { corners, check };
}

function rectCorners(w, d) {
  return [[0, d], [w, d], [w, 0], [0, 0]];
}

/** Turn stored measurements into drawable geometry, marking anything that is still a guess. */
export function resolveRoom(room = {}) {
  const walls = room.walls || {};
  const diag = room.diagonals || {};
  const heights = room.heights || {};
  const warnings = [];
  let corners;
  let check = null;
  let shape;

  if (Array.isArray(room.polygon) && room.polygon.length >= 3) {
    corners = room.polygon.map(([x, y]) => [x, y]);
    shape = 'polygon';
  } else {
    const have = ['ab', 'bc', 'cd', 'da'].every((k) => num(walls[k]));
    if (have && num(diag.ac)) {
      const solved = solveQuad({ ...walls, ...diag });
      if (solved.error) {
        warnings.push(solved.error);
        corners = rectCorners(walls.ab, walls.bc);
        shape = 'assumed-square';
      } else {
        corners = solved.corners;
        check = solved.check;
        shape = 'measured';
      }
    } else if (have) {
      corners = rectCorners((walls.ab + walls.cd) / 2, (walls.bc + walls.da) / 2);
      shape = 'assumed-square';
      warnings.push('No diagonal yet, so the corners are assumed square and opposite walls are averaged.');
    } else {
      corners = rectCorners(PLACEHOLDER.walls.ab, PLACEHOLDER.walls.bc);
      shape = 'placeholder';
    }
  }

  const letters = corners.map((_, i) => String.fromCharCode(97 + i));
  const cornerHeights = letters.map((l) => num(heights[l]));
  const known = cornerHeights.filter(Boolean);
  const fallback = known.length ? Math.max(...known) : PLACEHOLDER.height;
  const edges = corners.map((p, i) => {
    const q = corners[(i + 1) % corners.length];
    const name = letters[i] + letters[(i + 1) % corners.length];
    const stored = num(walls[name]);
    return {
      name,
      label: WALL_NAMES[name] || name.toUpperCase(),
      p,
      q,
      length: Math.hypot(q[0] - p[0], q[1] - p[1]),
      measured: Boolean(stored) || shape === 'polygon',
      h0: cornerHeights[i] ?? fallback,
      h1: cornerHeights[(i + 1) % corners.length] ?? fallback,
    };
  });
  return {
    corners,
    letters,
    cornerLabels: letters.map((l) => (corners.length === 4 ? CORNER_NAMES[l] : l.toUpperCase())),
    edges,
    shape,
    check,
    warnings,
    heightsKnown: known.length === corners.length,
    maxHeight: Math.max(fallback, ...known),
    isPlaceholder: shape === 'placeholder',
  };
}

/** Evaluate an animated block's pose at time t. Eased between keyframes, held outside them. */
export function poseAt(block, frames, t) {
  const base = { pos: block.pos || [0, 0, 0], rot: block.rot || [0, 0, 0] };
  if (!frames || frames.length === 0) return base;
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const prop = (key) => {
    const list = sorted.filter((f) => f[key]);
    if (list.length === 0) return base[key];
    if (t <= list[0].t) return list[0][key];
    const last = list[list.length - 1];
    if (t >= last.t) return last[key];
    const i = list.findIndex((f) => f.t > t);
    const a = list[i - 1];
    const b = list[i];
    const u = (t - a.t) / (b.t - a.t);
    const e = u * u * (3 - 2 * u);
    return a[key].map((v, k) => v + (b[key][k] - v) * e);
  };
  return { pos: prop('pos'), rot: prop('rot') };
}

export function validateStudy(s) {
  const errs = [];
  if (!s || typeof s !== 'object') return ['study must be an object'];
  if (!s.title) errs.push('title is required');
  if (!Array.isArray(s.blocks) || s.blocks.length === 0) errs.push('blocks must be a non-empty list');
  const ids = new Set();
  for (const b of s.blocks || []) {
    if (!b.id) errs.push('every block needs an id');
    if (ids.has(b.id)) errs.push(`duplicate block id ${b.id}`);
    ids.add(b.id);
    if (!Array.isArray(b.size) || b.size.length !== 3 || !b.size.every((n) => n > 0)) errs.push(`block ${b.id}: size must be [w, d, h] in mm`);
  }
  for (const b of s.blocks || []) if (b.parent && !ids.has(b.parent)) errs.push(`block ${b.id}: unknown parent ${b.parent}`);
  for (const k of Object.keys(s.keyframes || {})) if (!ids.has(k)) errs.push(`keyframes for unknown block ${k}`);
  return errs;
}

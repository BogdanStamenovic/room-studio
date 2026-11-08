import test from 'node:test';
import assert from 'node:assert/strict';
import { solveQuad, resolveRoom, poseAt, validateStudy } from '../web/geometry.mjs';

test('a true rectangle solves to itself with A-B along the top, clockwise', () => {
  const d = Math.hypot(4000, 3000);
  const { corners, check } = solveQuad({ ab: 4000, bc: 3000, cd: 4000, da: 3000, ac: d, bd: d });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  assert.ok(near(corners[0], [0, 3000]), `A ${corners[0]}`);
  assert.ok(near(corners[1], [4000, 3000]), `B ${corners[1]}`);
  assert.ok(near(corners[2], [4000, 0]), `C ${corners[2]}`);
  assert.ok(near(corners[3], [0, 0]), `D ${corners[3]}`);
  assert.ok(check.errorMm < 1e-6 && check.ok);
});

test('an inconsistent second diagonal is flagged, a skewed room is not', () => {
  const walls = { ab: 4000, bc: 3000, cd: 4100, da: 3050 };
  const good = solveQuad({ ...walls, ac: 5050 });
  const honest = solveQuad({ ...walls, ac: 5050, bd: good.check.predicted + 3 });
  assert.equal(honest.check.ok, true);
  const bad = solveQuad({ ...walls, ac: 5050, bd: good.check.predicted + 60 });
  assert.equal(bad.check.ok, false);
  assert.equal(Math.round(bad.check.errorMm), 60);
});

test('impossible measurements return an error instead of a shape', () => {
  assert.match(solveQuad({ ab: 1000, bc: 1000, cd: 1000, da: 1000, ac: 5000 }).error, /triangle/);
});

test('walls and corners read by compass, with north at the top of the plan', () => {
  const r = resolveRoom({ walls: { ab: 3000, bc: 2000, cd: 3000, da: 2000 }, diagonals: { ac: 3606 } });
  assert.deepEqual(r.edges.map((e) => e.label), ['North', 'East', 'South', 'West']);
  assert.deepEqual(r.cornerLabels, ['NW', 'NE', 'SE', 'SW']);
  const [nw, ne, se, sw] = r.corners;
  assert.ok(nw[1] > sw[1] && ne[1] > se[1], 'north is +y');
  assert.ok(ne[0] > nw[0] && se[0] > sw[0], 'east is +x');
});

test('resolveRoom says when it is guessing', () => {
  assert.equal(resolveRoom({}).isPlaceholder, true);
  assert.equal(resolveRoom({ walls: { ab: 3000, bc: 2000, cd: 3000, da: 2000 } }).shape, 'assumed-square');
  const measured = resolveRoom({ walls: { ab: 3000, bc: 2000, cd: 3000, da: 2000 }, diagonals: { ac: 3606 } });
  assert.equal(measured.shape, 'measured');
  assert.equal(measured.edges[0].measured, true);
});

test('walls wind clockwise for any solved room, so outward normals are right', () => {
  const { corners } = solveQuad({ ab: 4000, bc: 3000, cd: 4100, da: 3050, ac: 5050 });
  let area = 0;
  corners.forEach((p, i) => { const q = corners[(i + 1) % 4]; area += p[0] * q[1] - q[0] * p[1]; });
  assert.ok(area < 0);
});

test('poseAt holds outside keyframes and interpolates inside', () => {
  const frames = [{ t: 1, rot: [0, 0, 0] }, { t: 3, rot: [90, 0, 0] }];
  const b = { pos: [1, 2, 3], rot: [5, 5, 5] };
  assert.deepEqual(poseAt(b, frames, 0).rot, [0, 0, 0]);
  assert.deepEqual(poseAt(b, frames, 9).rot, [90, 0, 0]);
  assert.equal(poseAt(b, frames, 2).rot[0], 45);
  assert.deepEqual(poseAt(b, frames, 2).pos, [1, 2, 3]);
  assert.deepEqual(poseAt(b, undefined, 2).rot, [5, 5, 5]);
});

test('validateStudy catches the mistakes an agent makes', () => {
  assert.deepEqual(validateStudy({ title: 't', blocks: [{ id: 'a', size: [1, 1, 1] }] }), []);
  assert.ok(validateStudy({ title: 't', blocks: [{ id: 'a', size: [1, 1] }] }).length);
  assert.ok(validateStudy({ title: 't', blocks: [{ id: 'a', size: [1, 1, 1], parent: 'x' }] }).length);
  assert.ok(validateStudy({ title: 't', blocks: [{ id: 'a', size: [1, 1, 1] }], keyframes: { b: [] } }).length);
});

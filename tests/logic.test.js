import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chainMultiplier, torusDistance, inAperture, segmentSphere, distSqPointSegment, catmullRom, clamp, mulberry32,
} from '../src/engine/math.js';
import { Scheduler } from '../src/engine/coroutines.js';
import { cone, fan, shell, basis, angleBetween, normalize, rotateAround, dirTo } from '../src/game/patterns.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('chain multiplier grows monotonically and caps at 16', () => {
  let prev = 0;
  for (let i = 0; i < 400; i++) {
    const m = chainMultiplier(i);
    assert.ok(m >= prev);
    assert.ok(m <= 16);
    prev = m;
  }
  assert.equal(chainMultiplier(0), 1);
  assert.equal(chainMultiplier(1), 1);
  assert.equal(chainMultiplier(1000), 16);
});

test('torus distance: inside the tube is negative, centre hole is positive', () => {
  assert.ok(torusDistance(0.5, 0, 0, 0.5, 0.02) < 0);
  assert.ok(torusDistance(0, 0, 0, 0.5, 0.02) > 0.4);
  near(torusDistance(0.5, 0, 0.05, 0.5, 0.02), 0.03);
});

test('aperture test accepts points within the half angle only', () => {
  // aperture facing +Z on a sphere at origin
  assert.ok(inAperture(0, 0, 0.17, 0, 0, 0, 0, 0, 1, 0.25));
  assert.ok(!inAperture(0.17, 0, 0, 0, 0, 0, 0, 0, 1, 0.25));
  const a = 0.2;
  assert.ok(inAperture(Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 0, 1, 0.25));
  assert.ok(!inAperture(Math.sin(0.3), 0, Math.cos(0.3), 0, 0, 0, 0, 0, 1, 0.25));
});

test('segment-sphere detects crossings and misses', () => {
  assert.ok(segmentSphere(0, 0, -1, 0, 0, 1, 0, 0, 0, 0.1) >= 0);
  assert.equal(segmentSphere(0.5, 0, -1, 0.5, 0, 1, 0, 0, 0, 0.1), -1);
  // short segment that stops before the sphere
  assert.equal(segmentSphere(0, 0, -1, 0, 0, -0.5, 0, 0, 0, 0.1), -1);
  // starting inside counts as a hit
  assert.equal(segmentSphere(0, 0, 0, 0, 0, 1, 0, 0, 0, 0.1), 0);
});

test('point-segment distance', () => {
  near(distSqPointSegment(0, 1, 0, -1, 0, 0, 1, 0, 0), 1);
  near(distSqPointSegment(3, 0, 0, -1, 0, 0, 1, 0, 0), 4);
});

test('catmull-rom passes through its end points', () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 0 }, { x: 2, y: 0, z: 1 }, { x: 3, y: 1, z: 1 }];
  const o = {};
  catmullRom(pts, 0, o);
  near(o.x, 0); near(o.y, 0);
  catmullRom(pts, 1, o);
  near(o.x, 3); near(o.y, 1); near(o.z, 1);
  catmullRom(pts, 1 / 3, o);
  near(o.x, 1); near(o.y, 2);
});

test('scheduler: waits, conditions, overflow and owner cancellation', () => {
  const s = new Scheduler();
  const log = [];
  let flag = false;
  s.start((function* () {
    log.push('a');
    yield 1;
    log.push('b');
    yield () => flag;
    log.push('c');
    yield 0.5;
    yield 0.5;
    log.push('d');
  })());
  assert.deepEqual(log, ['a']);
  s.update(0.5);
  assert.deepEqual(log, ['a']);
  s.update(0.6);
  assert.deepEqual(log, ['a', 'b']);
  s.update(1);
  assert.deepEqual(log, ['a', 'b']);
  flag = true;
  s.update(0.01);
  assert.deepEqual(log, ['a', 'b', 'c']);
  // one long frame covers both half-second waits
  s.update(1.2);
  assert.deepEqual(log, ['a', 'b', 'c', 'd']);
  assert.equal(s.tasks.length, 0);

  const owner = { alive: true };
  let ticks = 0;
  s.start((function* () { while (true) { ticks++; yield 0.1; } })(), owner);
  s.update(0.1);
  s.update(0.1);
  owner.alive = false;
  const before = ticks;
  s.update(0.1);
  assert.equal(ticks, before);
  assert.equal(s.tasks.length, 0);
});

test('scheduler: bare yield waits exactly one frame without consuming time', () => {
  const s = new Scheduler();
  const log = [];
  s.start((function* () { yield; log.push(1); yield 1; log.push(2); })());
  s.update(5);
  assert.deepEqual(log, [1]);
  s.update(0.99);
  assert.deepEqual(log, [1]);
  s.update(0.02);
  assert.deepEqual(log, [1, 2]);
});

test('scheduler: a coroutine that never yields time throws', () => {
  const s = new Scheduler();
  assert.throws(() => s.start((function* () { while (true) yield 0; })()));
});

test('basis vectors are orthonormal to the aim', () => {
  for (const d of [{ x: 0, y: 0, z: 1 }, normalize({ x: 1, y: 2, z: 3 }), { x: 0, y: 1, z: 0 }]) {
    const { u, v } = basis(d);
    near(u.x * d.x + u.y * d.y + u.z * d.z, 0);
    near(v.x * d.x + v.y * d.y + v.z * d.z, 0);
    near(u.x * v.x + u.y * v.y + u.z * v.z, 0);
    near(Math.hypot(u.x, u.y, u.z), 1);
    near(Math.hypot(v.x, v.y, v.z), 1);
  }
});

test('cone directions sit exactly at the cone angle around the axis', () => {
  const axis = normalize({ x: 0.2, y: -0.1, z: 1 });
  const dirs = cone(axis, 12, 0.16, 0.3);
  assert.equal(dirs.length, 12);
  for (const d of dirs) {
    near(Math.hypot(d.x, d.y, d.z), 1);
    near(angleBetween(d, axis), 0.16, 1e-6);
  }
});

test('fan spreads evenly across the requested arc', () => {
  const aim = { x: 0, y: 0, z: 1 };
  const dirs = fan(aim, 5, 0.8);
  assert.equal(dirs.length, 5);
  near(angleBetween(dirs[0], dirs[4]), 0.8, 1e-6);
  near(angleBetween(dirs[2], aim), 0, 1e-6);
  // horizontal fan stays horizontal
  for (const d of dirs) near(d.y, 0);
});

test('shell keeps only forward directions and leaves a gap', () => {
  const facing = { x: 0, y: 0, z: 1 };
  const gap = normalize({ x: 0.1, y: 0, z: 1 });
  const dirs = shell(200, facing, 0.5, gap, 0.2);
  assert.ok(dirs.length > 20);
  for (const d of dirs) {
    assert.ok(d.z >= 0.5 - 1e-9);
    assert.ok(angleBetween(d, gap) >= 0.2 - 1e-9);
  }
});

test('rotateAround preserves length and rotates by the angle', () => {
  const d = { x: 1, y: 0, z: 0 };
  const r = rotateAround(d, { x: 0, y: 0, z: 1 }, Math.PI / 2);
  near(r.x, 0); near(r.y, 1); near(r.z, 0);
  const dir = dirTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 });
  near(dir.y, 0.6); near(dir.z, 0.8);
});

test('deterministic PRNG', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.equal(clamp(5, 0, 1), 1);
});

// Pure bullet-pattern geometry: every function returns unit direction vectors {x,y,z}.
// Emitters combine these with speeds and timing. Kept free of three.js so they are unit-tested.

import { TAU } from '../engine/math.js';

export function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function dirTo(from, to) {
  return normalize({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
}

/** Two unit vectors perpendicular to d (and each other). */
export function basis(d) {
  // pick a helper axis not parallel to d; prefer world up so "horizontal" fans stay horizontal
  const up = Math.abs(d.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  // u = normalize(up x d) (horizontal), v = d x u (vertical-ish)
  let u = { x: up.y * d.z - up.z * d.y, y: up.z * d.x - up.x * d.z, z: up.x * d.y - up.y * d.x };
  u = normalize(u);
  const v = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x };
  return { u, v };
}

/** Rotate direction d by angle a around the axis k (Rodrigues). */
export function rotateAround(d, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const dot = d.x * k.x + d.y * k.y + d.z * k.z;
  return {
    x: d.x * c + (k.y * d.z - k.z * d.y) * s + k.x * dot * (1 - c),
    y: d.y * c + (k.z * d.x - k.x * d.z) * s + k.y * dot * (1 - c),
    z: d.z * c + (k.x * d.y - k.y * d.x) * s + k.z * dot * (1 - c),
  };
}

/**
 * Fan of n directions spread across `spread` radians around aim.
 * tilt rotates the fan's plane around the aim axis (0 = horizontal fan, PI/2 = vertical).
 */
export function fan(aim, n, spread, tilt = 0) {
  const { u, v } = basis(aim);
  const ax = { x: u.x * Math.cos(tilt) + v.x * Math.sin(tilt), y: u.y * Math.cos(tilt) + v.y * Math.sin(tilt), z: u.z * Math.cos(tilt) + v.z * Math.sin(tilt) };
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const a = t * spread;
    out.push(normalize({ x: aim.x * Math.cos(a) + ax.x * Math.sin(a), y: aim.y * Math.cos(a) + ax.y * Math.sin(a), z: aim.z * Math.cos(a) + ax.z * Math.sin(a) }));
  }
  return out;
}

/** n directions on a cone of half-angle `cone` around axis, starting at phase. cone=PI/2 -> flat ring. */
export function cone(axis, n, coneAngle, phase = 0) {
  const { u, v } = basis(axis);
  const out = [];
  const ca = Math.cos(coneAngle), sa = Math.sin(coneAngle);
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    const c = Math.cos(a) * sa, s = Math.sin(a) * sa;
    out.push({ x: axis.x * ca + u.x * c + v.x * s, y: axis.y * ca + u.y * c + v.y * s, z: axis.z * ca + u.z * c + v.z * s });
  }
  return out;
}

/**
 * Evenly distributed directions on a sphere (Fibonacci), keeping only those that head towards
 * `facing` (dot > minDot) and skipping a hole of half-angle `gapAngle` around gapDir.
 */
export function shell(n, facing, minDot = 0.15, gapDir = null, gapAngle = 0, phase = 0) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const cosGap = Math.cos(gapAngle);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i + phase;
    const d = { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    if (d.x * facing.x + d.y * facing.y + d.z * facing.z < minDot) continue;
    if (gapDir && d.x * gapDir.x + d.y * gapDir.y + d.z * gapDir.z > cosGap) continue;
    out.push(d);
  }
  return out;
}

/** Angle between two unit vectors. */
export function angleBetween(a, b) {
  const d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(d);
}

// Small math helpers shared by gameplay code. Pure functions, no three.js, so they are unit-testable.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutCubic = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  t = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** Frame-rate independent exponential approach. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Deterministic PRNG so patterns are reproducible in tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(1337);
export const seedRandom = (s) => { rng = mulberry32(s); };
export const rand = (lo = 0, hi = 1) => lo + (hi - lo) * rng();
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const randSign = () => (rng() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];

/** Uniform random unit vector written into out {x,y,z}. */
export function randomUnit(out) {
  const z = rand(-1, 1);
  const a = rand(0, TAU);
  const r = Math.sqrt(1 - z * z);
  out.x = r * Math.cos(a);
  out.y = r * Math.sin(a);
  out.z = z;
  return out;
}

/** Squared distance from point p to segment ab (all {x,y,z}). Also returns param t via out. */
export function distSqPointSegment(px, py, pz, ax, ay, az, bx, by, bz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px, cy = ay + aby * t - py, cz = az + abz * t - pz;
  if (out) out.t = t;
  return cx * cx + cy * cy + cz * cz;
}

/**
 * Signed distance from a point given in a torus' local frame (torus lies in the XY plane,
 * axis along Z) to the torus surface. Negative = inside the tube.
 */
export function torusDistance(x, y, z, majorR, minorR) {
  const q = Math.sqrt(x * x + y * y) - majorR;
  return Math.sqrt(q * q + z * z) - minorR;
}

/**
 * Does a point on (or near) a sphere's surface fall inside a circular aperture?
 * dir is the aperture axis (unit). Returns true when the angle between (p - c) and dir < halfAngle.
 */
export function inAperture(px, py, pz, cx, cy, cz, dx, dy, dz, halfAngle) {
  const vx = px - cx, vy = py - cy, vz = pz - cz;
  const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (len < 1e-6) return true;
  const cos = (vx * dx + vy * dy + vz * dz) / len;
  return cos >= Math.cos(halfAngle);
}

/** Ray/segment vs sphere: returns entry param t in [0,1] along segment p0->p1, or -1. */
export function segmentSphere(p0x, p0y, p0z, p1x, p1y, p1z, cx, cy, cz, r) {
  const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
  const fx = p0x - cx, fy = p0y - cy, fz = p0z - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c <= 0) return 0; // starts inside
  if (a < 1e-12) return -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Chain multiplier from consecutive kills. Grows quickly at first, then slowly, capped. */
export function chainMultiplier(chain) {
  if (chain <= 1) return 1;
  return Math.min(16, 1 + Math.floor(Math.sqrt(chain * 2.2)));
}

/** Catmull-Rom interpolation across an array of {x,y,z}; t in [0,1] spans the whole path. */
export function catmullRom(points, t, out) {
  const n = points.length - 1;
  const ft = clamp(t, 0, 1) * n;
  const i = Math.min(Math.floor(ft), n - 1);
  const lt = ft - i;
  const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n)];
  const t2 = lt * lt, t3 = t2 * lt;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * lt + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  out.x = f(p0.x, p1.x, p2.x, p3.x);
  out.y = f(p0.y, p1.y, p2.y, p3.y);
  out.z = f(p0.z, p1.z, p2.z, p3.z);
  return out;
}

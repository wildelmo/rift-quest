import * as THREE from 'three';
import { Billboards, SHAPE } from '../engine/billboards.js';
import { rand, randomUnit, TAU } from '../engine/math.js';
import { debrisGeometry } from './models.js';

// Particles, debris, flashes. Everything lives in arena-local space.

const _u = { x: 0, y: 0, z: 0 };
const _c = new THREE.Color();

export const COLORS = {
  white: [1, 1, 1],
  cyan: [0.2, 0.95, 1],
  blue: [0.25, 0.5, 1],
  magenta: [1, 0.18, 0.62],
  pink: [1, 0.45, 0.8],
  orange: [1, 0.55, 0.1],
  amber: [1, 0.75, 0.2],
  red: [1, 0.09, 0.2],
  violet: [0.65, 0.3, 1],
  gold: [1, 0.85, 0.35],
  green: [0.4, 1, 0.5],
  smoke: [0.32, 0.46, 0.5],
};

class Particle {
  constructor() {
    this.alive = false;
  }
}

export class Fx {
  constructor(parent, room) {
    this.room = room;
    this.sprites = new Billboards(4000, { renderOrder: 12 });
    parent.add(this.sprites.mesh);
    this.pool = [];
    for (let i = 0; i < 3500; i++) this.pool.push(new Particle());
    this.live = [];
    this.free = this.pool.slice();

    // Debris chunks (instanced), bounce off the real floor and tables.
    this.maxDebris = 260;
    const dmat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.4, flatShading: true });
    this.debrisMesh = new THREE.InstancedMesh(debrisGeometry(), dmat, this.maxDebris);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.setColorAt(0, _c.set(0xffffff));
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    parent.add(this.debrisMesh);
    this.debris = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._axis = new THREE.Vector3();

    // A single roaming light that kicks on for explosions so the metal hulls catch the flash.
    this.light = new THREE.PointLight(0xffaa66, 0, 2.5, 1.6);
    parent.add(this.light);
    this.lightLevel = 0;
  }

  spawn(o) {
    const p = this.free.pop();
    if (!p) return null;
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = 0;
    p.maxLife = o.life || 0.5;
    p.size0 = o.size ?? 0.02;
    p.size1 = o.size1 ?? p.size0;
    const col = o.color || COLORS.white;
    p.r = col[0]; p.g = col[1]; p.b = col[2];
    const col1 = o.color1 || col;
    p.r1 = col1[0]; p.g1 = col1[1]; p.b1 = col1[2];
    p.a0 = o.alpha ?? 1;
    p.shape = o.shape ?? SHAPE.GLOW;
    p.additive = o.additive ?? 0.6;
    p.drag = o.drag ?? 0;
    p.gravity = o.gravity ?? 0;
    p.stretch = o.stretch ?? 0;
    p.bounce = o.bounce ?? false;
    p.rot = o.rot ?? rand(0, TAU);
    p.spin = o.spin ?? 0;
    p.fadeIn = o.fadeIn ?? 0;
    p.flicker = o.flicker ?? 0;
    this.live.push(p);
    return p;
  }

  // ---------- recipes ----------

  sparks(pos, count, color, speed = 0.6, opts = {}) {
    for (let i = 0; i < count; i++) {
      randomUnit(_u);
      const s = speed * rand(0.35, 1);
      let vx = _u.x * s, vy = _u.y * s, vz = _u.z * s;
      if (opts.dir) {
        vx = vx * 0.5 + opts.dir.x * s;
        vy = vy * 0.5 + opts.dir.y * s;
        vz = vz * 0.5 + opts.dir.z * s;
      }
      this.spawn({
        x: pos.x, y: pos.y, z: pos.z, vx, vy, vz,
        life: rand(0.25, 0.6) * (opts.lifeScale || 1), size: rand(0.004, 0.008) * (opts.sizeScale || 1), size1: 0.001,
        color: COLORS.white, color1: color, shape: SHAPE.SPARK, additive: 0.5, drag: 2.2, gravity: opts.gravity ?? -0.9,
        stretch: 0.045, bounce: opts.bounce ?? true,
      });
    }
  }

  flash(pos, size, color = COLORS.white, life = 0.12) {
    this.spawn({ x: pos.x, y: pos.y, z: pos.z, life, size, size1: size * 1.6, color, shape: SHAPE.STAR, additive: 0.85, rot: 0 });
    this.spawn({ x: pos.x, y: pos.y, z: pos.z, life: life * 1.4, size: size * 1.2, size1: size * 0.4, color, shape: SHAPE.GLOW, additive: 0.9 });
  }

  ring(pos, size, color, life = 0.4, alpha = 1) {
    this.spawn({ x: pos.x, y: pos.y, z: pos.z, life, size: size * 0.2, size1: size, color: COLORS.white, color1: color, shape: SHAPE.RING, additive: 0.4, alpha });
  }

  smoke(pos, count, size = 0.05, opts = {}) {
    for (let i = 0; i < count; i++) {
      randomUnit(_u);
      this.spawn({
        x: pos.x + _u.x * size * 0.4, y: pos.y + _u.y * size * 0.4, z: pos.z + _u.z * size * 0.4,
        vx: _u.x * 0.06, vy: _u.y * 0.06 + 0.05, vz: _u.z * 0.06,
        life: rand(0.8, 1.6) * (opts.lifeScale || 1), size: size * rand(0.5, 0.9), size1: size * rand(1.4, 2.2),
        color: opts.color || COLORS.smoke, shape: SHAPE.SMOKE, additive: 0, alpha: opts.alpha ?? 0.65, drag: 1.2,
        spin: rand(-1, 1), fadeIn: 0.1,
      });
    }
  }

  fireball(pos, size, count = 6, hot = COLORS.amber, cool = COLORS.red) {
    for (let i = 0; i < count; i++) {
      randomUnit(_u);
      const s = rand(0.05, 0.25) * size * 10;
      this.spawn({
        x: pos.x, y: pos.y, z: pos.z, vx: _u.x * s, vy: _u.y * s, vz: _u.z * s,
        life: rand(0.25, 0.5), size: size * rand(0.5, 0.9), size1: size * rand(1.2, 1.8),
        color: hot, color1: cool, shape: SHAPE.GLOW, additive: 0.55, alpha: 0.95, drag: 4,
      });
    }
  }

  /** Spawn tumbling debris chunks that fall and bounce on real surfaces. */
  chunks(pos, count, color, size = 0.008, speed = 0.5) {
    for (let i = 0; i < count; i++) {
      if (this.debris.length >= this.maxDebris) this.debris.shift();
      randomUnit(_u);
      const s = speed * rand(0.3, 1);
      this.debris.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: _u.x * s, vy: _u.y * s + 0.2, vz: _u.z * s,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU))),
        ax: rand(-1, 1), ay: rand(-1, 1), az: rand(-1, 1), spin: rand(4, 14),
        size: size * rand(0.5, 1.4), life: 0, maxLife: rand(2.2, 3.8), color: new THREE.Color(color), rested: false,
      });
    }
  }

  /** Standard explosion recipe; scale ~1 for a small enemy, 3+ for boss parts. */
  explode(pos, scale = 1, opts = {}) {
    const hot = opts.hot || COLORS.amber;
    const cool = opts.cool || COLORS.magenta;
    this.flash(pos, 0.07 * scale, COLORS.white, 0.1 + 0.03 * scale);
    this.fireball(pos, 0.022 * scale, Math.round(4 + scale * 3), hot, cool);
    this.sparks(pos, Math.round(12 + scale * 10), hot, 0.5 + scale * 0.25, { lifeScale: 1 + scale * 0.15 });
    this.ring(pos, 0.12 * scale, cool, 0.35 + scale * 0.05);
    this.smoke(pos, Math.round(2 + scale * 2), 0.025 * scale);
    if (opts.chunkColor !== undefined) this.chunks(pos, Math.round(3 + scale * 3), opts.chunkColor, 0.006 * Math.sqrt(scale), 0.4 + scale * 0.1);
    this.lightAt(pos, 0.6 + scale * 0.5);
  }

  lightAt(pos, intensity) {
    this.light.position.set(pos.x, pos.y, pos.z);
    this.lightLevel = Math.max(this.lightLevel, intensity);
  }

  /** Charge-up particles sucked toward a point. */
  inward(pos, radius, color, count = 1) {
    for (let i = 0; i < count; i++) {
      randomUnit(_u);
      const life = rand(0.18, 0.3);
      this.spawn({
        x: pos.x + _u.x * radius, y: pos.y + _u.y * radius, z: pos.z + _u.z * radius,
        vx: -_u.x * radius / life, vy: -_u.y * radius / life, vz: -_u.z * radius / life,
        life, size: 0.004, size1: 0.002, color: COLORS.white, color1: color, shape: SHAPE.SPARK, additive: 0.7, stretch: 0.03,
      });
    }
  }

  update(dt) {
    const floorY = this.room.floorY;
    const surfaces = this.room.surfaces;
    const live = this.live;
    let w = 0;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.free.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k; p.vz *= k;
      }
      p.vy += p.gravity * dt;
      const ny = p.y + p.vy * dt;
      if (p.bounce && p.vy < 0) {
        const sy = surfaceBelow(surfaces, floorY, p.x, p.y, p.z);
        if (ny < sy) {
          p.vy = -p.vy * 0.45;
          p.vx *= 0.7; p.vz *= 0.7;
          p.y = sy + 0.001;
        } else p.y = ny;
      } else p.y = ny;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      live[w++] = p;
    }
    live.length = w;

    // debris
    const ds = this.debris;
    let dw = 0;
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      d.life += dt;
      if (d.life > d.maxLife) continue;
      if (!d.rested) {
        d.vy -= 1.8 * dt;
        const k = Math.exp(-0.6 * dt);
        d.vx *= k; d.vz *= k;
        const sy = surfaceBelow(surfaces, floorY, d.x, d.y, d.z) + d.size * 0.5;
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        const ny = d.y + d.vy * dt;
        if (ny < sy && d.vy < 0) {
          d.y = sy;
          d.vy = -d.vy * 0.38;
          d.vx *= 0.6; d.vz *= 0.6;
          d.spin *= 0.6;
          if (Math.abs(d.vy) < 0.08) { d.vy = 0; d.rested = true; }
        } else d.y = ny;
        this._axis.set(d.ax, d.ay, d.az).normalize();
        this._q.setFromAxisAngle(this._axis, d.spin * dt);
        d.q.premultiply(this._q);
      }
      ds[dw++] = d;
    }
    ds.length = dw;

    this.lightLevel *= Math.exp(-9 * dt);
    this.light.intensity = this.lightLevel * 1.2;
  }

  render() {
    const s = this.sprites;
    s.begin();
    for (const p of this.live) {
      const t = p.life / p.maxLife;
      const size = p.size0 + (p.size1 - p.size0) * t;
      let a = p.a0 * (1 - t * t);
      if (p.fadeIn > 0 && p.life < p.fadeIn) a *= p.life / p.fadeIn;
      if (p.flicker) a *= 0.6 + 0.4 * Math.sin(p.life * 60 + p.rot * 10);
      const r = p.r + (p.r1 - p.r) * t, g = p.g + (p.g1 - p.g) * t, b = p.b + (p.b1 - p.b) * t;
      s.push(p.x, p.y, p.z, size, r, g, b, a, p.shape, p.additive, p.vx, p.vy, p.vz, p.stretch, p.rot);
    }
    s.end();

    const m = this.debrisMesh;
    const n = this.debris.length;
    for (let i = 0; i < n; i++) {
      const d = this.debris[i];
      const fade = Math.min(1, (d.maxLife - d.life) / 0.5);
      this._v.set(d.x, d.y, d.z);
      this._s.setScalar(d.size * fade);
      this._m.compose(this._v, d.q, this._s);
      m.setMatrixAt(i, this._m);
      m.setColorAt(i, d.color);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const p of this.live) { p.alive = false; this.free.push(p); }
    this.live.length = 0;
    this.debris.length = 0;
  }
}

/** Height of the highest real surface below a point (floor or a detected table). */
export function surfaceBelow(surfaces, floorY, x, y, z) {
  let best = floorY;
  for (const s of surfaces) {
    if (s.y > best && s.y <= y + 0.01 && s.contains(x, z)) best = s.y;
  }
  return best;
}

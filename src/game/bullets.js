import * as THREE from 'three';
import { difficulty } from './difficulty.js';
import { Billboards, SHAPE } from '../engine/billboards.js';
import { distSqPointSegment, clamp } from '../engine/math.js';
import { COLORS } from './fx.js';

// Enemy bullets, lasers and the score stars that cancelled bullets turn into.

export const BULLET = {
  // [sprite size (quad width incl. halo), hit radius, colour]. The lit ball is ~56% of the sprite,
  // and the hit radius matches the visible ball so what you see is what hits you.
  // Different patterns use different looks so overlapping streams stay readable.
  small: [0.016, 0.0042, COLORS.red],
  medium: [0.02, 0.0054, COLORS.magenta],
  large: [0.03, 0.0082, COLORS.violet],
  huge: [0.05, 0.0135, COLORS.red],
  rice: [0.014, 0.0038, COLORS.orange],
  amber: [0.016, 0.0044, COLORS.orange],
  red: [0.017, 0.0046, COLORS.red],
  violet: [0.02, 0.0054, COLORS.violet],
};

/** Bullet speed multiplier for the current difficulty. */
export const bulletSpeed = () => difficulty().bulletSpeed;

class Bullet {
  constructor() {
    this.alive = false;
  }
}

export class EnemyBullets {
  constructor(parent) {
    this.sprites = new Billboards(1800, { renderOrder: 14 });
    parent.add(this.sprites.mesh);
    this.pool = [];
    for (let i = 0; i < 1400; i++) this.pool.push(new Bullet());
    this.free = this.pool.slice();
    this.live = [];
    this.stars = [];
    this.headPos = new THREE.Vector3(0, 0.3, 0.45);
    this.time = 0;
  }

  get count() {
    return this.live.length;
  }

  /** Spawn a bullet. kind is a key of BULLET or a custom [size, radius, color]. */
  spawn(x, y, z, vx, vy, vz, kind = 'small', opts = {}) {
    // difficulty density: evenly thin the stream so every pattern keeps its shape
    if (!opts.force) {
      this.densityBudget = (this.densityBudget || 0) + difficulty().density;
      if (this.densityBudget < 1) return null;
      this.densityBudget -= 1;
    }
    const b = this.free.pop();
    if (!b) return null;
    const k = typeof kind === 'string' ? BULLET[kind] : kind;
    b.alive = true;
    b.x = x; b.y = y; b.z = z;
    const spd = opts.rawSpeed ? 1 : bulletSpeed();
    b.vx = vx * spd; b.vy = vy * spd; b.vz = vz * spd;
    b.size = k[0];
    b.radius = k[1];
    b.color = opts.color || k[2];
    b.stretch = opts.stretch ?? (kind === 'rice' ? 0.06 : 0);
    b.accel = opts.accel || 0;
    b.minSpeed = opts.minSpeed ?? 0.05;
    b.maxSpeed = opts.maxSpeed ?? 3;
    b.turn = opts.turn || 0; // rad/s around turnAxis
    b.turnAxis = opts.turnAxis || null;
    b.aimAt = opts.aimAt ?? -1; // seconds after spawn to re-aim at the ship
    b.aimSpeed = (opts.aimSpeed ?? 0.5) * bulletSpeed();
    b.age = 0;
    b.life = opts.life ?? 14;
    b.grazed = false;
    b.spawnFx = 0.12;
    this.live.push(b);
    return b;
  }

  /** Remove everything; returns removed bullets so callers can turn them into score stars. */
  cancelAll(toStars = true) {
    const out = [];
    for (const b of this.live) {
      if (toStars) this._star(b.x, b.y, b.z);
      out.push(b);
      b.alive = false;
      this.free.push(b);
    }
    this.live.length = 0;
    return out.length;
  }

  cancelRadius(x, y, z, r, toStars = true) {
    let n = 0;
    const r2 = r * r;
    let w = 0;
    for (const b of this.live) {
      const dx = b.x - x, dy = b.y - y, dz = b.z - z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        if (toStars) this._star(b.x, b.y, b.z);
        b.alive = false;
        this.free.push(b);
        n++;
      } else this.live[w++] = b;
    }
    this.live.length = w;
    return n;
  }

  _star(x, y, z) {
    if (this.stars.length > 600) return;
    this.stars.push({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.2) * 0.3, vz: (Math.random() - 0.5) * 0.3, age: 0 });
  }

  /**
   * Advance bullets and resolve against the ship.
   * ship: { x,y,z, radius, grazeRadius, vulnerable } ; callbacks: onHit(b), onGraze(b), onStar()
   */
  update(dt, ship, cb) {
    this.time += dt;
    const head = this.headPos;
    const live = this.live;
    let w = 0;
    let hit = null;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      b.age += dt;
      if (b.turn) {
        const ax = b.turnAxis;
        const a = b.turn * dt;
        const c = Math.cos(a), s = Math.sin(a);
        if (!ax) {
          const nx = b.vx * c - b.vy * s;
          b.vy = b.vx * s + b.vy * c;
          b.vx = nx;
        } else {
          const dot = b.vx * ax.x + b.vy * ax.y + b.vz * ax.z;
          const nx = b.vx * c + (ax.y * b.vz - ax.z * b.vy) * s + ax.x * dot * (1 - c);
          const ny = b.vy * c + (ax.z * b.vx - ax.x * b.vz) * s + ax.y * dot * (1 - c);
          const nz = b.vz * c + (ax.x * b.vy - ax.y * b.vx) * s + ax.z * dot * (1 - c);
          b.vx = nx; b.vy = ny; b.vz = nz;
        }
      }
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy, b.vz) || 1e-6;
        const ns = clamp(sp + b.accel * dt, b.minSpeed, b.maxSpeed);
        const k = ns / sp;
        b.vx *= k; b.vy *= k; b.vz *= k;
      }
      if (b.aimAt >= 0 && b.age >= b.aimAt) {
        b.aimAt = -1;
        const dx = ship.x - b.x, dy = ship.y - b.y, dz = ship.z - b.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        b.vx = (dx / l) * b.aimSpeed; b.vy = (dy / l) * b.aimSpeed; b.vz = (dz / l) * b.aimSpeed;
        b.spawnFx = 0.1;
        cb.onReaim && cb.onReaim(b);
      }
      const px = b.x, py = b.y, pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.spawnFx > 0) b.spawnFx -= dt;

      // Out of play: well past the player, far behind the boss, or long-lived.
      const hx = b.x - head.x, hy = b.y - head.y, hz = b.z - head.z;
      const headD2 = hx * hx + hy * hy + hz * hz;
      if (b.age > b.life || b.z > head.z + 0.6 || b.z < -7 || Math.abs(b.x) > 4 || b.y < -2.5 || b.y > 3.5 || headD2 < 0.012) {
        b.alive = false;
        this.free.push(b);
        continue;
      }
      // Collision with the ship's tiny core (swept so fast bullets cannot tunnel)
      if (ship.active) {
        const d2 = distSqPointSegment(ship.x, ship.y, ship.z, px, py, pz, b.x, b.y, b.z);
        const hr = ship.radius + b.radius;
        if (ship.vulnerable && d2 < hr * hr) {
          b.alive = false;
          this.free.push(b);
          hit = hit || b; // resolved after the loop: the hit handler may clear bullets
          continue;
        }
        const gr = ship.grazeRadius + b.radius;
        if (!b.grazed && d2 < gr * gr) {
          b.grazed = true;
          cb.onGraze(b);
        }
      }
      live[w++] = b;
    }
    live.length = w;
    if (hit) cb.onHit(hit);

    // Score stars drift, then home into the ship
    const st = this.stars;
    let sw = 0;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      s.age += dt;
      if (s.age > 0.35 && ship.present) {
        const dx = ship.x - s.x, dy = ship.y - s.y, dz = ship.z - s.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const pull = 4 + s.age * 10;
        s.vx += (dx / l) * pull * dt; s.vy += (dy / l) * pull * dt; s.vz += (dz / l) * pull * dt;
        const k = Math.exp(-3 * dt);
        s.vx *= k; s.vy *= k; s.vz *= k;
        if (l < 0.035) { cb.onStar && cb.onStar(s); continue; }
      } else {
        const k = Math.exp(-2.5 * dt);
        s.vx *= k; s.vy *= k; s.vz *= k;
      }
      if (s.age > 6) continue;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      st[sw++] = s;
    }
    st.length = sw;
  }

  render(ship) {
    const s = this.sprites;
    const head = this.headPos;
    s.begin();
    const t = this.time;
    for (const b of this.live) {
      let size = b.size;
      let a = 1;
      if (b.spawnFx > 0) size *= 1 + b.spawnFx * 6;
      // Fade as bullets approach the eyes (comfort) - they are already harmless there.
      const hx = b.x - head.x, hy = b.y - head.y, hz = b.z - head.z;
      const hd = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (hd < 0.3) a = clamp((hd - 0.11) / 0.19, 0, 1);
      let [r, g, bb] = b.color;
      // Bullets close to the ship flare up so depth is easier to judge.
      const dx = b.x - ship.x, dy = b.y - ship.y, dz = b.z - ship.z;
      const sd2 = dx * dx + dy * dy + dz * dz;
      if (ship.active && sd2 < 0.012) {
        const k = 1 - sd2 / 0.012;
        r += (1 - r) * k * 0.5; g += (1 - g) * k * 0.5; bb += (1 - bb) * k * 0.5;
        size *= 1 + k * 0.25;
      }
      s.push(b.x, b.y, b.z, size, r, g, bb, a, SHAPE.ORB, 0, b.vx, b.vy, b.vz, b.stretch, 0);
    }
    for (const st of this.stars) {
      const tw = 0.75 + 0.25 * Math.sin(st.age * 30 + st.x * 50);
      s.push(st.x, st.y, st.z, 0.014 * tw, 1, 0.82, 0.25, 1, SHAPE.HEX, 0.3, 0, 0, 0, 0, t * 4 + st.x * 20);
    }
    s.end();
  }

  clear() {
    this.cancelAll(false);
    this.stars.length = 0;
  }
}

// ---------------------------------------------------------------- lasers

const beamVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uMode;   // 0 warn, 1 fire
uniform float uAlpha;
uniform float uLength;
varying vec2 vUv;
void main() {
  float x = abs(vUv.x * 2.0 - 1.0);
  float along = vUv.y * uLength;
  vec3 col;
  float a;
  if (uMode < 0.5) {
    float dash = step(0.5, fract(along * 14.0 - uTime * 6.0));
    float line = smoothstep(1.0, 0.0, x);
    col = mix(uColor, vec3(1.0), 0.3);
    a = line * (0.35 + 0.45 * dash) * (0.6 + 0.4 * sin(uTime * 40.0));
  } else {
    float core = smoothstep(0.42, 0.12, x);
    float body = smoothstep(0.85, 0.5, x);
    float rim = smoothstep(1.0, 0.85, x);
    float energy = 0.75 + 0.25 * sin(along * 40.0 - uTime * 30.0) * sin(along * 13.0 + uTime * 17.0);
    col = mix(vec3(0.05, 0.0, 0.03), uColor * (0.8 + 0.4 * energy), body);
    col = mix(col, vec3(1.0), core);
    a = rim;
  }
  a *= uAlpha;
  gl_FragColor = vec4(col * a, a * 0.9);
}
`;

export class Lasers {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
    this.meshPool = [];
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.translate(0, 0.5, 0);
    this.headPos = new THREE.Vector3();
    this.time = 0;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  _mesh() {
    let m = this.meshPool.pop();
    if (!m) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uMode: { value: 0 }, uAlpha: { value: 1 }, uLength: { value: 1 } },
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      m = new THREE.Mesh(this.geo, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      m.renderOrder = 13;
    }
    this.parent.add(m);
    return m;
  }

  /**
   * Fire a laser. driver(laser, dt) is called every frame to update laser.origin & laser.dir.
   * opts: warn, fire, width, length, color, onFire
   */
  add(driver, opts = {}) {
    const l = {
      origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), driver,
      warn: opts.warn ?? 0.8, fire: opts.fire ?? 1.5, fade: 0.25, width: opts.width ?? 0.03, length: opts.length ?? 4,
      color: new THREE.Color(...(opts.color || [1, 0.15, 0.35])), t: 0, state: 'warn', mesh: this._mesh(), owner: opts.owner || null,
      onFire: opts.onFire || null, grazeTimer: 0, dead: false,
    };
    l.mesh.material.uniforms.uColor.value.copy(l.color);
    driver(l, 0);
    this.items.push(l);
    return l;
  }

  update(dt, ship, cb) {
    this.time += dt;
    let w = 0;
    for (const l of this.items) {
      if (l.dead || (l.owner && l.owner.alive === false && l.state !== 'fade')) {
        if (l.state !== 'fade') { l.state = 'fade'; l.t = 0; }
      }
      l.t += dt;
      l.driver(l, dt);
      if (l.state === 'warn' && l.t >= l.warn) {
        l.state = 'fire';
        l.t = 0;
        l.onFire && l.onFire(l);
      } else if (l.state === 'fire' && l.t >= l.fire) {
        l.state = 'fade';
        l.t = 0;
      } else if (l.state === 'fade' && l.t >= l.fade) {
        this.parent.remove(l.mesh);
        this.meshPool.push(l.mesh);
        l.dead = true;
        continue;
      }
      // collision while firing (the fade is harmless)
      if (l.state === 'fire' && ship.active) {
        const ax = l.origin.x, ay = l.origin.y, az = l.origin.z;
        const bx = ax + l.dir.x * l.length, by = ay + l.dir.y * l.length, bz = az + l.dir.z * l.length;
        const d2 = distSqPointSegment(ship.x, ship.y, ship.z, ax, ay, az, bx, by, bz);
        const ramp = Math.min(1, l.t / 0.12);
        const hr = l.width * 0.42 * ramp + ship.radius;
        if (ship.vulnerable && d2 < hr * hr && ramp >= 1) cb.onHit(l);
        else {
          const gr = l.width * 0.5 + ship.grazeRadius;
          l.grazeTimer -= dt;
          if (d2 < gr * gr && l.grazeTimer <= 0) {
            l.grazeTimer = 0.12;
            cb.onGraze(l);
          }
        }
      }
      this.items[w++] = l;
    }
    this.items.length = w;
  }

  render() {
    const head = this.headPos;
    for (const l of this.items) {
      const m = l.mesh;
      const u = m.material.uniforms;
      u.uTime.value = this.time;
      let width = l.width;
      if (l.state === 'warn') {
        u.uMode.value = 0;
        width = 0.006;
        u.uAlpha.value = Math.min(1, l.t / 0.15);
      } else if (l.state === 'fire') {
        u.uMode.value = 1;
        const ramp = Math.min(1, l.t / 0.12);
        width = l.width * (0.3 + 0.7 * ramp) * (1 + 0.06 * Math.sin(this.time * 50));
        u.uAlpha.value = 1;
      } else {
        u.uMode.value = 1;
        width = l.width * (1 - l.t / l.fade);
        u.uAlpha.value = 1 - l.t / l.fade;
      }
      u.uLength.value = l.length;
      // Build a ribbon that faces the viewer.
      const a = this._a.copy(l.origin);
      const d = this._d.copy(l.dir).multiplyScalar(l.length);
      this._view.copy(a).addScaledVector(d, 0.3).sub(head);
      const side = this._side.crossVectors(d, this._view).normalize().multiplyScalar(width);
      const n = this._n.crossVectors(side, d).normalize();
      this._m.makeBasis(side, d, n);
      this._m.setPosition(a);
      m.matrix.copy(this._m);
      m.matrixWorldNeedsUpdate = true;
    }
  }

  clear() {
    for (const l of this.items) {
      this.parent.remove(l.mesh);
      this.meshPool.push(l.mesh);
    }
    this.items.length = 0;
  }

  get firing() {
    return this.items.some((l) => l.state === 'fire');
  }
}

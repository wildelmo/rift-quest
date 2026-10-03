import * as THREE from 'three';
import { Billboards, SHAPE } from '../engine/billboards.js';
import { clamp, rand } from '../engine/math.js';
import { buildPlayerShip, buildOption } from './models.js';
import { COLORS } from './fx.js';

// The player's ship. Its pose is the controller pose, one-to-one, every frame - no smoothing.

export const SHIP = {
  hitRadius: 0.0055,
  grazeRadius: 0.03,
  fireRate: 14,
  boltSpeed: 3.6,
  chargeTime: 1.1,
  maxOptions: 3,
  maxLevel: 4,
  optionSpacing: 12, // history samples (5 mm each) between options
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const aimVert = /* glsl */ `
varying float vT;
varying float vX;
void main() { vT = uv.y; vX = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const aimFrag = /* glsl */ `
uniform float uAlpha; uniform float uTime;
varying float vT; varying float vX;
void main() {
  float across = 1.0 - abs(vX * 2.0 - 1.0);
  float fade = pow(1.0 - vT, 2.2);
  float dash = 0.65 + 0.35 * step(0.5, fract(vT * 22.0 - uTime * 3.0));
  float a = across * fade * dash * uAlpha;
  vec3 col = vec3(0.35, 0.95, 1.0);
  gl_FragColor = vec4(col * a, a * 0.7);
}
`;

export class PlayerShots {
  constructor(parent) {
    this.sprites = new Billboards(900, { renderOrder: 15 });
    parent.add(this.sprites.mesh);
    this.live = [];
  }

  spawn(o) {
    if (this.live.length > 700) return null;
    const s = {
      x: o.x, y: o.y, z: o.z, px: o.x, py: o.y, pz: o.z,
      vx: o.vx, vy: o.vy, vz: o.vz, dmg: o.dmg ?? 1, radius: o.radius ?? 0.006, kind: o.kind || 'bolt',
      pierce: o.pierce || false, life: o.life ?? 1.4, age: 0, hits: o.pierce ? new Set() : null,
      size: o.size ?? 0.0065, color: o.color || COLORS.cyan, target: null, dead: false, charge: o.charge || 0,
    };
    this.live.push(s);
    return s;
  }

  update(dt, fx, findTarget) {
    let w = 0;
    for (const s of this.live) {
      s.age += dt;
      if (s.dead || s.age > s.life) continue;
      s.px = s.x; s.py = s.y; s.pz = s.z;
      if (s.kind === 'missile') {
        if (!s.target || !s.target.alive) s.target = findTarget(s);
        const sp = Math.hypot(s.vx, s.vy, s.vz);
        if (s.target && s.age > 0.08) {
          const tp = s.target.aimPoint ? s.target.aimPoint(_v2) : _v2.copy(s.target.pos);
          _v.set(tp.x - s.x, tp.y - s.y, tp.z - s.z).normalize().multiplyScalar(sp);
          const k = 1 - Math.exp(-7 * dt);
          s.vx += (_v.x - s.vx) * k; s.vy += (_v.y - s.vy) * k; s.vz += (_v.z - s.vz) * k;
        }
        const ns = Math.min(sp + 3 * dt, 2.6);
        const l = Math.hypot(s.vx, s.vy, s.vz) || 1;
        s.vx *= ns / l; s.vy *= ns / l; s.vz *= ns / l;
        if (Math.random() < 0.6) fx.spawn({ x: s.x, y: s.y, z: s.z, vx: rand(-0.02, 0.02), vy: 0.02, vz: rand(-0.02, 0.02), life: 0.35, size: 0.005, size1: 0.012, color: [0.9, 0.9, 1], shape: SHAPE.SMOKE, additive: 0, alpha: 0.35 });
      } else if (s.kind === 'wave' && Math.random() < 0.9) {
        fx.spawn({ x: s.x + rand(-1, 1) * s.radius, y: s.y + rand(-1, 1) * s.radius, z: s.z + rand(-1, 1) * s.radius, vx: s.vx * 0.05, vy: s.vy * 0.05, vz: s.vz * 0.05, life: 0.25, size: s.radius * 0.6, size1: 0.002, color: COLORS.white, color1: COLORS.cyan, shape: SHAPE.SPARK, additive: 0.7 });
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      this.live[w++] = s;
    }
    this.live.length = w;
  }

  render() {
    const b = this.sprites;
    b.begin();
    for (const s of this.live) {
      const [r, g, bl] = s.color;
      if (s.kind === 'wave') {
        const pulse = 1 + 0.12 * Math.sin(s.age * 50);
        b.push(s.x, s.y, s.z, s.radius * 3.2 * pulse, r, g, bl, 0.8, SHAPE.GLOW, 0.6);
        b.push(s.x, s.y, s.z, s.radius * 1.6, r, g, bl, 1, SHAPE.BOLT, 0.2, s.vx, s.vy, s.vz, 0.05);
      } else if (s.kind === 'missile') {
        b.push(s.x, s.y, s.z, 0.006, 1, 0.75, 0.3, 1, SHAPE.BOLT, 0.2, s.vx, s.vy, s.vz, 0.02);
      } else {
        b.push(s.x, s.y, s.z, s.size, r, g, bl, 1, SHAPE.BOLT, 0.15, s.vx, s.vy, s.vz, 0.03);
      }
    }
    b.end();
  }

  clear() {
    this.live.length = 0;
  }
}

export class Ship {
  constructor(parent, shots, fx, sfx) {
    this.parent = parent;
    this.shots = shots;
    this.fx = fx;
    this.sfx = sfx;
    this.group = new THREE.Group();
    this.model = buildPlayerShip();
    this.group.add(this.model);
    parent.add(this.group);

    // The hitbox core: always visible, so the player knows exactly what must not be touched.
    this.core = new THREE.Mesh(new THREE.SphereGeometry(SHIP.hitRadius * 0.85, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false }));
    this.core.renderOrder = 30;
    this.group.add(this.core);
    this.coreRing = new THREE.Mesh(new THREE.RingGeometry(SHIP.hitRadius * 1.1, SHIP.hitRadius * 1.6, 20), new THREE.MeshBasicMaterial({ color: 0xff2d6a, toneMapped: false, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    this.coreRing.renderOrder = 29;
    this.group.add(this.coreRing);

    // Shield bubble
    this.shieldMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.052, 1),
      new THREE.MeshBasicMaterial({ color: 0x55ddff, wireframe: true, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }),
    );
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);

    // Aim sight
    const aimGeo = new THREE.PlaneGeometry(0.0024, 1.4);
    aimGeo.translate(0, 0.7, 0);
    aimGeo.rotateX(-Math.PI / 2);
    this.aimMat = new THREE.ShaderMaterial({
      vertexShader: aimVert, fragmentShader: aimFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uAlpha: { value: 0.7 }, uTime: { value: 0 } },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.aim = new THREE.Group();
    const a1 = new THREE.Mesh(aimGeo, this.aimMat);
    const a2 = new THREE.Mesh(aimGeo, this.aimMat);
    a2.rotation.z = Math.PI / 2;
    this.aim.add(a1, a2);
    this.aim.position.set(0, 0, -0.045);
    this.group.add(this.aim);

    this.options = [];
    this.optionModels = [];
    for (let i = 0; i < SHIP.maxOptions; i++) {
      const m = buildOption();
      m.visible = false;
      parent.add(m);
      this.optionModels.push(m);
    }
    this.history = [];

    this.pos = this.group.position;
    this.quat = this.group.quaternion;
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.reset();
  }

  reset() {
    this.level = 1;
    this.optionCount = 0;
    this.shield = false;
    this.bombs = 3;
    this.lives = 3;
    this.invuln = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.charge = 0;
    this.charging = false;
    this.triggerHeld = 0;
    this.fireTimer = 0;
    this.missileTimer = 0;
    this.held = false;
    this.history.length = 0;
    this.time = 0;
    if (this.chargeSound) { this.chargeSound.stop(); this.chargeSound = null; }
  }

  get vulnerable() {
    return !this.dead && this.invuln <= 0;
  }

  get active() {
    return !this.dead && this.held;
  }

  /** Copy a pose into the ship (arena-local). Called every frame while held. */
  setPose(pos, quat) {
    this.pos.copy(pos);
    this.quat.copy(quat);
  }

  _recordHistory() {
    const h = this.history;
    const step = 0.005;
    if (!h.length) { h.push(this.pos.clone()); return; }
    let last = h[h.length - 1];
    let d = last.distanceTo(this.pos);
    let guard = 0;
    while (d >= step && guard++ < 80) {
      const p = last.clone().lerp(this.pos, step / d);
      h.push(p);
      last = p;
      d = last.distanceTo(this.pos);
    }
    if (h.length > 200) h.splice(0, h.length - 200);
  }

  optionPos(i, out) {
    const h = this.history;
    const idx = h.length - 1 - (i + 1) * SHIP.optionSpacing;
    if (idx >= 0) return out.copy(h[idx]);
    if (h.length) return out.copy(h[0]);
    return out.copy(this.pos);
  }

  /**
   * dt: game dt. input: { trigger (bool) }. ctx: { firing (bool), aimAssist(origin, dir) -> dir, onWaveFire }
   */
  update(dt, input, ctx) {
    this.time += dt;
    if (dt > 0) {
      this.vel.subVectors(this.pos, this.prev).divideScalar(dt);
      this.prev.copy(this.pos);
    }
    this.forward.set(0, 0, -1).applyQuaternion(this.quat);
    if (this.invuln > 0) this.invuln -= dt;

    if (this.dead) {
      this.deadTimer -= dt;
      this.group.visible = false;
      for (const m of this.optionModels) m.visible = false;
      return;
    }
    this.group.visible = !(this.invuln > 0 && Math.floor(this.time * 18) % 2 === 0);
    this._recordHistory();

    // ----- charge shot (R-Type style): hold trigger to charge, release to fire
    const firing = ctx.firing && this.held;
    if (input.trigger && firing) {
      this.triggerHeld += dt;
      if (this.triggerHeld > 0.12) {
        if (!this.charging) {
          this.charging = true;
          this.chargeSound = this.sfx.chargeTone();
        }
        this.charge = Math.min(1, this.charge + dt / SHIP.chargeTime);
        this.chargeSound && this.chargeSound.set(this.charge);
        const nose = this.nosePoint(_v);
        if (Math.random() < 0.4 + this.charge) this.fx.inward(nose, 0.02 + this.charge * 0.035, COLORS.cyan);
        const full = this.charge >= 1;
        const flick = full ? 0.85 + 0.15 * Math.sin(this.time * 70) : 1;
        this.fx.spawn({ x: nose.x, y: nose.y, z: nose.z, life: 0.03, size: (0.008 + 0.03 * this.charge) * flick, color: full ? COLORS.white : COLORS.cyan, shape: SHAPE.GLOW, additive: 0.55, alpha: 0.95 });
        this.fx.spawn({ x: nose.x, y: nose.y, z: nose.z, life: 0.03, size: 0.004 + 0.012 * this.charge, color: COLORS.white, shape: SHAPE.BOLT, additive: 0.2 });
        ctx.haptic && ctx.haptic(0.05 + this.charge * 0.25, 20);
      }
    } else {
      if (this.charging) {
        if (this.charge > 0.28) this._fireWave(ctx);
        this.charging = false;
        this.charge = 0;
        if (this.chargeSound) { this.chargeSound.stop(); this.chargeSound = null; }
      }
      this.triggerHeld = 0;
    }

    // ----- auto-fire
    if (firing && !this.charging) {
      this.fireTimer -= dt;
      while (this.fireTimer <= 0) {
        this.fireTimer += 1 / SHIP.fireRate;
        this._volley(ctx);
      }
      if (this.level >= 3) {
        this.missileTimer -= dt;
        if (this.missileTimer <= 0) {
          this.missileTimer = 0.42;
          this._missiles();
        }
      }
    } else this.fireTimer = Math.max(this.fireTimer, 0);

    // ----- options follow the ship's path (Gradius multiples)
    for (let i = 0; i < SHIP.maxOptions; i++) {
      const m = this.optionModels[i];
      m.visible = i < this.optionCount;
      if (!m.visible) continue;
      this.optionPos(i, m.position);
      m.rotation.x += dt * 3;
      m.rotation.y += dt * 4.4;
    }

    // ----- visuals
    if (ctx.headWorld) {
      this.group.updateMatrixWorld();
      this.coreRing.lookAt(ctx.headWorld);
    }
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 9);
    this.coreRing.scale.setScalar(pulse);
    this.shieldMesh.visible = this.shield;
    if (this.shield) {
      this.shieldMesh.rotation.y += dt * 0.8;
      this.shieldMesh.material.opacity = 0.32 + 0.12 * Math.sin(this.time * 6);
    }
    this.aimMat.uniforms.uTime.value = this.time;
    this.aimMat.uniforms.uAlpha.value = this.held ? 0.75 : 0.0;
    this._engineFx(dt);
  }

  nosePoint(out) {
    return out.set(0, 0, -0.05).applyQuaternion(this.quat).add(this.pos);
  }

  _engineFx(dt) {
    if (!this.group.visible) return;
    const speed = this.vel.length();
    const fx = this.fx;
    for (const sx of [-1, 1]) {
      _v.set(0.0105 * sx, -0.0012, 0.034).applyQuaternion(this.quat).add(this.pos);
      _v2.set(0, 0, 1).applyQuaternion(this.quat);
      const len = 0.25 + Math.min(speed, 1.5) * 0.4;
      fx.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _v2.x * len, vy: _v2.y * len, vz: _v2.z * len, life: 0.06, size: 0.006, size1: 0.002, color: COLORS.white, color1: COLORS.cyan, shape: SHAPE.SPARK, additive: 0.8, stretch: 0.05 });
    }
    if (speed > 0.6 && Math.random() < 0.5) {
      fx.spawn({ x: this.pos.x, y: this.pos.y, z: this.pos.z, life: 0.3, size: 0.004, size1: 0.001, color: COLORS.cyan, shape: SHAPE.GLOW, additive: 0.8 });
    }
  }

  _bolt(localX, localY, localZ, dir, dmg, size = 0.0065, color = COLORS.cyan) {
    _v.set(localX, localY, localZ).applyQuaternion(this.quat).add(this.pos);
    const sp = SHIP.boltSpeed;
    this.shots.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp, dmg, size, color });
  }

  _volley(ctx) {
    const fwd = this.forward;
    const dir = ctx.aimAssist ? ctx.aimAssist(this.pos, fwd) : fwd;
    const L = this.level;
    const dmg = L >= 4 ? 1.35 : 1;
    const size = L >= 4 ? 0.0085 : 0.0065;
    this._bolt(0.034, -0.0012, -0.014, dir, dmg, size);
    this._bolt(-0.034, -0.0012, -0.014, dir, dmg, size);
    if (L >= 2) {
      const up = _v2.set(0, 1, 0).applyQuaternion(this.quat);
      const angles = L >= 4 ? [0.12, -0.12, 0.24, -0.24] : [0.12, -0.12];
      for (const a of angles) {
        const d = dir.clone().applyAxisAngle(up, a);
        this._bolt(0, 0, -0.04, d, 0.7, 0.0055, COLORS.blue);
      }
    }
    for (let i = 0; i < this.optionCount; i++) {
      const p = this.optionPos(i, _v);
      const od = ctx.aimAssist ? ctx.aimAssist(p, fwd) : fwd;
      this.shots.spawn({ x: p.x, y: p.y, z: p.z, vx: od.x * SHIP.boltSpeed, vy: od.y * SHIP.boltSpeed, vz: od.z * SHIP.boltSpeed, dmg: 0.75, size: 0.006, color: COLORS.amber });
    }
    if (Math.random() < 0.5) this.sfx.play('shot', null, { vol: 0.35, minGap: 0.06 });
  }

  _missiles() {
    for (const sx of [-1, 1]) {
      _v.set(0.02 * sx, -0.004, 0).applyQuaternion(this.quat).add(this.pos);
      _v2.set(sx * 0.6, 0.3, -1).normalize().applyQuaternion(this.quat).multiplyScalar(0.9);
      this.shots.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _v2.x, vy: _v2.y, vz: _v2.z, dmg: 2.2, kind: 'missile', life: 2.2, radius: 0.008 });
    }
  }

  _fireWave(ctx) {
    const c = this.charge;
    const nose = this.nosePoint(_v);
    const dir = ctx.aimAssist ? ctx.aimAssist(this.pos, this.forward) : this.forward;
    const sp = 3.0;
    const radius = 0.014 + 0.03 * c;
    this.shots.spawn({
      x: nose.x, y: nose.y, z: nose.z, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
      dmg: 6 + 44 * Math.pow(c, 1.6), radius, kind: 'wave', pierce: true, life: 2, charge: c,
    });
    this.fx.flash(nose, 0.05 + 0.08 * c, COLORS.cyan, 0.15);
    this.fx.ring(nose, 0.08 + 0.12 * c, COLORS.cyan, 0.3);
    this.sfx.play('wave', null, { vol: 0.5 + c * 0.6, rate: 1.3 - c * 0.35 });
    ctx.haptic && ctx.haptic(0.4 + 0.6 * c, 80 + 120 * c);
    ctx.onWaveFire && ctx.onWaveFire(c);
  }

  /** Power-ups */
  addLevel() {
    if (this.level < SHIP.maxLevel) { this.level++; return true; }
    return false;
  }

  addOption() {
    if (this.optionCount < SHIP.maxOptions) {
      this.optionCount++;
      return true;
    }
    return false;
  }

  kill() {
    this.dead = true;
    this.deadTimer = 1.6;
    this.level = Math.max(1, this.level - 1);
    this.optionCount = Math.max(0, this.optionCount - 1);
    this.shield = false;
    this.charging = false;
    this.charge = 0;
    if (this.chargeSound) { this.chargeSound.stop(); this.chargeSound = null; }
  }

  respawn() {
    this.dead = false;
    this.invuln = 2.6;
    this.bombs = Math.max(this.bombs, 2);
    this.history.length = 0;
  }

  setVisible(v) {
    this.group.visible = v;
    if (!v) for (const m of this.optionModels) m.visible = false;
  }

  get chargeLevel() {
    return clamp(this.charge, 0, 1);
  }
}

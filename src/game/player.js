import * as THREE from 'three';
import { Billboards, SHAPE } from '../engine/billboards.js';
import { clamp, rand } from '../engine/math.js';
import { buildPlayerShip, buildOption, SHIP_TURBINES } from './models.js';
import { COLORS } from './fx.js';

// The player's ship. Its pose is the controller pose, one-to-one, every frame - no smoothing.

export const SHIP = {
  hitRadius: 0.0055,
  grazeRadius: 0.03,
  fireRate: 16,
  boltSpeed: 5.2,
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

const trailVert = /* glsl */ `
attribute float aAge;
attribute float aSide;
varying float vAge;
varying float vSide;
void main() { vAge = aAge; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const trailFrag = /* glsl */ `
uniform vec3 uColor;
varying float vAge;
varying float vSide;
void main() {
  float across = 1.0 - abs(vSide);
  float a = pow(1.0 - vAge, 1.6) * smoothstep(0.0, 0.6, across);
  vec3 col = mix(uColor, vec3(1.0), pow(across, 6.0) * (1.0 - vAge));
  gl_FragColor = vec4(col * a, a * 0.35);
}
`;

/** Camera-facing ribbon that streams behind a turbine and shows the path your hand took. */
export class Trail {
  constructor(parent, { length = 0.32, width = 0.016, color = [0.3, 0.9, 1], max = 48 } = {}) {
    this.length = length;
    this.width = width;
    this.max = max;
    this.pts = [];
    const n = max * 2;
    this.positions = new Float32Array(n * 3);
    this.ages = new Float32Array(n);
    const sides = new Float32Array(n);
    for (let i = 0; i < max; i++) { sides[i * 2] = -1; sides[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: trailVert, fragmentShader: trailFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(...color) } },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    parent.add(this.mesh);
    this.view = new THREE.Vector3(0, 0.3, 0.45);
    this._t = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  push(p, time, emitting) {
    const pts = this.pts;
    if (emitting) {
      const last = pts[pts.length - 1];
      if (!last || last.p.distanceToSquared(p) > 0.000004 || time - last.t > 0.02) pts.push({ p: p.clone(), t: time });
      else { last.p.copy(p); last.t = time; }
    }
    while (pts.length && (time - pts[0].t > this.length || pts.length > this.max)) pts.shift();
    this.time = time;
  }

  render() {
    const pts = this.pts;
    const n = pts.length;
    if (n < 2) { this.geometry.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(n - 1, i + 1)].p;
      this._t.subVectors(b, a);
      const p = pts[i].p;
      this._d.subVectors(p, this.view);
      this._s.crossVectors(this._t, this._d).normalize();
      const age = Math.min(1, (this.time - pts[i].t) / this.length);
      const w = this.width * (1 - age * 0.7);
      for (const k of [0, 1]) {
        const j = (i * 2 + k) * 3;
        const sg = k ? 1 : -1;
        this.positions[j] = p.x + this._s.x * w * sg;
        this.positions[j + 1] = p.y + this._s.y * w * sg;
        this.positions[j + 2] = p.z + this._s.z * w * sg;
        this.ages[i * 2 + k] = age;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAge.needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * 6);
  }

  clear() {
    this.pts.length = 0;
  }
}

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
        b.push(s.x, s.y, s.z, s.size * 2.6, r, g, bl, 0.45, SHAPE.GLOW, 0.85, s.vx, s.vy, s.vz, 0.05);
        b.push(s.x, s.y, s.z, s.size, r, g, bl, 1, SHAPE.BOLT, 0.3, s.vx, s.vy, s.vz, 0.06);
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
    this.shieldMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
          // hex-ish cell lines from a 3-axis triangle grid on the sphere
          vec3 q = normalize(vP) * 9.0;
          float g = min(min(abs(fract(q.x + q.y * 0.5) - 0.5), abs(fract(q.y - q.z * 0.5) - 0.5)), abs(fract(q.z + q.x * 0.5) - 0.5));
          float cells = smoothstep(0.06, 0.0, g);
          float sweep = 0.5 + 0.5 * sin(vP.y * 60.0 - uTime * 5.0);
          float a = (fres * 0.85 + cells * (0.15 + 0.25 * sweep) * (0.3 + fres)) * uAlpha;
          vec3 col = mix(vec3(0.2, 0.8, 1.0), vec3(0.9, 1.0, 1.0), fres);
          gl_FragColor = vec4(col * a, a * 0.35);
        }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 20), this.shieldMat);
    this.shieldMesh.renderOrder = 16;
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
    this.aim.position.set(0, -0.004, -0.062);
    this.group.add(this.aim);

    this.trails = SHIP_TURBINES.map(() => new Trail(parent));
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
    this.fireTimer = 0;
    this.missileTimer = 0;
    this.held = false;
    this.history.length = 0;
    this.time = 0;
    if (this.trails) for (const t of this.trails) t.clear();
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
      this._engineFx(dt);
      this._renderTrails(ctx);
      return;
    }
    this.group.visible = !(this.invuln > 0 && Math.floor(this.time * 18) % 2 === 0);
    this._recordHistory();

    // ----- hold the trigger to fire a continuous stream
    const firing = ctx.firing && this.held && input.trigger;
    this.firingNow = firing;
    if (firing) {
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
    } else {
      // the first shot of a new burst leaves immediately
      this.fireTimer = 0;
    }

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
      this.shieldMesh.rotation.y += dt * 0.6;
      this.shieldMat.uniforms.uTime.value = this.time;
      this.shieldMat.uniforms.uAlpha.value = 0.8 + 0.2 * Math.sin(this.time * 6);
    }
    this.aimMat.uniforms.uTime.value = this.time;
    this.aimMat.uniforms.uAlpha.value = this.held ? 0.75 : 0.0;
    this._engineFx(dt);
    this._renderTrails(ctx);
  }

  _renderTrails(ctx) {
    for (const t of this.trails) {
      if (ctx.headLocal) t.view.copy(ctx.headLocal);
      t.render();
    }
  }

  nosePoint(out) {
    return out.set(0, -0.004, -0.068).applyQuaternion(this.quat).add(this.pos);
  }

  _engineFx(dt) {
    const visible = this.group.visible;
    const speed = this.vel.length();
    SHIP_TURBINES.forEach(([x, y, z], i) => {
      _v.set(x, y, z + 0.006).applyQuaternion(this.quat).add(this.pos);
      this.trails[i].push(_v, this.time, visible);
      if (!visible) return;
      _v2.set(0, 0, 1).applyQuaternion(this.quat);
      const len = 0.3 + Math.min(speed, 1.5) * 0.3;
      this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _v2.x * len, vy: _v2.y * len, vz: _v2.z * len, life: 0.07, size: 0.018, size1: 0.006, color: COLORS.white, color1: COLORS.cyan, shape: SHAPE.GLOW, additive: 0.85 });
    });
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
    const size = L >= 4 ? 0.012 : 0.009;
    this._bolt(0.011, -0.007, -0.058, dir, dmg, size);
    this._bolt(-0.011, -0.007, -0.058, dir, dmg, size);
    if (L >= 2) {
      const up = _v2.set(0, 1, 0).applyQuaternion(this.quat);
      const angles = L >= 4 ? [0.12, -0.12, 0.24, -0.24] : [0.12, -0.12];
      for (const a of angles) {
        const d = dir.clone().applyAxisAngle(up, a);
        this._bolt(0, -0.004, -0.06, d, 0.7, 0.007, COLORS.blue);
      }
    }
    for (let i = 0; i < this.optionCount; i++) {
      const p = this.optionPos(i, _v);
      const od = ctx.aimAssist ? ctx.aimAssist(p, fwd) : fwd;
      this.shots.spawn({ x: p.x, y: p.y, z: p.z, vx: od.x * SHIP.boltSpeed, vy: od.y * SHIP.boltSpeed, vz: od.z * SHIP.boltSpeed, dmg: 0.75, size: 0.006, color: COLORS.amber });
    }
    // muzzle flashes at both cannons + a light recoil tick in the hand
    for (const sx of [-1, 1]) {
      _v.set(0.011 * sx, -0.007, -0.062).applyQuaternion(this.quat).add(this.pos);
      this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, life: 0.05, size: 0.022, size1: 0.008, color: COLORS.white, color1: COLORS.cyan, shape: SHAPE.STAR, additive: 0.85, rot: Math.random() * 3 });
    }
    this.volleys = (this.volleys || 0) + 1;
    this.sfx.play('shot', null, { vol: 0.32, minGap: 0.055 });
    if (this.volleys % 2 === 0) ctx.haptic && ctx.haptic(0.12, 12);
  }

  _missiles() {
    for (const sx of [-1, 1]) {
      _v.set(0.02 * sx, -0.004, 0).applyQuaternion(this.quat).add(this.pos);
      _v2.set(sx * 0.6, 0.3, -1).normalize().applyQuaternion(this.quat).multiplyScalar(0.9);
      this.shots.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: _v2.x, vy: _v2.y, vz: _v2.z, dmg: 2.2, kind: 'missile', life: 2.2, radius: 0.008 });
    }
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

}

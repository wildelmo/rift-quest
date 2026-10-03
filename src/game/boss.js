import * as THREE from 'three';
import { clamp, easeInOutCubic, easeOutBack, inAperture, rand, segmentSphere, torusDistance, TAU } from '../engine/math.js';
import { gyreCore, gyreEmitter, gyreFins, gyrePod, gyreRing, gyreShell, PALETTE, flareTexture } from './models.js';
import { cone, dirTo, fan, normalize, shell } from './patterns.js';
import { COLORS } from './fx.js';

// THE GYRE - a living gyroscope that tears through the wall.
//   Phase I   "Crown"   : four turret pods ride the tilted outer ring.
//   Phase II  "Lattice" : two prism emitters on the middle ring sweep lasers through the play space.
//   Phase III "Heart"   : the shell opens a single aperture. The core can only be hit by flying
//                         into the aperture's line of sight - the eye of a hollow cone of fire.

export const BOSS_HP = { pod: 170, emitter: 300, core: 1100 };
export const APERTURE_HIT_ANGLE = 0.25;
export const EYE_CONE = 0.16;
export const RINGS = { inner: 0.31, mid: 0.48, outer: 0.68, shell: 0.2 };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

class Part {
  constructor(boss, object, { hp, radius, name, score, kind }) {
    this.boss = boss;
    this.object = object;
    this.hp = hp;
    this.maxHp = hp;
    this.radius = radius;
    this.name = name;
    this.score = score;
    this.kind = kind;
    this.alive = true;
    this.vulnerable = false;
    this.pos = new THREE.Vector3();
    this.flash = 0;
    this.explodeScale = 3;
    this.contact = false;
    this.hull = object.userData.hull || null;
  }

  sync() {
    this.object.getWorldPosition(this.pos);
    this.boss.game.arena.worldToLocal(this.pos);
  }

  aimPoint(out) {
    return out.copy(this.pos);
  }

  testShot(s) {
    if (!this.vulnerable) return null;
    if (this.kind === 'core' && !s.throughAperture) return null;
    return segmentSphere(s.px, s.py, s.pz, s.x, s.y, s.z, this.pos.x, this.pos.y, this.pos.z, this.radius + s.radius) >= 0 ? 'hit' : null;
  }

  damage(dmg, point) {
    if (!this.alive || !this.vulnerable) return;
    this.hp -= dmg;
    this.flash = 0.05;
    this.boss.game.onEnemyDamaged(this, dmg, point);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.vulnerable = false;
      this.boss.onPartDestroyed(this);
    }
  }

  kill() {
    this.damage(this.hp + 1, this.pos);
  }
}

const eyeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const eyeFrag = /* glsl */ `
uniform float uTime; uniform float uAlpha;
varying vec2 vUv;
void main() {
  float along = vUv.y;
  float streak = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 2.0) * sin(along * 30.0 - uTime * 6.0);
  float a = smoothstep(0.0, 0.08, along) * (1.0 - along) * 0.16 * streak * uAlpha;
  vec3 col = vec3(1.0, 0.45, 0.75);
  gl_FragColor = vec4(col * a, a * 0.4);
}
`;

export class Gyre {
  constructor(game) {
    this.game = game;
    this.alive = true;
    this.root = new THREE.Group();
    this.root.visible = false;
    game.arena.add(this.root);
    this.station = new THREE.Vector3(0, 0.1, -1.25);
    this.t = 0;
    this.phase = 'dormant';
    this.owner = { alive: true };
    this.defeated = false;

    // ----- build
    this.body = gyreFins();
    this.root.add(this.body);
    this.core = gyreCore();
    this.root.add(this.core);
    this.coreLight = new THREE.PointLight(0x7aeaff, 0, 2.2, 1.4);
    this.root.add(this.coreLight);
    // blinding core flare (occluded by the shell until the aperture opens)
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTexture(), color: 0xc8fbff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.flare.scale.setScalar(0.5);
    this.flare.renderOrder = 8;
    this.root.add(this.flare);
    // electric arcs crackling out of the open aperture
    this.arcSegs = 7;
    this.arcCount = 6;
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.arcCount * this.arcSegs * 2 * 3), 3));
    this.arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ color: 0x9ef4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcs.frustumCulled = false;
    this.arcs.visible = false;
    this.root.add(this.arcs);

    this.shellPivot = new THREE.Group();
    const { shell: shellMesh, cap } = gyreShell(RINGS.shell, 0.42);
    this.shellMesh = shellMesh;
    this.cap = cap;
    this.shellPivot.add(shellMesh, cap);
    this.root.add(this.shellPivot);
    this.shellRadius = RINGS.shell + 0.015;

    this.inner = new THREE.Group();
    this.innerRing = gyreRing(RINGS.inner, 0.019, 10, PALETTE.bossGold, 0xff2244, 6);
    this.inner.add(this.innerRing);
    this.root.add(this.inner);

    this.mid = new THREE.Group();
    this.midRing = gyreRing(RINGS.mid, 0.021, 14, PALETTE.bossMetal, 0xff2244, 0);
    this.mid.add(this.midRing);
    this.root.add(this.mid);

    this.outerTilt = new THREE.Group();
    this.outerTilt.rotation.x = -0.42;
    this.outer = new THREE.Group();
    this.outerRing = gyreRing(RINGS.outer, 0.025, 16, PALETTE.bossMetal, 0x55e6ff, 12);
    this.outer.add(this.outerRing);
    this.outerTilt.add(this.outer);
    this.root.add(this.outerTilt);

    // weak points
    this.pods = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const mount = new THREE.Group();
      mount.position.set(Math.cos(a) * RINGS.outer, Math.sin(a) * RINGS.outer, 0.04);
      const pod = gyrePod();
      mount.add(pod);
      this.outer.add(mount);
      const part = new Part(this, mount, { hp: BOSS_HP.pod, radius: 0.058, name: 'pod', score: 8000, kind: 'pod' });
      part.model = pod;
      part.fireOffset = i * 0.65;
      this.pods.push(part);
    }
    this.emitters = [];
    for (const sx of [-1, 1]) {
      const mount = new THREE.Group();
      mount.position.set(sx * RINGS.mid, 0, 0);
      const em = gyreEmitter();
      mount.add(em);
      this.mid.add(mount);
      const part = new Part(this, mount, { hp: BOSS_HP.emitter, radius: 0.06, name: 'emitter', score: 15000, kind: 'emitter' });
      part.model = em;
      part.side = sx;
      this.emitters.push(part);
    }
    this.corePart = new Part(this, this.core, { hp: BOSS_HP.core, radius: 0.12, name: 'core', score: 50000, kind: 'core' });
    this.parts = [...this.pods, ...this.emitters, this.corePart];

    // the "eye": translucent cone showing where the aperture looks in phase III
    const coneGeo = new THREE.CylinderGeometry(1, 0.02, 1, 28, 1, true);
    coneGeo.translate(0, 0.5, 0);
    coneGeo.rotateX(Math.PI / 2); // along +Z
    this.eyeMat = new THREE.ShaderMaterial({
      vertexShader: eyeVert, fragmentShader: eyeFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.eye = new THREE.Mesh(coneGeo, this.eyeMat);
    this.eye.renderOrder = 11;
    this.eye.visible = false;
    game.arena.add(this.eye);
    this.eyeTarget = new THREE.Vector3(0, 0, 0);
    this.eyeDir = new THREE.Vector3(0, 0, 1);

    // ring spin state
    this.spin = { inner: 0.8, outer: 0.35, midSwing: 0, midSpeed: 0.5 };
    this.unfold = 0;
    this.shake = 0;
    this.rage = false;
    this.final = false;
    this.ringMats = new Map();
  }

  get rigs() {
    return [this.innerRing, this.midRing, this.outerRing];
  }

  /** Targetable parts right now. */
  targets() {
    return this.parts.filter((p) => p.alive && p.vulnerable);
  }

  /** Health fraction of the current phase (for the HUD bar) and overall progress. */
  get barValue() {
    if (this.phase === 'crown') return this.pods.reduce((a, p) => a + p.hp, 0) / (BOSS_HP.pod * 4);
    if (this.phase === 'lattice') return this.emitters.reduce((a, p) => a + p.hp, 0) / (BOSS_HP.emitter * 2);
    if (this.phase === 'heart') return this.corePart.hp / BOSS_HP.core;
    return this.phase === 'intro' ? this.unfold : 0;
  }

  get phaseIndex() {
    return { crown: 0, lattice: 1, heart: 2 }[this.phase] ?? (this.phase === 'dying' ? 3 : 0);
  }

  _newOwner() {
    this.owner.alive = false;
    this.owner = { alive: true };
    return this.owner;
  }

  run(gen) {
    return this.game.scheduler.start(gen, this.owner);
  }

  // ------------------------------------------------------------------ lifecycle

  begin() {
    const g = this.game;
    const rift = g.room.rifts.boss;
    const dist = rift.position.length();
    const sd = clamp(dist - 0.45, 0.95, 1.25);
    this.station.set(0, 0.1, 0).addScaledVector(_v.copy(rift.position).setY(0).normalize(), sd);
    this.station.y = 0.1;
    this.root.position.copy(rift.position).addScaledVector(rift.normal, -0.4);
    this.root.visible = true;
    this.unfold = 0;
    this.phase = 'intro';
    this._newOwner();
    this.run(this._intro());
  }

  *_intro() {
    const g = this.game;
    const from = this.root.position.clone();
    const dur = 5.5;
    let t = 0;
    g.sfx.play('thrum', g.worldPos(this.root.position), { vol: 1.2, reverb: 0.5 });
    while (t < dur) {
      const dt = g.dt;
      t += dt;
      const k = easeInOutCubic(clamp(t / dur, 0, 1));
      this.root.position.lerpVectors(from, this.station, k);
      this.unfold = clamp((t - 1.0) / (dur - 1.2), 0, 1);
      if (Math.random() < 0.25) g.haptic(0.12 + 0.2 * (1 - k), 30, 'both');
      if (Math.random() < 0.3) g.fx.sparks(g.room.rifts.boss.mouth(_v, 0.02).add(_v2.set(rand(-0.6, 0.6), rand(-0.6, 0.6), 0)), 2, COLORS.orange, 0.6);
      yield;
    }
    this.unfold = 1;
    g.sfx.play('armorBreak', g.worldPos(this.root.position), { vol: 0.8, reverb: 0.6 });
    g.haptic(0.6, 200, 'both');
    yield 0.6;
    g.onBossReady();
    this._startCrown();
  }

  _startCrown() {
    this.phase = 'crown';
    this._newOwner();
    for (const p of this.pods) p.vulnerable = true;
    this.run(this._crownPods());
    this.run(this._crownCore());
  }

  *_crownPods() {
    const g = this.game;
    let k = 0;
    while (true) {
      for (const p of this.pods) {
        if (!p.alive) continue;
        const alive = this.pods.filter((q) => q.alive).length;
        const angry = alive <= 2;
        const muzzle = _v3.copy(p.pos);
        const d = dirTo(muzzle, g.ship.pos);
        if ((k + this.pods.indexOf(p)) % 2 === 0) {
          // aimed stream
          g.scheduler.start((function* () {
            for (let i = 0; i < (angry ? 6 : 4); i++) {
              if (!p.alive) return;
              const dd = dirTo(p.pos, g.ship.pos);
              g.bullets.spawn(p.pos.x, p.pos.y, p.pos.z, dd.x * 0.5, dd.y * 0.5, dd.z * 0.5, 'amber');
              yield 0.1;
            }
          })(), this.owner);
          g.sfx.play('enemyShot', g.worldPos(p.pos), { vol: 0.6 });
        } else {
          for (const f of fan(d, angry ? 7 : 5, angry ? 0.9 : 0.7, (k % 3) * 0.6)) g.bullets.spawn(muzzle.x, muzzle.y, muzzle.z, f.x * 0.36, f.y * 0.36, f.z * 0.36, 'rice');
          g.sfx.play('enemyShotBig', g.worldPos(p.pos), { vol: 0.6 });
        }
        p.model.scale.setScalar(1.25);
        yield angry ? 0.45 : 0.7;
      }
      k++;
      yield 0.4;
    }
  }

  *_crownCore() {
    const g = this.game;
    yield 2.5;
    let phase = 0;
    while (true) {
      // A 4-arm spiral bloom from the sealed shell's vent: a twisting tunnel of fire.
      const dur = 2.6;
      for (let t = 0; t < dur; t += 0.12) {
        const aim = dirTo(this.root.position, g.ship.pos);
        const origin = _v.copy(aim).multiplyScalar(this.shellRadius + 0.02).add(this.root.position);
        for (const d of cone(aim, 4, 0.42, phase)) g.bullets.spawn(origin.x, origin.y, origin.z, d.x * 0.34, d.y * 0.34, d.z * 0.34, 'small');
        phase += 0.28;
        yield 0.12;
      }
      yield 0.8;
      // a volley of huge slow energy balls that drift out through the whole room
      const aim = dirTo(this.root.position, g.ship.pos);
      for (const d of fan(aim, 5, 1.1, rand(-0.4, 0.4))) {
        const o = _v.copy(d).multiplyScalar(this.shellRadius + 0.03).add(this.root.position);
        g.bullets.spawn(o.x, o.y, o.z, d.x * 0.22, d.y * 0.22, d.z * 0.22, 'huge');
      }
      g.sfx.play('enemyShotBig', g.worldPos(this.root.position), { vol: 1, rate: 0.7 });
      yield 2.8;
    }
  }

  _startLattice() {
    const g = this.game;
    this.phase = 'lattice';
    this._newOwner();
    this.run((function* (boss) {
      g.onBossPhase(1);
      yield 2.4;
      for (const p of boss.emitters) p.vulnerable = true;
      boss.run(boss._latticeLasers());
      boss.run(boss._latticeBursts());
    })(this));
  }

  _emitterBeam(em, targetFn, { warn = 0.9, fire = 2.0, width = 0.034 } = {}) {
    const g = this.game;
    let hum = null;
    const target = new THREE.Vector3();
    g.sfx.play('laserCharge', g.worldPos(em.pos), { vol: 0.9 });
    return g.lasers.add((l, dt) => {
      const p = l.state === 'warn' ? 0 : l.state === 'fire' ? clamp(l.t / fire, 0, 1) : 1;
      targetFn(p, target);
      l.origin.copy(em.pos);
      l.dir.copy(target).sub(l.origin).normalize();
      l.origin.addScaledVector(l.dir, 0.05);
      if (hum) hum.setPos(g.worldPos(l.origin));
      if (l.state === 'fade' && hum) { hum.stop(); hum = null; }
    }, {
      warn, fire, width, length: 3.4, owner: em, color: [1, 0.12, 0.3],
      onFire: () => { hum = g.sfx.loop('laserHum', g.worldPos(em.pos), 0.6); g.haptic(0.35, 60, 'both'); },
    });
  }

  *_latticeLasers() {
    const g = this.game;
    let k = 0;
    while (true) {
      const alive = this.emitters.filter((e) => e.alive);
      if (!alive.length) return;
      const pattern = k % 3;
      const ship = g.ship.pos;
      if (pattern === 0) {
        // Crosshatch: one sweep horizontal at your height, one vertical at your x.
        const hy = clamp(ship.y, -0.25, 0.3), vx = clamp(ship.x, -0.35, 0.35);
        const [a, b] = alive.length > 1 ? alive : [alive[0], alive[0]];
        this._emitterBeam(a, (p, out) => out.set(-0.55 + 1.1 * easeInOutCubic(p), hy, 0.1));
        if (alive.length > 1) this._emitterBeam(b, (p, out) => out.set(vx, 0.38 - 0.76 * easeInOutCubic(p), 0.1), { warn: 1.1 });
        yield 3.4;
      } else if (pattern === 1) {
        // Closing spiral: beams trace a shrinking circle around the play space. Cross through
        // the beam ring when it is on the far side.
        const cx = 0, cy = 0.02;
        alive.forEach((em, i) => {
          const ph = i * Math.PI;
          this._emitterBeam(em, (p, out) => {
            const r = 0.42 - 0.34 * p;
            const a = ph + p * TAU * 1.25;
            out.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 0.12);
          }, { warn: 1.0, fire: 3.4, width: 0.03 });
        });
        yield 4.9;
      } else {
        // Scissor: both beams sweep down from above at slightly different speeds.
        alive.forEach((em, i) => {
          const sx = em.side;
          this._emitterBeam(em, (p, out) => out.set(-sx * 0.55 + sx * 1.1 * p, 0.36 - 0.7 * easeInOutCubic(Math.min(1, p * (1 + i * 0.25))), 0.08 - 0.25 * p), { warn: 0.9, fire: 2.2 });
        });
        yield 3.6;
      }
      k++;
      yield alive.length > 1 ? 1.4 : 0.8;
    }
  }

  *_latticeBursts() {
    const g = this.game;
    let phase = 0;
    yield 2;
    while (true) {
      // Sealed shell vents an expanding curtain with a gap - read the hole, slip through.
      const aim = dirTo(this.root.position, g.ship.pos);
      const gap = normalize({ x: aim.x + rand(-0.12, 0.12), y: aim.y + rand(-0.08, 0.08), z: aim.z });
      let i = 0;
      for (const d of shell(170, aim, 0.6, gap, 0.15, phase)) {
        const o = _v.set(d.x, d.y, d.z).multiplyScalar(this.shellRadius).add(this.root.position);
        g.bullets.spawn(o.x, o.y, o.z, d.x * 0.27, d.y * 0.27, d.z * 0.27, i++ % 9 === 0 ? 'large' : 'medium');
      }
      g.sfx.play('enemyShotBig', g.worldPos(this.root.position), { vol: 1 });
      phase += 0.9;
      yield 2.2;
      // inner ring vents: rotating rice streams
      for (let i = 0; i < 10; i++) {
        const a = phase + i * 0.4;
        const o = _v.set(Math.cos(a) * RINGS.inner, Math.sin(a) * RINGS.inner, 0.02).add(this.root.position);
        const d = dirTo(o, g.ship.pos);
        g.bullets.spawn(o.x, o.y, o.z, d.x * 0.45, d.y * 0.45, d.z * 0.45, 'rice');
        yield 0.09;
      }
      yield 2.4;
    }
  }

  _startHeart() {
    const g = this.game;
    this.phase = 'heart';
    this._newOwner();
    this.run((function* (boss) {
      // The cap blows off.
      boss.capOff = true;
      boss.capFlying = { vel: new THREE.Vector3(rand(-0.2, 0.2), 0.5, 0.6), spin: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)), t: 0 };
      const capPos = boss.cap.getWorldPosition(new THREE.Vector3());
      g.arena.worldToLocal(capPos);
      g.fx.explode(capPos, 4, { chunkColor: PALETTE.bossGold });
      g.sfx.play('armorBreak', g.worldPos(capPos), { vol: 1.2 });
      g.sfx.play('boom', g.worldPos(capPos), { vol: 1 });
      g.haptic(0.8, 160, 'both');
      g.onBossPhase(2);
      yield 2.2;
      boss.corePart.vulnerable = true;
      boss.eye.visible = true;
      boss.run(boss._heartEye());
      boss.run(boss._heartVents());
    })(this));
  }

  *_heartEye() {
    const g = this.game;
    let phase = 0;
    let t = 0;
    while (true) {
      const rate = this.final ? 0.13 : this.rage ? 0.15 : 0.18;
      const coneA = EYE_CONE + 0.035 * Math.sin(t * 0.9);
      const d = this.eyeDir;
      const o = _v.copy(d).multiplyScalar(this.shellRadius + 0.01).add(this.root.position);
      const n = this.rage ? 11 : 9;
      for (const b of cone(d, n, coneA, phase)) g.bullets.spawn(o.x, o.y, o.z, b.x * 0.42, b.y * 0.42, b.z * 0.42, 'small');
      phase += this.rage ? 0.21 : 0.17;
      t += rate;
      yield rate;
    }
  }

  *_heartVents() {
    const g = this.game;
    let k = 0;
    yield 1.5;
    while (true) {
      // aimed pellets from the inner ring force you to keep shifting inside the eye
      const a = k * 1.7;
      const o = _v.set(Math.cos(a) * RINGS.inner, Math.sin(a) * RINGS.inner, 0).applyQuaternion(this.inner.quaternion).add(this.root.position);
      const d = dirTo(o, g.ship.pos);
      g.bullets.spawn(o.x, o.y, o.z, d.x * 0.5, d.y * 0.5, d.z * 0.5, 'medium');
      g.sfx.play('enemyShot', g.worldPos(o), { vol: 0.6 });
      if (this.rage && k % 3 === 0) {
        // curtain with its gap centred on the eye, so the safe tunnel survives
        const aim = dirTo(this.root.position, g.ship.pos);
        for (const sd of shell(150, aim, 0.5, this.eyeDir, EYE_CONE + 0.12, k * 0.5)) {
          const so = _v2.set(sd.x, sd.y, sd.z).multiplyScalar(this.shellRadius).add(this.root.position);
          g.bullets.spawn(so.x, so.y, so.z, sd.x * 0.26, sd.y * 0.26, sd.z * 0.26, 'large');
        }
        g.sfx.play('enemyShotBig', g.worldPos(this.root.position), { vol: 1 });
      }
      if (this.final && k % 2 === 0) {
        // desperation: spinning rice spiral from every vent
        for (let i = 0; i < 6; i++) {
          const aa = a + (i / 6) * TAU;
          const oo = _v2.set(Math.cos(aa) * RINGS.inner, Math.sin(aa) * RINGS.inner, 0).applyQuaternion(this.inner.quaternion).add(this.root.position);
          const dd = normalize({ x: Math.cos(aa) * 0.5, y: Math.sin(aa) * 0.4, z: 1 });
          g.bullets.spawn(oo.x, oo.y, oo.z, dd.x * 0.4, dd.y * 0.4, dd.z * 0.4, 'rice', { turn: 0.25 * (i % 2 ? 1 : -1) });
        }
      }
      k++;
      yield this.rage ? 1.0 : 1.5;
    }
  }

  onPartDestroyed(part) {
    const g = this.game;
    g.onBossPartDestroyed(part);
    part.object.visible = false;
    if (part.kind === 'pod') {
      if (this.pods.every((p) => !p.alive)) this._breakRing(this.outer, this.outerRing, RINGS.outer, () => this._startLattice());
    } else if (part.kind === 'emitter') {
      if (this.emitters.every((p) => !p.alive)) this._breakRing(this.mid, this.midRing, RINGS.mid, () => this._startHeart());
    } else if (part.kind === 'core') {
      this._die();
    }
  }

  _breakRing(group, ring, radius, next) {
    const g = this.game;
    this._newOwner();
    this.phase = 'break';
    g.lasers.clear();
    g.bullets.cancelAll(true);
    this.run((function* (boss) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + rand(-0.2, 0.2);
        const p = _v.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        ring.localToWorld(p);
        g.arena.worldToLocal(p);
        g.fx.explode(p.clone(), 2.6, { chunkColor: PALETTE.bossMetal });
        g.sfx.play(i % 3 === 0 ? 'boom' : 'pop', g.worldPos(p), { vol: 0.9 });
        g.haptic(0.4, 40, 'both');
        boss.shake = 1;
        yield 0.12;
      }
      ring.visible = false;
      g.sfx.play('armorBreak', g.worldPos(boss.root.position), { vol: 1.2 });
      g.fx.flash(boss.root.position, 0.6, COLORS.amber, 0.25);
      g.room.flashView(0.25, 0xffaa55);
      yield 1.0;
      next();
    })(this));
  }

  _die() {
    const g = this.game;
    this._newOwner();
    this.phase = 'dying';
    this.eye.visible = false;
    g.lasers.clear();
    g.onBossDying();
    this.run((function* (boss) {
      const pts = [];
      for (let i = 0; i < 24; i++) {
        yield 0.09;
        const p = _v.set(rand(-0.5, 0.5), rand(-0.45, 0.45), rand(-0.2, 0.15)).add(boss.root.position).clone();
        pts.push(p);
        g.fx.explode(p, rand(2, 3.5), { chunkColor: i % 2 ? PALETTE.bossMetal : PALETTE.bossGold, hot: COLORS.amber, cool: i % 3 ? COLORS.magenta : COLORS.orange });
        g.sfx.play(i % 4 === 0 ? 'boom' : 'pop', g.worldPos(p), { vol: 1, reverb: 0.4 });
        g.haptic(0.3 + i * 0.02, 40, 'both');
        boss.shake = 1;
        boss.core.scale.setScalar(1 + i * 0.03);
      }
      // implosion... then everything
      for (let i = 0; i < 20; i++) {
        boss.core.scale.multiplyScalar(0.86);
        g.fx.inward(boss.root.position, 0.4, COLORS.pink, 6);
        yield 0.03;
      }
      boss.root.visible = false;
      g.onBossExploded(boss.root.position.clone());
      boss.alive = false;
      boss.defeated = true;
    })(this));
  }

  // ------------------------------------------------------------------ per-frame

  update(dt) {
    if (!this.root.visible) {
      this.eye.visible = false;
      return;
    }
    const g = this.game;
    this.t += dt;
    const t = this.t;
    // bob + shake
    if (this.phase !== 'intro') {
      const base = this.station;
      this.root.position.set(base.x + Math.sin(t * 0.37) * 0.03, base.y + Math.sin(t * 0.6) * 0.022, base.z + Math.sin(t * 0.23) * 0.02);
    }
    if (this.shake > 0) {
      this.shake *= Math.exp(-6 * dt);
      this.root.position.x += (Math.random() - 0.5) * 0.012 * this.shake;
      this.root.position.y += (Math.random() - 0.5) * 0.012 * this.shake;
    }
    // unfold during intro
    const u = easeOutBack(this.unfold);
    this.innerRing.scale.setScalar(0.3 + 0.7 * u);
    this.midRing.scale.setScalar(0.2 + 0.8 * u);
    this.outerRing.scale.setScalar(0.15 + 0.85 * u);
    this.body.scale.setScalar(0.6 + 0.4 * u);
    for (const p of this.pods) p.object.scale.setScalar(Math.max(0.001, u));
    for (const p of this.emitters) p.object.scale.setScalar(Math.max(0.001, u));

    // ring motion
    const rageK = this.rage ? 2.2 : 1;
    this.inner.rotation.z += dt * this.spin.inner * rageK;
    this.outer.rotation.z += dt * this.spin.outer * (this.pods.filter((p) => p.alive).length <= 2 ? 1.6 : 1);
    this.spin.midSwing += dt * this.spin.midSpeed;
    this.mid.rotation.y = Math.sin(this.spin.midSwing) * 0.95 + (this.phase === 'intro' ? (1 - this.unfold) * 3 : 0);
    this.mid.rotation.z = Math.sin(this.spin.midSwing * 0.5) * 0.25;

    // weak points face the ship
    this.root.updateMatrixWorld(true);
    const shipWorld = _v.copy(g.ship.pos).applyMatrix4(g.arena.matrixWorld);
    for (const p of this.pods) if (p.alive) { p.object.lookAt(shipWorld); p.model.scale.lerp(_v2.set(1, 1, 1), 1 - Math.exp(-8 * dt)); }
    for (const p of this.emitters) if (p.alive) p.object.lookAt(shipWorld);

    // shell: faces the player while sealed; in phase III the aperture wanders around the play space
    if (this.phase === 'heart' || this.phase === 'dying') {
      const k = this.final ? 1.7 : this.rage ? 1.35 : 1;
      this.eyeT = (this.eyeT || 0) + dt * k;
      const et = this.eyeT;
      this.eyeTarget.set(Math.sin(et * 0.47) * 0.27, 0.03 + Math.sin(et * 0.71 + 1.0) * 0.17, 0.0);
      const want = _v2.copy(this.eyeTarget).sub(this.root.position).normalize();
      this.eyeDir.lerp(want, 1 - Math.exp(-3 * dt)).normalize();
      _m.lookAt(_v3.set(0, 0, 0), _v3.copy(this.eyeDir).negate(), _v2.set(0, 1, 0));
      this.shellPivot.quaternion.setFromRotationMatrix(_m);
      // eye cone visual
      const len = this.root.position.distanceTo(this.eyeTarget) + 0.25;
      this.eye.position.copy(this.root.position).addScaledVector(this.eyeDir, this.shellRadius);
      this.eye.lookAt(_v3.copy(this.eye.position).add(this.eyeDir).applyMatrix4(g.arena.matrixWorld));
      const r = Math.tan(EYE_CONE) * len;
      this.eye.scale.set(r, r, len);
      this.eyeMat.uniforms.uTime.value = t;
      this.eyeMat.uniforms.uAlpha.value = Math.min(1, (this.eyeMat.uniforms.uAlpha.value || 0) + dt);
      // health thresholds
      const f = this.corePart.hp / BOSS_HP.core;
      if (!this.rage && f < 0.55) { this.rage = true; g.onBossRage(); }
      if (!this.final && f < 0.2) { this.final = true; g.onBossFinal(); }
    } else {
      const toShip = _v2.copy(g.ship.pos).sub(this.root.position).normalize();
      _m.lookAt(_v3.set(0, 0, 0), toShip.negate(), _v.set(0, 1, 0));
      _q.setFromRotationMatrix(_m);
      this.shellPivot.quaternion.slerp(_q, 1 - Math.exp(-2 * dt));
      this.eyeDir.set(0, 0, 1).applyQuaternion(this.shellPivot.quaternion);
    }

    // flying cap
    if (this.capFlying) {
      const c = this.capFlying;
      c.t += dt;
      c.vel.y -= 0.9 * dt;
      this.cap.position.addScaledVector(c.vel, dt);
      this.cap.rotation.x += c.spin.x * dt;
      this.cap.rotation.y += c.spin.y * dt;
      if (c.t > 2.5) { this.cap.visible = false; this.capFlying = null; }
    }

    // core pulse
    const exposed = this.phase === 'heart';
    const pulse = 1 + Math.sin(t * (exposed ? 9 : 4)) * (exposed ? 0.08 : 0.04);
    if (this.phase !== 'dying') this.core.scale.setScalar(pulse * (exposed ? 1 : 0.8));
    this.coreLight.intensity = exposed ? 2.2 + 0.8 * Math.sin(t * 9) : 0.4;
    const flick = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 13);
    this.flare.scale.setScalar((exposed ? 0.75 : 0.42) * flick * (this.phase === 'dying' ? 1.6 : 1));
    this.arcs.visible = exposed && this.capOff;
    if (this.arcs.visible) this._updateArcs();

    // sync weak point positions + hit flashes
    for (const p of this.parts) {
      p.sync();
      if (p.flash > 0) {
        p.flash -= dt;
        const on = p.flash > 0;
        const hull = p.model?.userData.hull;
        if (hull) hull.material.emissive.setScalar(on ? 0.9 : 0);
        if (p.kind === 'core') this.core.scale.multiplyScalar(on ? 1.06 : 1);
      }
    }
    // cache armour transforms (arena-local -> ring-local) for shot tests
    this._armor = [];
    const arenaInv = _m.copy(g.arena.matrixWorld).invert();
    for (const [ring, R, r] of [[this.innerRing, RINGS.inner, 0.022], [this.midRing, RINGS.mid, 0.024], [this.outerRing, RINGS.outer, 0.028]]) {
      if (!ring.visible || !ring.parent) continue;
      const toLocal = new THREE.Matrix4().multiplyMatrices(arenaInv, ring.matrixWorld).invert();
      this._armor.push({ toLocal, R, r });
    }
  }

  _updateArcs() {
    const arr = this.arcs.geometry.attributes.position.array;
    const d = this.eyeDir;
    const up = Math.abs(d.y) < 0.9 ? _v2.set(0, 1, 0) : _v2.set(1, 0, 0);
    const u = _v3.crossVectors(d, up).normalize();
    const w = new THREE.Vector3().crossVectors(d, u);
    let k = 0;
    for (let a = 0; a < this.arcCount; a++) {
      const ang = Math.random() * TAU;
      const reach = this.shellRadius * rand(1.0, 1.9);
      const spread = Math.sin(0.42) * this.shellRadius * rand(0.8, 1.6);
      let px = 0, py = 0, pz = 0;
      for (let i = 1; i <= this.arcSegs; i++) {
        const f = i / this.arcSegs;
        const ox = Math.cos(ang) * spread * f, oy = Math.sin(ang) * spread * f;
        const j = 0.018 * (1 - Math.abs(f - 0.5) * 2 + 0.3);
        const nx = d.x * reach * f + u.x * ox + w.x * oy + rand(-j, j);
        const ny = d.y * reach * f + u.y * ox + w.y * oy + rand(-j, j);
        const nz = d.z * reach * f + u.z * ox + w.z * oy + rand(-j, j);
        arr[k++] = px; arr[k++] = py; arr[k++] = pz;
        arr[k++] = nx; arr[k++] = ny; arr[k++] = nz;
        px = nx; py = ny; pz = nz;
      }
    }
    this.arcs.geometry.attributes.position.needsUpdate = true;
  }

  /** Armour test for a player shot. Returns 'armor' when blocked, or null. */
  testArmor(s) {
    if (!this.root.visible || this.phase === 'dying') return null;
    const c = this.root.position;
    // the shell
    if (!s.throughAperture) {
      const tEnter = segmentSphere(s.px, s.py, s.pz, s.x, s.y, s.z, c.x, c.y, c.z, this.shellRadius + s.radius * 0.5);
      if (tEnter >= 0) {
        const ex = s.px + (s.x - s.px) * tEnter, ey = s.py + (s.y - s.py) * tEnter, ez = s.pz + (s.z - s.pz) * tEnter;
        const open = this.phase === 'heart' && this.capOff;
        if (open && inAperture(ex, ey, ez, c.x, c.y, c.z, this.eyeDir.x, this.eyeDir.y, this.eyeDir.z, APERTURE_HIT_ANGLE)) {
          s.throughAperture = true;
          return null;
        }
        s.hitPoint = { x: ex, y: ey, z: ez };
        return 'armor';
      }
    }
    // the rings
    for (const a of this._armor || []) {
      _v.set(s.x, s.y, s.z).applyMatrix4(a.toLocal);
      if (torusDistance(_v.x, _v.y, _v.z, a.R, a.r + s.radius * 0.5) < 0) {
        s.hitPoint = { x: s.x, y: s.y, z: s.z };
        return 'armor';
      }
    }
    return null;
  }

  /** Is the given arena-local point inside the eye (useful for hints / bot)? */
  inEye(p) {
    return inAperture(p.x, p.y, p.z, this.root.position.x, this.root.position.y, this.root.position.z, this.eyeDir.x, this.eyeDir.y, this.eyeDir.z, EYE_CONE * 0.85);
  }

  dispose() {
    this._newOwner();
    this.game.arena.remove(this.root);
    this.game.arena.remove(this.eye);
    this.alive = false;
  }
}


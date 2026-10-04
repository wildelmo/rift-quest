import * as THREE from 'three';
import { catmullRom, clamp, rand, segmentSphere, TAU, easeInOutCubic } from '../engine/math.js';
import { buildDart, buildBloom, buildLancer, buildCarrier, buildCapsule, buildMine, miteGeometries, hullMaterial, getGlowMaterial, PALETTE, setFlash } from './models.js';
import { cone, dirTo, fan, normalize, shell } from './patterns.js';
import { COLORS } from './fx.js';
import { difficulty } from './difficulty.js';
import { SHAPE } from '../engine/billboards.js';
const SHAPE_GLOW = SHAPE.GLOW;
import { makeCanvas, drawText } from '../engine/text.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Scripted paths run at this fraction of their authored duration (lower = faster enemies). */
export const pace = () => difficulty().pace;

/** Base enemy: a model in the arena with hp, a collider sphere and scripted behaviour. */
export class Enemy {
  constructor(game, model, { hp = 1, radius = 0.03, score = 100, kind = 'enemy', contact = true, explodeScale = 1 } = {}) {
    this.game = game;
    this.model = model;
    this.group = new THREE.Group();
    this.group.add(model);
    game.arena.add(this.group);
    this.pos = this.group.position;
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    // health scales with difficulty (a single bolt still kills anything that had 1 hp)
    this.hp = Math.max(hp === 1 ? 1 : 0.9, hp * difficulty().enemyHp);
    this.maxHp = this.hp;
    this.radius = radius;
    this.score = score;
    this.kind = kind;
    this.contact = contact;
    this.explodeScale = explodeScale;
    this.alive = true;
    this.t = 0;
    this.flash = 0;
    this.faceShip = false;
    this.faceVel = true;
    this.mover = null;
    this.armor = false;
    this.dropCapsule = false;
    this.formation = null;
    this.hull = model.userData.hull;
    this.jink = null; // { amp, freq } erratic wobble layered on top of the scripted path
    this.jinkOff = new THREE.Vector3();
    game.enemies.push(this);
  }

  run(gen) {
    return this.game.scheduler.start(gen, this);
  }

  aimPoint(out) {
    return out.copy(this.pos);
  }

  /** Follow a Catmull-Rom path over duration seconds, then call done(). */
  followPath(points, duration, { ease = (t) => t, done = null, loop = false } = {}) {
    let t = 0;
    this.mover = (dt) => {
      t += dt / duration;
      if (t >= 1) {
        if (loop) t -= 1;
        else {
          t = 1;
          this.mover = null;
          done && done();
        }
      }
      catmullRom(points, ease(t), this.pos);
    };
  }

  moveTo(target, duration, ease = easeInOutCubic, done = null) {
    const from = this.pos.clone();
    const to = target.clone();
    let t = 0;
    this.mover = (dt) => {
      t = Math.min(1, t + dt / duration);
      this.pos.lerpVectors(from, to, ease(t));
      if (t >= 1) {
        this.mover = null;
        done && done();
      }
    };
  }

  update(dt) {
    this.t += dt;
    this.prev.copy(this.pos);
    this.pos.sub(this.jinkOff);
    if (this.mover) this.mover(dt);
    if (this.jink) {
      const j = this.jink, t = this.t * j.freq;
      this.jinkOff.set(
        j.amp * (Math.sin(t + j.p0) + 0.5 * Math.sin(t * 2.3 + j.p1)),
        j.amp * 0.8 * (Math.sin(t * 1.37 + j.p1) + 0.4 * Math.sin(t * 3.1 + j.p0)),
        j.amp * 0.5 * Math.sin(t * 0.71 + j.p2),
      );
    }
    this.pos.add(this.jinkOff);
    if (dt > 0) this.vel.subVectors(this.pos, this.prev).divideScalar(dt);
    const ship = this.game.ship;
    if (this.faceShip) {
      _v.copy(ship.pos);
      this.group.lookAt(_v.applyMatrix4(this.game.arena.matrixWorld));
    } else if (this.faceVel && this.vel.lengthSq() > 1e-4) {
      // models point along -Z; Matrix4.lookAt aims -Z at the target, so look along travel
      _v.copy(this.pos).add(this.vel);
      _m.lookAt(this.pos, _v, _up);
      _q.setFromRotationMatrix(_m);
      this.group.quaternion.slerp(_q, 1 - Math.exp(-10 * dt));
    }
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.hull) setFlash(this.hull.material, this.flash > 0 ? 0.85 : 0);
    }
    this.tick && this.tick(dt);
    if (this.t > 60) this.remove(); // safety net
  }

  /** Default collision against a shot travelling from (px,py,pz) to (x,y,z). */
  testShot(s) {
    const r = this.radius + s.radius;
    return segmentSphere(s.px, s.py, s.pz, s.x, s.y, s.z, this.pos.x, this.pos.y, this.pos.z, r) >= 0 ? 'hit' : null;
  }

  damage(dmg, point) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.flash = 0.06;
    this.game.onEnemyDamaged(this, dmg, point);
    if (this.hp <= 0) this.kill();
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.game.onEnemyKilled(this);
    this.remove();
  }

  /** Remove silently (escaped or cleaned up). */
  remove() {
    this.alive = false;
    this.game.arena.remove(this.group);
    this.onRemove && this.onRemove();
  }

  /** Shoot a bullet from this enemy toward the ship. */
  setJink(amp, freq) {
    this.jink = { amp, freq, p0: rand(0, TAU), p1: rand(0, TAU), p2: rand(0, TAU) };
  }

  shootAt(speed = 0.5, kind = 'small', opts = {}) {
    const g = this.game;
    const from = this.muzzle ? this.muzzle(_v2) : this.pos;
    const d = dirTo(from, g.ship.pos);
    g.bullets.spawn(from.x, from.y, from.z, d.x * speed, d.y * speed, d.z * speed, kind, opts);
    g.sfx.play(kind === 'large' ? 'enemyShotBig' : 'enemyShot', g.worldPos(from), { vol: 0.5, minGap: 0.05 });
  }
}

// ------------------------------------------------------------------ dart

export function spawnDart(game, points, duration, opts = {}) {
  const e = new Enemy(game, buildDart(), { hp: opts.hp ?? 4, radius: 0.024, score: 100, kind: 'dart' });
  e.model.scale.setScalar(0.72);
  catmullRom(points, 0, e.pos);
  e.followPath(points, duration * pace(), { done: () => e.remove() });
  e.setJink(opts.jink ?? 0.03, opts.jinkFreq ?? rand(2, 3.2));
  if (opts.shots) {
    e.run((function* () {
      yield (opts.firstShot ?? rand(0.6, 1.2)) * pace();
      for (let i = 0; i < opts.shots; i++) {
        if (e.pos.distanceTo(game.ship.pos) < 0.28) break; // never shoot point-blank
        // a quick 3-round burst
        for (let k = 0; k < (opts.burst ?? 3); k++) {
          e.shootAt(opts.speed ?? 0.5, opts.kind ?? 'amber');
          yield 0.08;
        }
        yield (opts.interval ?? rand(0.7, 1.1)) * pace();
      }
    })());
  }
  return e;
}

/** Spawns a Gradius-style formation that drops a capsule when wiped out. */
export function spawnFormation(game, count, makePath, duration, { spacing = 0.22, ...opts } = {}) {
  const form = { total: count, killed: 0, escaped: 0, members: [] };
  game.pendingSpawns += count;
  for (let i = 0; i < count; i++) {
    game.scheduler.start((function* () {
      yield i * spacing;
      game.pendingSpawns--;
      const e = spawnDart(game, makePath(i), duration, opts);
      e.formation = form;
      form.members.push(e);
    })());
  }
  return form;
}

// ------------------------------------------------------------------ bloom (spiral turret)

export function spawnBloom(game, from, station, opts = {}) {
  const model = buildBloom();
  const e = new Enemy(game, model, { hp: opts.hp ?? 30, radius: 0.04, score: 1000, kind: 'bloom', explodeScale: 2.2 });
  model.scale.setScalar(0.72);
  e.pos.copy(from);
  e.faceVel = false;
  e.faceShip = true;
  e.dropCapsule = opts.drop ?? false;
  e.cancelRadius = 0.25;
  const petals = model.userData.petals;
  let spin = 1;
  let open = 0;
  e.tick = (dt) => {
    petals.rotation.z += dt * spin;
    const s = 0.8 + 0.35 * open;
    petals.scale.set(s, s, 1);
  };
  e.moveTo(station, opts.travel ?? 2.2);
  e.run((function* () {
    yield opts.travel ?? 2.2;
    const style = opts.style ?? 'spiral';
    const duration = opts.duration ?? 9;
    let t = 0;
    let phase = rand(0, TAU) + (opts.ringPhase || 0);
    let hugeT = 1.2;
    open = 1;
    spin = 3;
    while (t < duration) {
      const aim = dirTo(e.pos, game.ship.pos);
      if (style === 'spiral') {
        // a rotating spiral flower that blooms towards the player: hollow cone around the aim
        const arms = opts.arms ?? 3;
        const dirs = cone(aim, arms, opts.cone ?? 0.5, phase);
        for (const d of dirs) game.bullets.spawn(e.pos.x, e.pos.y, e.pos.z, d.x * 0.38, d.y * 0.38, d.z * 0.38, opts.kind ?? 'small');
        phase += opts.phaseStep ?? 0.33;
        game.sfx.play('enemyShot', game.worldPos(e.pos), { vol: 0.25, minGap: 0.12 });
        // big slow energy balls that drift through the room
        hugeT -= opts.interval ?? 0.13;
        if (opts.huge && hugeT <= 0) {
          hugeT = 2.6;
          for (const d of fan(aim, 3, 0.5, rand(0, Math.PI))) game.bullets.spawn(e.pos.x, e.pos.y, e.pos.z, d.x * 0.2, d.y * 0.2, d.z * 0.2, 'huge');
          game.sfx.play('enemyShotBig', game.worldPos(e.pos), { vol: 0.7 });
        }
        yield opts.interval ?? 0.13;
        t += opts.interval ?? 0.13;
      } else if (style === 'rings') {
        const dirs = cone(aim, 14, 0.62, phase);
        for (const d of dirs) game.bullets.spawn(e.pos.x, e.pos.y, e.pos.z, d.x * 0.32, d.y * 0.32, d.z * 0.32, 'medium');
        phase += 0.22;
        game.sfx.play('enemyShotBig', game.worldPos(e.pos), { vol: 0.5 });
        yield 1.0;
        t += 1.0;
      }
    }
    open = 0;
    spin = 1;
    yield 0.6;
    const exit = e.pos.clone().add(new THREE.Vector3(0, 0.9, -1.8));
    e.moveTo(exit, 2.4, (x) => x * x, () => e.remove());
  })());
  return e;
}

// ------------------------------------------------------------------ lancer (laser frigate)

export function spawnLancer(game, from, station, opts = {}) {
  const e = new Enemy(game, buildLancer(), { hp: opts.hp ?? 36, radius: 0.04, score: 1500, kind: 'lancer', explodeScale: 2.2 });
  e.model.scale.setScalar(0.75);
  e.pos.copy(from);
  e.faceVel = true;
  e.dropCapsule = opts.drop ?? false;
  e.cancelRadius = 0.2;
  e.muzzle = (out) => out.set(0, 0, -0.055).applyQuaternion(e.group.quaternion).add(e.pos);
  e.moveTo(station, opts.travel ?? 2.0);
  e.run((function* () {
    yield (opts.travel ?? 2.0) + 0.2;
    e.faceVel = false;
    for (let k = 0; k < (opts.sweeps ?? 3); k++) {
      // aim at a point that sweeps across the action zone
      const vertical = opts.vertical ?? (k % 2 === 1);
      const sgn = k % 2 ? -1 : 1;
      const a0 = vertical ? { x: game.ship.pos.x, y: 0.32 * sgn, z: 0.05 } : { x: -0.45 * sgn, y: game.ship.pos.y, z: 0.05 };
      const a1 = vertical ? { x: a0.x, y: -0.34 * sgn, z: 0.05 } : { x: 0.45 * sgn, y: a0.y, z: 0.05 };
      let tt = 0;
      const warn = 0.7, fire = 1.3;
      const target = new THREE.Vector3();
      game.sfx.play('laserCharge', game.worldPos(e.pos), { vol: 0.8 });
      let hum = null;
      game.lasers.add((l, dt) => {
        tt += dt;
        const p = l.state === 'warn' ? 0 : clamp(l.t / fire, 0, 1);
        target.set(a0.x + (a1.x - a0.x) * easeInOutCubic(p), a0.y + (a1.y - a0.y) * easeInOutCubic(p), a0.z);
        e.muzzle(l.origin);
        l.dir.copy(target).sub(l.origin).normalize();
        // turn the hull to face along the beam
        _v.copy(e.pos).add(l.dir);
        _m.lookAt(e.pos, _v, _up);
        e.group.quaternion.setFromRotationMatrix(_m);
        if (hum) hum.setPos(game.worldPos(l.origin));
      }, {
        warn, fire, width: 0.032, length: 3.2, owner: e, color: [1, 0.2, 0.32],
        onFire: () => { hum = game.sfx.loop('laserHum', game.worldPos(e.pos), 0.5); game.haptic(0.3, 60); },
      });
      yield warn + fire;
      hum && hum.stop();
      yield 0.5;
      // a short aimed fan between sweeps
      const d = dirTo(e.muzzle(_v2), game.ship.pos);
      for (const f of fan(d, 5, 0.5)) game.bullets.spawn(_v2.x, _v2.y, _v2.z, f.x * 0.4, f.y * 0.4, f.z * 0.4, 'rice');
      yield 0.9;
    }
    e.faceVel = true;
    const exit = e.pos.clone().add(new THREE.Vector3(Math.sign(e.pos.x || 1) * 1.6, 0.4, -1.2));
    e.moveTo(exit, 2.2, (x) => x * x, () => e.remove());
  })());
  return e;
}

// ------------------------------------------------------------------ carrier (armoured mothership)

export function spawnCarrier(game, from, station, opts = {}) {
  const e = new Enemy(game, buildCarrier(), { hp: opts.hp ?? 150, radius: 0.08, score: 4000, kind: 'carrier', explodeScale: 3.5 });
  e.model.scale.setScalar(0.7);
  e.model.rotation.y = Math.PI; // nose toward the player while it faces the ship
  e.pos.copy(from);
  e.faceVel = false;
  e.faceShip = true;
  e.dropCapsule = true;
  e.cancelRadius = 0.6;
  e.drops = 2;
  e.moveTo(station, opts.travel ?? 3.2);
  e.run((function* () {
    yield (opts.travel ?? 3.2);
    let phase = 0;
    for (let k = 0; k < 6; k++) {
      // 1) expanding shell with a gap that follows the ship: dodge through the hole
      const aim = dirTo(e.pos, game.ship.pos);
      const gapDir = normalize({ x: aim.x + rand(-0.15, 0.15), y: aim.y + rand(-0.1, 0.1), z: aim.z });
      for (const d of shell(140, aim, 0.55, gapDir, 0.17, phase)) {
        game.bullets.spawn(e.pos.x, e.pos.y, e.pos.z, d.x * 0.3, d.y * 0.3, d.z * 0.3, 'medium');
      }
      phase += 0.7;
      game.sfx.play('enemyShotBig', game.worldPos(e.pos), { vol: 0.8 });
      yield 1.3;
      // 2) launch a pair of darts from the bays
      for (const sx of [-1, 1]) {
        const start = e.pos.clone().add(new THREE.Vector3(0.09 * sx, 0, 0.05));
        const pts = [start, start.clone().add(new THREE.Vector3(0.25 * sx, 0.1, 0.25)), new THREE.Vector3(0.15 * sx, rand(-0.1, 0.15), -0.25), new THREE.Vector3(-0.6 * sx, 0.2, 0.6)];
        spawnDart(game, pts, 3.4, { shots: 1, firstShot: 0.8 });
      }
      yield 1.0;
      // 3) aimed triple stream
      for (let i = 0; i < 3; i++) {
        e.shootAt(0.55, 'amber');
        yield 0.12;
      }
      yield 1.0;
    }
    const exit = e.pos.clone().add(new THREE.Vector3(0, 0.5, -2));
    e.moveTo(exit, 3, (x) => x * x, () => e.remove());
  })());
  return e;
}

// ------------------------------------------------------------------ pivot mine

/**
 * Warps in close to the player, arms with a blinking eye, then sweeps 2-4 lasers around its
 * pivot. When the sweep ends it pops into a ring of bullets. Shoot it first to disarm it.
 */
export function spawnMine(game, pos, opts = {}) {
  const beams = Math.max(2, (opts.beams ?? 3) + difficulty().mineBeams);
  const model = buildMine(beams);
  const e = new Enemy(game, model, { hp: opts.hp ?? 3, radius: 0.026, score: 300, kind: 'mine', explodeScale: 1.4, contact: true });
  e.pos.copy(pos);
  e.faceVel = false;
  e.faceShip = true;
  e.cancelRadius = 0.12;
  model.scale.setScalar(0.001);
  game.fx.flash(pos, 0.06, COLORS.red, 0.15);
  game.fx.ring(pos, 0.14, COLORS.red, 0.35);
  game.sfx.play('laserCharge', game.worldPos(pos), { vol: 0.6, rate: 1.4 });
  const spin = (opts.spin ?? rand(1.1, 1.9)) * (Math.random() < 0.5 ? -1 : 1);
  const warn = opts.warn ?? 1.0, fire = opts.fire ?? 4.0;
  const length = opts.length ?? 0.5;
  let t = 0;
  e.tick = (dt) => {
    t += dt;
    model.scale.setScalar(Math.min(1, t / 0.3));
    model.rotation.z += dt * spin * (t > warn ? 1 : 0.3);
    const eyeHull = model.userData.glow;
    if (eyeHull) eyeHull.visible = t > warn || Math.floor(t * 10) % 2 === 0; // blinking while arming
  };
  // beams lie in the plane facing the player's head, so every sweep cuts across the play space
  const axis = new THREE.Vector3();
  const base = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let i = 0; i < beams; i++) {
    const phase0 = (i / beams) * TAU + rand(0, TAU / beams);
    let ang = phase0;
    game.lasers.add((l, dt) => {
      axis.copy(game.headLocal).sub(e.pos).normalize();
      up.set(0, 1, 0);
      if (Math.abs(axis.y) > 0.9) up.set(1, 0, 0);
      base.crossVectors(axis, up).normalize();
      tmp.crossVectors(axis, base);
      ang += dt * spin * (l.state === 'warn' ? 0.3 : 1);
      l.origin.copy(e.pos);
      l.dir.copy(base).multiplyScalar(Math.cos(ang)).addScaledVector(tmp, Math.sin(ang)).normalize();
      l.origin.addScaledVector(l.dir, 0.02);
    }, { warn, fire, width: 0.013, length, owner: e, color: [1, 0.25, 0.15] });
  }
  e.run((function* () {
    yield warn;
    game.sfx.play('laserHum', game.worldPos(e.pos), { vol: 0.35 });
    yield fire + 0.1;
    // pop: ring of bullets in the beam plane, then gone
    const aim = dirTo(e.pos, game.headLocal);
    for (const d of cone(aim, 14, Math.PI / 2, rand(0, TAU))) game.bullets.spawn(e.pos.x, e.pos.y, e.pos.z, d.x * 0.34, d.y * 0.34, d.z * 0.34, 'small');
    game.fx.explode(e.pos, 1.2, { chunkColor: PALETTE.enemyHull });
    game.sfx.play('pop', game.worldPos(e.pos), { vol: 0.8 });
    e.remove();
  })());
  return e;
}

// ------------------------------------------------------------------ hornet (kamikaze)

/** Curls in, flares its eye as a warning, then dashes straight at your ship. */
export function spawnHornet(game, from, approach, opts = {}) {
  const e = new Enemy(game, buildDart(), { hp: opts.hp ?? 2, radius: 0.02, score: 250, kind: 'hornet', contact: true });
  e.model.scale.setScalar(0.6);
  e.pos.copy(from);
  e.followPath([from, approach[0], approach[1]], (opts.travel ?? 2.2) * pace());
  e.setJink(0.02, 3.5);
  e.run((function* () {
    yield (opts.travel ?? 2.2) * pace();
    e.jink = null;
    e.mover = null;
    e.faceShip = false;
    // telegraph
    const target = game.ship.pos.clone();
    game.lasers.add((l) => { l.origin.copy(e.pos); l.dir.copy(target).sub(e.pos).normalize(); }, { warn: 0.45, fire: 0.001, width: 0.004, length: e.pos.distanceTo(target) + 0.2, owner: e, color: [1, 0.55, 0.1] });
    game.sfx.play('laserCharge', game.worldPos(e.pos), { vol: 0.5, rate: 1.8 });
    yield 0.45;
    const dir = target.sub(e.pos).normalize();
    let speed = 0.6;
    game.sfx.play('enemyShotBig', game.worldPos(e.pos), { vol: 0.7, rate: 1.4 });
    for (let t = 0; t < 2.2; t += game.dt) {
      const dt = game.dt;
      speed = Math.min(1.5, speed + 2.5 * dt);
      // slight homing during the first part of the dash
      if (t < 0.35) dir.lerp(_v.copy(game.ship.pos).sub(e.pos).normalize(), 0.06).normalize();
      e.pos.addScaledVector(dir, speed * dt);
      if (dt > 0 && Math.random() < 0.6) game.fx.spawn({ x: e.pos.x, y: e.pos.y, z: e.pos.z, life: 0.25, size: 0.012, size1: 0.003, color: COLORS.orange, shape: SHAPE_GLOW, additive: 0.8 });
      if (e.pos.z > game.headLocal.z + 0.4) break;
      yield;
    }
    e.remove();
  })());
  return e;
}

// ------------------------------------------------------------------ wraith (erratic fighter)

/** Hops between random points around you with no fixed path, firing fans between hops. */
export function spawnWraith(game, from, opts = {}) {
  const e = new Enemy(game, buildDart(), { hp: opts.hp ?? 6, radius: 0.026, score: 400, kind: 'wraith' });
  e.model.scale.setScalar(0.8);
  e.pos.copy(from);
  e.setJink(0.015, 4);
  const box = opts.box || { x: [-0.55, 0.55], y: [-0.1, 0.45], z: [-1.0, -0.45] };
  e.run((function* () {
    const hops = opts.hops ?? 6;
    for (let i = 0; i < hops; i++) {
      const to = new THREE.Vector3(rand(...box.x), rand(...box.y), rand(...box.z));
      const dur = rand(0.35, 0.7);
      e.faceVel = true;
      e.moveTo(to, dur, (k) => 1 - Math.pow(1 - k, 3));
      yield dur + rand(0.05, 0.25);
      e.faceVel = false;
      e.faceShip = true;
      const d = dirTo(e.pos, game.ship.pos);
      for (const f of fan(d, opts.fan ?? 5, 0.55, rand(0, Math.PI))) game.bullets.spawn(e.pos.x, e.pos.y, e.pos.z, f.x * 0.5, f.y * 0.5, f.z * 0.5, 'rice');
      game.sfx.play('enemyShot', game.worldPos(e.pos), { vol: 0.6 });
      yield 0.2;
      e.faceShip = false;
    }
    e.faceVel = true;
    e.moveTo(e.pos.clone().add(new THREE.Vector3(Math.sign(e.pos.x || 1) * 1.5, 0.5, -1.2)), 1.2, (x) => x * x, () => e.remove());
  })());
  return e;
}

// ------------------------------------------------------------------ swarm (instanced mites)

export class Swarm {
  constructor(game, count = 70) {
    this.game = game;
    const { hull, glow } = miteGeometries();
    this.hull = new THREE.InstancedMesh(hull, hullMaterial({ metalness: 0.6, roughness: 0.35 }), count);
    this.glow = new THREE.InstancedMesh(glow, getGlowMaterial(), count);
    for (const m of [this.hull, this.glow]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      game.arena.add(m);
    }
    this.hull.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mites = [];
    this.capacity = count;
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /**
   * Launch a stream of mites along a river path (array of Vector3) that sweeps around the player.
   * Each mite gets its own lateral offset and wobble.
   */
  stream(path, count, duration, { interval = 0.07, spread = 0.12, aimedShots = 0 } = {}) {
    const game = this.game;
    game.pendingSpawns += count;
    game.scheduler.start((function* (sw) {
      for (let i = 0; i < count; i++) {
        game.pendingSpawns--;
        sw._spawn(path, duration, spread, aimedShots > 0 && i % Math.max(1, Math.floor(count / aimedShots)) === 0);
        yield interval;
      }
    })(this));
  }

  _spawn(path, duration, spread, shooter) {
    if (this.mites.length >= this.capacity) return;
    const game = this.game;
    const m = {
      alive: true, kind: 'mite', score: 50, radius: 0.016, hp: 1, explodeScale: 0.6, contact: true,
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), quat: new THREE.Quaternion(), t: 0,
      off: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread),
      wob: rand(0, TAU), wobF: rand(2, 4), path, duration: duration * pace(), flash: 0, shooter, shot: false,
      aimPoint: (out) => out.copy(m.pos),
      testShot: (s) => (segmentSphere(s.px, s.py, s.pz, s.x, s.y, s.z, m.pos.x, m.pos.y, m.pos.z, m.radius + s.radius) >= 0 ? 'hit' : null),
      damage: (dmg, pt) => {
        if (!m.alive) return;
        m.hp -= dmg;
        if (m.hp <= 0) {
          m.alive = false;
          game.onEnemyKilled(m);
        } else game.onEnemyDamaged(m, dmg, pt);
      },
      kill: () => { if (m.alive) { m.alive = false; game.onEnemyKilled(m); } },
    };
    catmullRom(path, 0, m.pos);
    this.mites.push(m);
  }

  get active() {
    return this.mites.length > 0;
  }

  update(dt) {
    const game = this.game;
    let w = 0;
    for (const m of this.mites) {
      if (!m.alive) continue;
      m.t += dt;
      const u = m.t / m.duration;
      if (u >= 1) { m.alive = false; continue; }
      m.prev.copy(m.pos);
      catmullRom(m.path, u, m.pos);
      const wob = Math.sin(m.t * m.wobF + m.wob);
      m.pos.x += m.off.x + wob * 0.025;
      m.pos.y += m.off.y + Math.cos(m.t * m.wobF * 1.3 + m.wob) * 0.02;
      m.pos.z += m.off.z;
      _v.subVectors(m.pos, m.prev);
      if (_v.lengthSq() > 1e-9) {
        _m.lookAt(m.pos, _v2.copy(m.pos).add(_v), _up);
        m.quat.setFromRotationMatrix(_m);
      }
      if (m.shooter && !m.shot && m.t > m.duration * 0.25 && m.pos.z < -0.5) {
        m.shot = true;
        const d = dirTo(m.pos, game.ship.pos);
        game.bullets.spawn(m.pos.x, m.pos.y, m.pos.z, d.x * 0.4, d.y * 0.4, d.z * 0.4, 'small');
      }
      if (m.flash > 0) m.flash -= dt;
      this.mites[w++] = m;
    }
    this.mites.length = w;
  }

  render() {
    const n = this.mites.length;
    for (let i = 0; i < n; i++) {
      const m = this.mites[i];
      this._s.setScalar(1.0);
      _m.compose(m.pos, m.quat, this._s);
      this.hull.setMatrixAt(i, _m);
      this.glow.setMatrixAt(i, _m);
      this.hull.setColorAt(i, this._c.setRGB(1, 1, 1));
    }
    this.hull.count = n;
    this.glow.count = n;
    this.hull.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
    if (this.hull.instanceColor) this.hull.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const m of this.mites) m.alive = false;
    this.mites.length = 0;
    this.hull.count = 0;
    this.glow.count = 0;
  }
}

// ------------------------------------------------------------------ pickups

export const CAPSULES = {
  P: { color: 0xff5a1f, name: 'WEAPON UP', tag: 'WEAPON', css: '#ff8a4a' },
  O: { color: 0xffb02e, name: 'OPTION DRONE', tag: 'DRONE', css: '#ffc85a' },
  S: { color: 0x2fd6ff, name: 'SHIELD', tag: 'SHIELD', css: '#6ae6ff' },
  B: { color: 0xff3df0, name: 'BOMB +1', tag: 'BOMB', css: '#ff7af5' },
};

/** Capsule label: the word, so you know what you are flying into. */
function letterTexture(type, css) {
  const c = makeCanvas(256, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 14, 240, 68);
  drawText(ctx, CAPSULES[type].tag, 128, 50, { size: 52, fit: 228, color: '#ffffff', glow: css, italic: false, weight: 900, spacing: 0.08 });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const letterTex = {};

export class Pickup {
  constructor(game, type, pos) {
    this.game = game;
    this.type = type;
    const def = CAPSULES[type];
    this.group = new THREE.Group();
    this.model = buildCapsule(def.color);
    this.group.add(this.model);
    if (!letterTex[type]) letterTex[type] = letterTexture(type, def.css);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTex[type], depthWrite: false, transparent: true }));
    this.label.scale.set(0.064, 0.024, 1);
    this.label.position.y = 0.036;
    this.group.add(this.label);
    this.group.position.copy(pos);
    this.pos = this.group.position;
    game.arena.add(this.group);
    this.alive = true;
    this.t = 0;
    this.vel = new THREE.Vector3(rand(-0.05, 0.05), 0.12, 0.08);
  }

  update(dt) {
    this.t += dt;
    const ship = this.game.ship;
    // drift into the action zone, then hover gently, then home to the ship when near
    const target = _v.set(clamp(this.pos.x, -0.35, 0.35), clamp(this.pos.y, -0.2, 0.25), -0.18);
    const toShip = _v2.subVectors(ship.pos, this.pos);
    const d = toShip.length();
    if (ship.active && d < 0.14) {
      this.vel.addScaledVector(toShip.normalize(), 2.5 * dt);
    } else {
      this.vel.x += (target.x - this.pos.x) * 0.6 * dt;
      this.vel.y += (target.y - this.pos.y) * 0.6 * dt;
      this.vel.z += (target.z - this.pos.z) * 0.6 * dt;
    }
    this.vel.multiplyScalar(Math.exp(-1.6 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.model.rotation.y += dt * 2.5;
    this.model.rotation.x = Math.sin(this.t * 2) * 0.3;
    if (ship.active && d < 0.045) {
      this.alive = false;
      this.game.onPickup(this);
    }
    if (this.t > 16) {
      this.alive = false;
    }
    if (!this.alive) this.game.arena.remove(this.group);
    // blink before expiring
    this.group.visible = this.t < 13 || Math.floor(this.t * 8) % 2 === 0;
  }
}

/** Choose the capsule type the player most needs. */
export function chooseCapsule(ship, rng = Math.random) {
  const weights = [
    ['P', ship.level < 4 ? (ship.level === 1 ? 5 : 3) : 0],
    ['O', ship.optionCount < 3 ? (ship.optionCount === 0 ? 4 : 2.2) : 0],
    ['S', ship.shield ? 0 : 1.6],
    ['B', ship.bombs < 5 ? 1.2 : 0.2],
  ];
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [k, w] of weights) {
    if (w > 0 && (r -= w) <= 0) return k;
  }
  return 'B';
}

export { PALETTE, COLORS };

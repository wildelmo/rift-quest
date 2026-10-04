import * as THREE from 'three';
import { Scheduler } from '../engine/coroutines.js';
import { chainMultiplier, clamp, rand } from '../engine/math.js';
import { SHAPE } from '../engine/billboards.js';
import { Fx, COLORS } from './fx.js';
import { EnemyBullets, Lasers } from './bullets.js';
import { Ship, PlayerShots, SHIP } from './player.js';
import { Swarm, Pickup, chooseCapsule, CAPSULES } from './enemies.js';
import { Gyre } from './boss.js';
import { Hud, fmt } from './hud.js';
import { stage, WAVES } from './stage.js';
import { PALETTE } from './models.js';
import { Screens } from './screens.js';
import { Menu } from './menu.js';
import { difficulty, nextDifficulty } from './difficulty.js';
import { loadAudioSettings, saveAudioSettings } from '../audio/settings.js';

// The game: state machine, collision resolution, scoring and feedback (sound, haptics,
// hit-stop, flashes). Everything gameplay-related lives in arena-local space.

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// Ship sits just above and ahead of the controller, like a toy held in the fist.
export const GRIP_OFFSET = new THREE.Vector3(0, 0.055, -0.03);
const EXTENDS = [400000, 1200000];

let hiScoreMem = 0;
function loadHi() {
  try { return Number(localStorage.getItem('rift.hiscore') || 0) || hiScoreMem; } catch { return hiScoreMem; }
}
function saveHi(v) {
  hiScoreMem = Math.max(hiScoreMem, v);
  try { localStorage.setItem('rift.hiscore', String(v)); } catch { /* storage unavailable */ }
}

export class Game {
  constructor({ scene, room, audio, input, options = {} }) {
    this.scene = scene;
    this.room = room;
    this.arena = room.arena;
    this.audio = audio;
    this.sfx = audio.sfx;
    this.music = audio.music;
    this.input = input;
    this.options = options;
    this.scheduler = new Scheduler();
    this.fx = new Fx(this.arena, room);
    this.bullets = new EnemyBullets(this.arena);
    this.lasers = new Lasers(this.arena);
    this.shots = new PlayerShots(this.arena);
    this.ship = new Ship(this.arena, this.shots, this.fx, this.sfx);
    this.swarm = new Swarm(this, 90);
    this.enemies = [];
    this.pickups = [];
    this.targets = [];
    this.boss = null;
    this.hud = new Hud(this);
    this.screens = new Screens(room);
    this.menu = new Menu(this);
    this.menuKey = '';
    this.audioSettings = loadAudioSettings(); // { music, effects, muted }
    this.applyAudioSettings();
    room.onLayout = () => this.screens.layout();
    this.headWorld = new THREE.Vector3(0, 1.6, 0);
    this.headLocal = new THREE.Vector3(0, 0.28, 0.4);
    this.state = 'title';
    this.time = 0;
    this.dt = 0;
    this.pauseScale = 1;
    this.hitstop = 0;
    this.slowmo = 1;
    this.slowmoTarget = 1;
    this.heldHand = null;
    this.pull = null;
    this.score = 0;
    this.hiScore = loadHi();
    this.chain = 0;
    this.chainTimer = 0;
    this.chainMult = 1;
    this.maxChain = 0;
    this.grazes = 0;
    this.waveIndex = 0;
    this.waveLabel = '';
    this.pendingSpawns = 0;
    this.bomb = null;
    this.stats = {};
    this.continues = 0;
    this.hintsShown = {};
    this.restPose = { pos: new THREE.Vector3(0, -0.02, -0.06), quat: new THREE.Quaternion() };
    this._buildBombVisual();
    this._buildGrabHalo();
    this.toTitle();
  }

  // ------------------------------------------------------------------ helpers

  worldPos(local) {
    return _v2.copy(local).applyMatrix4(this.arena.matrixWorld).clone();
  }

  haptic(intensity, ms, which = 'ship') {
    const hand = which === 'ship' ? this.heldHand : which;
    this.input.haptic(hand, intensity, ms);
  }

  openRifts(names) {
    for (const n of names) {
      const r = this.room.rifts[n];
      if (r.target < 1) {
        r.setOpen(1);
        this.sfx.play('rift', this.worldPos(r.position), { vol: 0.6, reverb: 0.4 });
      }
    }
  }

  closeRifts(except = []) {
    for (const [n, r] of Object.entries(this.room.rifts)) if (!except.includes(n)) r.setOpen(0);
  }

  hasHostiles() {
    return this.pendingSpawns > 0 || this.enemies.some((e) => e.alive) || this.swarm.active;
  }

  // ------------------------------------------------------------------ flow

  toTitle() {
    this.state = 'title';
    this._resetWorld();
    this.ship.reset();
    this.ship.setPose(this.restPose.pos, this.restPose.quat);
    this.hud.showPanel('title', { hiScore: this.hiScore });
    this.waveLabel = '';
    this.screens.setOn(0);
    this.room.dimTarget = 0.15;
  }

  _resetWorld() {
    this.scheduler.cancelAll();
    this.pendingSpawns = 0;
    for (const e of this.enemies) e.remove();
    this.enemies.length = 0;
    this.swarm.clear();
    for (const p of this.pickups) this.arena.remove(p.group);
    this.pickups.length = 0;
    this.bullets.clear();
    this.lasers.clear();
    this.shots.clear();
    this.fx.clear();
    if (this.boss) { this.boss.dispose(); this.boss = null; }
    this.closeRifts();
    this.room.dimTarget = 0;
    this.slowmoTarget = 1;
    this.slowmo = 1;
    this.bomb = null;
    this.bombMesh.visible = false;
  }

  startGame(fromWave = 0, keepScore = false) {
    this._resetWorld();
    if (!keepScore) {
      this.bossStartPhase = 0;
      this.score = 0;
      this.stats = { kills: 0, deaths: 0, bombsUsed: 0, started: this.time, noMissWaves: 0 };
      this.grazes = 0;
      this.maxChain = 0;
      this.continues = 0;
      this.nextExtend = 0;
    }
    const keepPower = keepScore ? { level: this.ship.level, options: this.ship.optionCount } : null;
    this.ship.reset();
    if (keepPower) { this.ship.level = Math.max(2, keepPower.level); this.ship.optionCount = Math.max(1, keepPower.options); }
    this.ship.held = !!this.heldHand;
    this.ship.invuln = 1.5;
    this.chain = 0;
    this.chainMult = 1;
    this.state = 'playing';
    this.pauseScale = 1;
    this.hud.hidePanel();
    // lights down: the room dims and your walls power up into arena screens
    this.room.dimTarget = 0.5;
    this.screens.setOn(1);
    this.screens.setMode('wave');
    this.waveIndex = fromWave;
    this.music.play('stage', 'build');
    this.boss = new Gyre(this);
    const startAt = Math.min(fromWave, WAVES.length);
    this.stageTask = this.scheduler.start(this._stageRunner(startAt));
  }

  *_stageRunner(startAt) {
    yield* stage(this, startAt);
    this.victory();
  }

  beginWave(w) {
    this.waveIndex = WAVES.indexOf(w);
    this.waveLabel = `WAVE ${w.id}`;
    this.waveHit = false;
    this.hud.showBanner(`WAVE ${w.id}`, w.name, 'wave', 2.4);
    this.screens.setMode('wave');
    this.screens.announce(`WAVE ${w.id}`, w.name, 4);
    this.sfx.play('ui', null, { vol: 0.8 });
    this.music.arrange(w.id >= 3 ? 'waveLead' : 'wave');
    if (w.id === 1) {
      this.scheduler.start((function* (g) {
        yield 0.5;
        g._hintOnce('fire', 'HOLD TRIGGER TO FIRE', 4);
        yield 6.5;
        yield 14;
        g._hintOnce('bomb', 'A / X: SINGULARITY BOMB', 4);
      })(this));
    }
  }

  endWave(w) {
    const bonus = this.waveHit ? 5000 * w.id : 20000 * w.id;
    this.addScore(bonus, null);
    if (!this.waveHit) this.stats.noMissWaves++;
    this.hud.showBanner(`WAVE ${w.id} CLEAR`, this.waveHit ? `BONUS ${fmt(bonus)}` : `NO DAMAGE  ·  BONUS ${fmt(bonus)}`, 'clear', 3.2);
    this.music.jingle('clear');
    this.music.arrange('breather');
    this.screens.setMode('clear');
    this.screens.announce('CLEAR', `BONUS ${fmt(bonus)}`, 4);
    this.closeRifts();
    this.bullets.cancelAll(true);
    // a reward drifts out of the front rift during the breather
    const r = this.room.rifts.front;
    r.setOpen(0.45);
    this.scheduler.start((function* (g) {
      yield 1.2;
      const p = r.mouth(new THREE.Vector3(), 0.1);
      g.spawnPickup(chooseCapsule(g.ship), p);
      yield 1.5;
      r.setOpen(0);
    })(this));
  }

  beginBossWarning() {
    this.waveLabel = 'WARNING';
    this.hud.showBanner('WARNING', 'A HUGE RIFT SIGNATURE IS APPROACHING', 'warning', 5);
    this.music.arrange('bossIntro');
    this.room.dimTarget = 0.78;
    this.screens.setMode('warning');
    this.screens.announce('WARNING', 'HUGE SIGNATURE', 5.5);
    this.closeRifts(['boss']);
    this.room.rifts.boss.setOpen(1);
    this.scheduler.start((function* (g) {
      for (let i = 0; i < 3; i++) {
        g.sfx.play('warning', null, { vol: 0.75, reverb: 0.3, minGap: 0 });
        g.haptic(0.25, 120, 'both');
        yield 1.5;
      }
    })(this));
    this.sfx.play('rift', this.worldPos(this.room.rifts.boss.position), { vol: 1.4, reverb: 0.7 });
  }

  onBossReady() {
    this.waveLabel = 'THE GYRE';
    this.hud.showBanner('THE GYRE', 'RIFT SENTINEL  ·  DESTROY THE CROWN', 'boss', 3);
    this.music.play('boss', 'boss');
    this.screens.setMode('boss');
    this.screens.announce('THE GYRE', 'RIFT SENTINEL', 3);
    this.room.rifts.boss.setOpen(0.55);
  }

  onBossPhase(i) {
    if (i === 1) {
      this.hud.showBanner('LATTICE', 'BREAK THE PRISM EMITTERS', 'boss', 2.6);
    } else if (i === 2) {
      this.hud.showBanner('THE HEART IS OPEN', 'FLY INTO ITS GAZE  ·  SHOOT THROUGH THE EYE', 'boss', 3.2);
      this.scheduler.start((function* (g) {
        yield 3.4;
        g._hintOnce('eye', 'STAY INSIDE THE CONE OF FIRE', 4);
      })(this));
    }
  }

  onBossRage() {
    this.music.arrange('bossRage');
    this.hud.showBanner('CRITICAL', 'THE GYRE IS ENRAGED', 'boss', 1.8);
    this.room.flashView(0.2, 0xff2244);
  }

  onBossFinal() {
    this.sfx.play('warning', null, { vol: 0.6 });
  }

  onBossPartDestroyed(part) {
    this.addScore(part.score, part.pos, true);
    this.fx.explode(part.pos, 4, { chunkColor: PALETTE.bossMetal, hot: COLORS.amber, cool: COLORS.magenta });
    this.fx.sparks(part.pos, 40, COLORS.amber, 1.0);
    this.sfx.play('boom', this.worldPos(part.pos), { vol: 1.2, reverb: 0.5 });
    this.sfx.play('armorBreak', this.worldPos(part.pos), { vol: 0.8 });
    this.bullets.cancelRadius(part.pos.x, part.pos.y, part.pos.z, 0.45, true);
    this.haptic(0.8, 140);
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.room.flashView(0.12, 0xffaa55);
  }

  onBossDying() {
    this.slowmoTarget = 0.3;
    this.bullets.cancelAll(true);
    this.music.arrange('silent');
    this.hud.showBanner('', '', 'boss', 0.01);
  }

  onBossExploded(pos) {
    this.slowmoTarget = 1;
    this.room.flashView(1.2);
    this.room.dimTarget = 0.35;
    this.screens.setMode('clear');
    this.closeRifts();
    this.sfx.play('bigboom', this.worldPos(pos), { vol: 1.6, reverb: 0.9 });
    this.haptic(1.0, 700, 'both');
    this.fx.explode(pos, 9, { chunkColor: PALETTE.bossGold });
    for (let i = 0; i < 4; i++) this.fx.ring(pos, 1.2 + i * 0.9, i % 2 ? COLORS.amber : COLORS.magenta, 0.7 + i * 0.25, 0.9);
    this.fx.chunks(pos, 60, PALETTE.bossMetal, 0.016, 1.2);
    this.fx.chunks(pos, 30, PALETTE.bossGold, 0.012, 1.4);
    this.fx.sparks(pos, 200, COLORS.amber, 1.6, { lifeScale: 2.5 });
    this.fx.smoke(pos, 20, 0.12, { lifeScale: 2 });
    this.addScore(100000, pos, true);
  }

  victory() {
    this.state = 'victory';
    this.waveLabel = 'CLEAR';
    const lifeBonus = this.ship.lives * 50000;
    const bombBonus = this.ship.bombs * 10000;
    this.addScore(lifeBonus + bombBonus, null);
    const newHigh = this.score > this.hiScore;
    if (newHigh) { this.hiScore = Math.floor(this.score); saveHi(this.hiScore); }
    const secs = Math.round(this.time - this.stats.started);
    this.hud.showPanel('results', {
      score: this.score, newHigh, prompt: 'POINT AT THE MENU AND PULL THE TRIGGER',
      rows: [
        ['DIFFICULTY', difficulty().label],
        ['TIME', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
        ['BEST CHAIN', `${this.maxChain} kills  ·  ×${chainMultiplier(this.maxChain)}`],
        ['GRAZES', `${this.grazes}`],
        ['SHIPS LEFT', `${this.ship.lives} × 50,000`],
        ['BOMBS LEFT', `${this.ship.bombs} × 10,000`],
      ],
    });
    this.music.jingle('victory');
    this.screens.setMode('clear');
    this.screens.announce('STAGE CLEAR', `SCORE ${fmt(this.score)}`, 600);
    this.music.play('stage', 'title');
    this.scheduler.start((function* (g) {
      yield 1.5;
      g.restReady = true;
    })(this));
  }

  gameOver() {
    this.state = 'gameover';
    this.waveLabel = 'GAME OVER';
    const newHigh = this.score > this.hiScore;
    if (newHigh) { this.hiScore = Math.floor(this.score); saveHi(this.hiScore); }
    const atBoss = this.boss && this.boss.phase !== 'dormant';
    this.continueFrom = atBoss ? WAVES.length : this.waveIndex;
    // continuing at the boss resumes the phase you reached
    this.bossStartPhase = atBoss ? Math.min(2, this.boss.phaseIndex) : 0;
    this.hud.showPanel('gameover', {
      score: this.score, newHigh,
      prompt: 'POINT AT THE MENU AND PULL THE TRIGGER',
      rows: [
        ['REACHED', atBoss ? 'THE GYRE' : `WAVE ${this.waveIndex + 1}`],
        ['BEST CHAIN', `${this.maxChain} kills`],
        ['GRAZES', `${this.grazes}`],
      ],
    });
    if (this.stageTask) this.stageTask.cancel();
    if (this.boss) this.boss._newOwner(); // the sentinel stops firing at the wreck
    this.closeRifts();
    this.room.dimTarget = 0.35;
    this.screens.setMode('idle');
    this.screens.announce('GAME OVER', '', 600);
    this.music.jingle('gameover');
    this.music.play('stage', 'title');
    this.lasers.clear();
    this.restReady = false;
    this.scheduler.start((function* (g) {
      yield 1.2;
      g.restReady = true;
    })(this));
  }

  _hintOnce(key, text, dur = 3) {
    if (this.hintsShown[key]) return;
    this.hintsShown[key] = true;
    this.hud.showHint(text, dur);
  }

  // ------------------------------------------------------------------ scoring & feedback

  addScore(points, pos, big = false) {
    const before = this.score;
    this.score += points;
    if (pos) this.hud.popup(fmt(points), pos, big ? '#fff2a0' : '#ffffff', big ? '#ff9a1a' : '#ff3df0', big ? 1.8 : 1);
    for (const e of EXTENDS) {
      if (before < e && this.score >= e) {
        this.ship.lives++;
        this.sfx.play('extend', null, { vol: 1 });
        this.hud.showHint('EXTEND! +1 SHIP', 2.5);
        this.haptic(0.5, 120);
      }
    }
  }

  onEnemyDamaged(e, dmg, point) {
    const p = point || e.pos;
    // every hit lands visibly: a bright impact flare and a few sparks
    this.fx.spawn({ x: p.x, y: p.y, z: p.z, life: 0.07, size: 0.028, size1: 0.012, color: COLORS.white, color1: COLORS.cyan, shape: SHAPE.STAR, additive: 0.85, rot: Math.random() * 3 });
    this.fx.sparks(p, 3, COLORS.cyan, 0.45, { sizeScale: 0.8, lifeScale: 0.5 });
    this.sfx.play('hit', this.worldPos(p), { vol: 0.35, minGap: 0.04 });
    if (e.kind === 'pod' || e.kind === 'emitter' || e.kind === 'core') this.score += Math.round(dmg * 10);
  }

  onEnemyKilled(e) {
    this.stats.kills++;
    this.chain++;
    this.chainTimer = 1.4;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.chainMult = chainMultiplier(this.chain);
    this.addScore(e.score * this.chainMult, e.pos, e.score >= 1000);
    const scale = e.explodeScale ?? 1;
    this.fx.explode(e.pos, scale, { chunkColor: scale > 1 ? PALETTE.enemyHull : PALETTE.enemyTrim });
    const wp = this.worldPos(e.pos);
    this.sfx.play(scale >= 2 ? 'boom' : 'pop', wp, { vol: scale >= 2 ? 1 : 0.7, rate: scale >= 2 ? 1 : 1.1 });
    this.haptic(scale >= 2 ? 0.55 : 0.18, scale >= 2 ? 90 : 25);
    if (scale >= 2) this.hitstop = Math.max(this.hitstop, 0.05);
    if (e.cancelRadius) this.bullets.cancelRadius(e.pos.x, e.pos.y, e.pos.z, e.cancelRadius, true);
    if (e.dropCapsule) {
      for (let i = 0; i < (e.drops || 1); i++) this.spawnPickup(chooseCapsule(this.ship), e.pos.clone().add(_v.set(rand(-0.04, 0.04), rand(-0.04, 0.04), 0)));
    }
    if (e.formation) {
      e.formation.killed++;
      if (e.formation.killed === e.formation.total) {
        this.spawnPickup(chooseCapsule(this.ship), e.pos.clone());
        this.hud.popup('FORMATION BONUS', e.pos.clone().add(_v.set(0, 0.04, 0)), '#ffe066', '#ff9a1a', 1.2);
        this.addScore(2000, null);
      }
    }
  }

  spawnPickup(type, pos) {
    this.pickups.push(new Pickup(this, type, pos));
    this.sfx.play('drop', this.worldPos(pos), { vol: 0.7 });
  }

  onPickup(p) {
    const ship = this.ship;
    let title = CAPSULES[p.type].name, what = '';
    let ok = true;
    if (p.type === 'P') {
      ok = ship.addLevel();
      title = ['', 'TWIN BLASTER', 'SPREAD SHOT', 'HOMING SEEKERS', 'MAX POWER'][ship.level];
      what = ['', '', 'extra angled shots', 'missiles hunt the nearest enemy', 'heavy bolts, 5-way spread'][ship.level];
    } else if (p.type === 'O') {
      ok = ship.addOption();
      title = `OPTION DRONE ×${ship.optionCount}`;
      what = 'trails your path and copies your fire';
    } else if (p.type === 'S') {
      ok = !ship.shield;
      ship.shield = true;
      what = 'blocks one hit';
    } else if (p.type === 'B') {
      ship.bombs = Math.min(9, ship.bombs + 1);
      what = 'press A / X to clear the screen';
    }
    if (!ok) { title = 'BONUS +5,000'; what = ''; this.score += 5000; }
    this.hud.showHint(what ? `${title}  —  ${what}` : title, 2.6);
    this.hud.popup(title, p.pos.clone().add(_v.set(0, 0.03, 0)), CAPSULES[p.type].css, '#ffffff', 1.1);
    this.sfx.play(p.type === 'S' ? 'shield' : 'powerup', null, { vol: 0.9 });
    this.fx.ring(p.pos, 0.1, COLORS.gold, 0.35);
    this.fx.sparks(p.pos, 14, COLORS.gold, 0.5, { gravity: 0 });
    this.haptic(0.4, 60);
  }

  shipHit() {
    const ship = this.ship;
    if (!ship.vulnerable || this.state !== 'playing') return;
    this.waveHit = true;
    if (ship.shield) {
      ship.shield = false;
      ship.invuln = 1.3;
      this.bullets.cancelRadius(ship.pos.x, ship.pos.y, ship.pos.z, 0.16, true);
      this.sfx.play('shieldBreak', null, { vol: 1 });
      this.fx.ring(ship.pos, 0.18, COLORS.cyan, 0.35);
      this.fx.sparks(ship.pos, 30, COLORS.cyan, 0.7);
      this.haptic(0.9, 120);
      this.hitstop = 0.12;
      return;
    }
    this.stats.deaths++;
    ship.kill();
    ship.lives--;
    this.chain = 0;
    this.chainMult = 1;
    this.fx.explode(ship.pos, 3, { chunkColor: PALETTE.playerHull, hot: COLORS.white, cool: COLORS.cyan });
    this.fx.sparks(ship.pos, 50, COLORS.cyan, 1.0);
    this.sfx.play('death', null, { vol: 1.1 });
    this.haptic(1.0, 300);
    this.hitstop = 0.35;
    this.room.flashView(0.35, 0xff2040);
    this.bullets.cancelAll(false);
    for (const l of this.lasers.items) if (l.state !== 'fade') { l.state = 'fade'; l.t = 0; }
    if (ship.lives <= 0) {
      this.scheduler.start((function* (g) {
        yield 1.4;
        g.gameOver();
      })(this));
    }
  }

  onGraze() {
    this.grazes++;
    this.score += 20;
    this.sfx.play('graze', null, { vol: 0.8, minGap: 0.03 });
    this.haptic(0.08, 8);
    const s = this.ship.pos;
    this.fx.spawn({ x: s.x + rand(-0.01, 0.01), y: s.y + rand(-0.01, 0.01), z: s.z, vx: rand(-0.2, 0.2), vy: rand(0, 0.3), vz: rand(-0.2, 0.2), life: 0.25, size: 0.006, size1: 0.001, color: COLORS.white, color1: COLORS.cyan, shape: SHAPE.SPARK, additive: 0.7, stretch: 0.03 });
  }

  useBomb() {
    const ship = this.ship;
    if (this.state !== 'playing' || ship.dead || ship.bombs <= 0 || this.bomb) return;
    ship.bombs--;
    this.stats.bombsUsed++;
    ship.invuln = Math.max(ship.invuln, 2.6);
    this.bomb = { t: 0, origin: ship.pos.clone(), hit: new Set() };
    this.sfx.play('bomb', null, { vol: 1.1 });
    this.haptic(1, 220, 'both');
    this.room.flashView(0.45, 0xff40e0);
    for (const l of this.lasers.items) if (l.state !== 'fade') { l.state = 'fade'; l.t = 0; }
    this.fx.flash(ship.pos, 0.3, COLORS.magenta, 0.25);
  }

  _buildBombVisual() {
    this.bombMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 3),
      new THREE.MeshBasicMaterial({ color: 0xff5af0, wireframe: true, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
    );
    this.bombMesh.visible = false;
    this.arena.add(this.bombMesh);
  }

  _buildGrabHalo() {
    // pulsing ring around the resting ship that invites the player to grab it
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.0025, 6, 48), new THREE.MeshBasicMaterial({ color: 0x55eaff, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
    this.halo.rotation.x = Math.PI / 2;
    this.arena.add(this.halo);
  }

  _updateBomb(dt) {
    const b = this.bomb;
    if (!b) return;
    b.t += dt;
    const k = Math.min(1, b.t / 0.9);
    const r = 0.04 + 3.0 * (1 - Math.pow(1 - k, 2.4));
    this.bombMesh.visible = true;
    this.bombMesh.position.copy(b.origin);
    this.bombMesh.scale.setScalar(r);
    this.bombMesh.rotation.y += dt * 1.5;
    this.bombMesh.material.opacity = 0.55 * (1 - k);
    this.bullets.cancelRadius(b.origin.x, b.origin.y, b.origin.z, r, true);
    for (const t of this.targets) {
      if (!t.alive || b.hit.has(t)) continue;
      if (t.pos.distanceTo(b.origin) < r) {
        b.hit.add(t);
        t.damage(t.kind === 'pod' || t.kind === 'emitter' || t.kind === 'core' ? 45 : 30, t.pos);
      }
    }
    if (Math.random() < 0.8) this.fx.ring(b.origin, r * 1.05, COLORS.magenta, 0.15, 0.4 * (1 - k));
    if (b.t > 1.0) {
      this.bomb = null;
      this.bombMesh.visible = false;
    }
  }

  // ------------------------------------------------------------------ aim assist

  aimAssist(origin, dir) {
    let best = null, bestDot = Math.cos(0.13);
    for (const t of this.targets) {
      if (!t.alive) continue;
      const p = t.aimPoint ? t.aimPoint(_v) : _v.copy(t.pos);
      const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
      const l = Math.hypot(dx, dy, dz);
      if (l < 0.05 || l > 3.2) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / l;
      if (dot > bestDot) { bestDot = dot; best = _v2.set(dx / l, dy / l, dz / l); }
    }
    if (!best) return dir;
    return best.lerp(dir, 0.35).normalize().clone();
  }

  findMissileTarget(s) {
    let best = null, bestScore = -Infinity;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const p = t.pos;
      const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
      const l = Math.hypot(dx, dy, dz);
      if (l > 3) continue;
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
      const ahead = (dx * s.vx + dy * s.vy + dz * s.vz) / (l * sp);
      const score = ahead * 2 - l + (t.kind === 'core' ? -5 : 0);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------------ frame

  /**
   * frame: { head: {position, quaternion} (world),
   *          hands: { left|right: { grip: {position, quaternion}, ray: {quaternion}, squeeze, trigger, buttons:{a,b,stick}, edges } } }
   */
  update(realDt, frame) {
    realDt = Math.min(realDt, 1 / 20);
    this.time += realDt;
    this.audio.tick();

    // head
    if (frame.head) {
      this.headWorld.copy(frame.head.position);
      this.headLocal.copy(frame.head.position);
      this.arena.worldToLocal(this.headLocal);
      this.sfx.updateListener(_m.compose(frame.head.position, frame.head.quaternion, _v.set(1, 1, 1)));
    }
    this.bullets.headPos.copy(this.headLocal);
    this.lasers.headPos.copy(this.headLocal);
    this.room.headLocal.copy(this.headLocal);

    this._handleHands(realDt, frame);
    this._syncMenu();

    // time scaling: pause, hit-stop, slow motion
    const paused = this.state === 'paused';
    this.pauseScale += ((paused ? 0 : 1) - this.pauseScale) * (1 - Math.exp(-(paused ? 14 : 5) * realDt));
    if (!paused && this.pauseScale > 0.98) this.pauseScale = 1;
    this.slowmo += (this.slowmoTarget - this.slowmo) * (1 - Math.exp(-6 * realDt));
    let scale = this.pauseScale * this.slowmo;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      scale *= 0.08;
    }
    scale *= this.options.speed || 1;
    const dt = realDt * scale;
    this.dt = dt;
    this.music.setMuffle(paused ? 0.75 : this.slowmo < 0.9 ? 0.5 : 0);

    // gather targets
    this.targets.length = 0;
    for (const e of this.enemies) if (e.alive) this.targets.push(e);
    for (const m of this.swarm.mites) if (m.alive) this.targets.push(m);
    if (this.boss) for (const p of this.boss.targets()) this.targets.push(p);

    const playing = this.state === 'playing' || this.state === 'paused';
    const ship = this.ship;
    const shipCtx = {
      firing: this.state === 'playing' && this.pauseScale > 0.9 && !ship.dead,
      aimAssist: (o, d) => this.aimAssist(o, d),
      haptic: (i, ms) => this.haptic(i, ms),
      headWorld: this.headWorld,
      headLocal: this.headLocal,
    };
    const heldInput = this.heldHand ? frame.hands[this.heldHand] : null;
    ship.update(dt, { trigger: !!(heldInput && heldInput.trigger > 0.5) }, shipCtx);

    if (playing && ship.dead && ship.deadTimer <= 0 && ship.lives > 0) {
      ship.respawn();
      this.bullets.cancelRadius(ship.pos.x, ship.pos.y, ship.pos.z, 0.35, false);
      this.fx.ring(ship.pos, 0.12, COLORS.cyan, 0.4);
      this.sfx.play('grab', null, { vol: 0.8 });
    }

    this.scheduler.update(dt);

    for (const e of this.enemies) if (e.alive) e.update(dt);
    if (this.enemies.length > 40 || this.time % 1 < realDt) this.enemies = this.enemies.filter((e) => e.alive);
    this.swarm.update(dt);
    if (this.boss) this.boss.update(dt);

    // player shots vs targets / armour
    this.shots.update(dt, this.fx, (s) => this.findMissileTarget(s));
    for (const s of this.shots.live) {
      if (s.dead) continue;
      for (const t of this.targets) {
        if (!t.alive) continue;
        if (s.hits && s.hits.has(t)) continue;
        if (t.testShot(s) === 'hit') {
          t.damage(s.dmg, _v.set(s.x, s.y, s.z));
          if (s.pierce) s.hits.add(t);
          else { s.dead = true; break; }
        }
      }
      if (!s.dead && this.boss && this.boss.testArmor(s) === 'armor') {
        s.dead = true;
        const hp = s.hitPoint || s;
        _v.set(hp.x, hp.y, hp.z);
        this.fx.sparks(_v, s.kind === 'wave' ? 18 : 2, COLORS.white, 0.5, { lifeScale: 0.5, sizeScale: 0.8 });
        this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, life: 0.08, size: s.kind === 'wave' ? 0.08 : 0.018, color: COLORS.white, shape: SHAPE.STAR, additive: 0.7 });
        this.sfx.play('tink', this.worldPos(_v), { vol: 0.25, minGap: 0.07 });
      }
    }

    // enemy fire vs ship
    const shipState = {
      x: ship.pos.x, y: ship.pos.y, z: ship.pos.z,
      radius: SHIP.hitRadius, grazeRadius: SHIP.grazeRadius,
      vulnerable: ship.vulnerable && this.state === 'playing' && !(this.options.god),
      active: ship.active && this.state === 'playing',
      present: !ship.dead && (this.state === 'playing' || this.state === 'victory'),
    };
    this.bullets.update(dt, shipState, {
      onHit: () => this.shipHit(),
      onGraze: () => this.onGraze(),
      onStar: () => {
        this.score += 100;
        this.sfx.play('coin', null, { vol: 0.5, minGap: 0.035 });
      },
    });
    this.lasers.update(dt, shipState, { onHit: () => this.shipHit(), onGraze: () => this.onGraze() });

    // body contact
    if (shipState.vulnerable && shipState.active) {
      for (const t of this.targets) {
        if (!t.alive || !t.contact) continue;
        const r = t.radius * 0.8 + SHIP.hitRadius;
        if (t.pos.distanceToSquared(ship.pos) < r * r) {
          this.shipHit();
          if (t.kind === 'mite' || t.kind === 'dart' || t.kind === 'hornet' || t.kind === 'mine') t.kill();
          break;
        }
      }
    }

    // pickups
    let w = 0;
    for (const p of this.pickups) {
      p.update(dt);
      if (p.alive) this.pickups[w++] = p;
    }
    this.pickups.length = w;

    this._updateBomb(dt);

    // chain decay
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) { this.chain = 0; this.chainMult = 1; }
    }

    this.fx.update(dt);
    this.screens.update(realDt);
    this.room.update(realDt * (this.options.speed || 1), ship.pos, this.state === 'playing' || this.state === 'paused');

    // grab halo (when the ship is waiting to be picked up)
    const waiting = !this.heldHand;
    this.halo.visible = waiting && !ship.dead;
    if (this.halo.visible) {
      this.halo.position.copy(ship.pos);
      const s = 1 + 0.15 * Math.sin(this.time * 4);
      this.halo.scale.setScalar(s);
      this.halo.material.opacity = 0.5 + 0.3 * Math.sin(this.time * 4);
    }
    if (this.state === 'title' && !this.heldHand) {
      // idle hover
      _v.copy(this.restPose.pos);
      _v.y += Math.sin(this.time * 1.6) * 0.008;
      _q.setFromAxisAngle(_v2.set(0, 1, 0), Math.sin(this.time * 0.7) * 0.5);
      ship.setPose(_v, _q);
    }

    const off = this.heldHand ? (this.heldHand === 'left' ? 'right' : 'left') : null;
    const offHand = off && frame.hands[off];
    this.hud.update(realDt, {
      showStrip: this.state === 'playing' || this.state === 'paused',
      wristPose: offHand && offHand.grip && this.state === 'playing' ? offHand.grip : null,
    });

    // render buffers
    this.fx.render();
    this.bullets.render(shipState);
    this.shots.render();
    this.lasers.render();
    this.swarm.render();
  }

  _handleHands(realDt, frame) {
    const hands = frame.hands || {};
    const ship = this.ship;

    // --- the pointable menu (pause / title / end screens) takes the trigger while it is open
    if (this.menu.visible) {
      const pointers = [];
      for (const [name, h] of Object.entries(hands)) {
        if (h && h.ray && h.ray.position && h.tracked !== false) pointers.push({ hand: name, origin: h.ray.position, quaternion: h.ray.quaternion, select: h.edges.trigger, hold: h.trigger > 0.5 });
      }
      if (frame.pointer) pointers.push(frame.pointer);
      if (this.menu.update(realDt, pointers)) return;
    }

    // --- buttons that work anywhere
    for (const [name, h] of Object.entries(hands)) {
      if (!h || !h.edges) continue;
      if (h.edges.stick && this.state !== 'playing') this.recenter(frame.head);
      if (h.edges.b) {
        // B / Y opens and closes the menu
        if (this.state === 'playing') { this._pause(); return; }
        if (this.state === 'paused' && this.heldHand) { this._resume(); return; }
      }
      if (this.state === 'playing' && this.heldHand && h.edges.a) this.useBomb();
    }

    // --- holding
    if (this.heldHand) {
      const h = hands[this.heldHand];
      if (!h || !h.grip) return; // tracking lost: keep last pose
      if (h.squeeze < 0.35) {
        this._release();
        return;
      }
      this._poseFromHand(h, _v, _q);
      if (this.snap > 0) {
        // a quick snap into the hand when first grabbed (only at grab time)
        this.snap = Math.max(0, this.snap - realDt);
        const k = 1 - this.snap / 0.08;
        _v.lerpVectors(this.snapFrom, _v, k);
      }
      ship.setPose(_v, _q);
      return;
    }

    // --- not holding: look for a grab
    for (const [name, h] of Object.entries(hands)) {
      if (!h || !h.grip) continue;
      this._poseFromHand(h, _v, _q);
      const d = _v.distanceTo(ship.pos);
      if (h.edges && h.edges.squeeze && d < 0.3) {
        this._grab(name);
        return;
      }
      // force-pull: holding grip far away draws the ship toward the hand
      if (h.squeeze > 0.6 && d >= 0.3 && (this.state === 'title' || this.state === 'paused')) {
        _v2.subVectors(_v, ship.pos);
        const step = Math.min(d, 1.8 * realDt);
        _v2.setLength(step);
        ship.pos.add(_v2);
        if (d < 0.32) { this._grab(name); return; }
      }
    }
  }

  _poseFromHand(h, outPos, outQuat) {
    const q = (h.ray || h.grip).quaternion;
    outQuat.copy(q);
    outPos.copy(GRIP_OFFSET).applyQuaternion(q).add(h.grip.position);
    // to arena-local
    this.arena.worldToLocal(outPos);
    _q2.copy(this.arena.quaternion).invert();
    outQuat.premultiply(_q2);
  }

  _grab(name) {
    this.heldHand = name;
    this.ship.held = true;
    this.snap = 0.08;
    this.snapFrom = this.ship.pos.clone();
    this.sfx.play('grab', null, { vol: 0.9 });
    this.haptic(0.5, 50);
    if (this.state === 'title') {
      this.startGame(Math.max(0, this.options.wave || 0));
    } else if (this.state === 'paused') {
      this._resume();
    }
  }

  _release() {
    this.haptic(0.2, 30);
    this.heldHand = null;
    this.ship.held = false;
    this.sfx.play('release', null, { vol: 0.7 });
    if (this.state === 'playing') this._pause();
  }

  _pause() {
    this.state = 'paused';
    this.sfx.play('release', null, { vol: 0.6 });
  }

  _resume() {
    this.state = 'playing';
    this.ship.invuln = Math.max(this.ship.invuln, 0.8);
    this.menu.hide();
    this.menuKey = '';
  }

  /** Put the ship in the given hand without the title/pause side effects of _grab. */
  _attach(hand) {
    if (hand === 'mouse') hand = 'right';
    if (!this.heldHand) {
      this.heldHand = hand;
      this.ship.held = true;
      this.snap = 0.08;
      this.snapFrom = this.ship.pos.clone();
    }
    this.input.requestHold && this.input.requestHold();
  }

  get muted() { return this.audioSettings.muted; }

  toggleMute() {
    this.audioSettings.muted = !this.audioSettings.muted;
    saveAudioSettings(this.audioSettings);
    this.applyAudioSettings();
    this.menuKey = '';
  }

  /** kind: 'music' | 'effects'; v: 0..1 */
  setVolume(kind, v) {
    const s = this.audioSettings;
    v = Math.min(1, Math.max(0, v));
    if (s[kind] === v) return;
    s[kind] = v;
    saveAudioSettings(s);
    this.applyAudioSettings();
  }

  /** Pushes the player's audio settings to the mixer (muted silences both). */
  applyAudioSettings() {
    const s = this.audioSettings;
    this.music.setVolume(s.muted ? 0 : s.music);
    this.sfx.setVolume(s.muted ? 0 : s.effects);
  }

  _menuSpec() {
    const sound = [
      { type: 'slider', label: 'MUSIC', get: () => this.audioSettings.music, set: (v) => this.setVolume('music', v) },
      { type: 'slider', label: 'EFFECTS', get: () => this.audioSettings.effects, set: (v) => this.setVolume('effects', v) },
      { label: this.muted ? 'SOUND: OFF' : 'SOUND: ON', action: () => this.toggleMute() },
    ];
    const exit = { label: 'EXIT GAME', danger: true, action: () => this.onExit && this.onExit() };
    const diff = { label: `DIFFICULTY: ${difficulty().label}`, action: () => { nextDifficulty(); this.menuKey = ''; } };
    if (this.state === 'paused') {
      return ['PAUSED', [
        { label: 'RESUME', action: (hand) => { if (!this.heldHand) this._grab(hand === 'mouse' ? 'right' : hand); else this._resume(); this.input.requestHold && this.input.requestHold(); } },
        { label: 'RESTART STAGE', action: (hand) => { this._attach(hand); this.startGame(0); } },
        ...sound, exit,
      ], 'center'];
    }
    if (this.state === 'title') return ['OPTIONS', [diff, ...sound, exit], 'side'];
    if (this.state === 'gameover' && this.restReady) {
      const from = this.continueFrom >= WAVES.length ? 'THE GYRE' : `WAVE ${this.continueFrom + 1}`;
      return ['GAME OVER', [
        { label: `CONTINUE (${from})`, action: (hand) => { this._attach(hand); this.continues++; this.score = 0; this.startGame(this.continueFrom, true); } },
        { label: 'RESTART STAGE', action: (hand) => { this._attach(hand); this.startGame(0); } },
        diff,
        exit,
      ], 'side'];
    }
    if (this.state === 'victory' && this.restReady) {
      return ['WELL DONE', [{ label: 'PLAY AGAIN', action: (hand) => { this._attach(hand); this.startGame(0); } }, diff, ...sound, exit], 'side'];
    }
    return null;
  }

  _syncMenu() {
    const spec = this._menuSpec();
    const key = spec ? `${spec[0]}|${spec[1].map((i) => i.label).join(',')}` : '';
    if (key === this.menuKey) return;
    this.menuKey = key;
    if (spec) this.menu.show(...spec);
    else this.menu.hide();
  }

  recenter(head) {
    if (!head) return;
    this.room.placeFromHead(head.position, head.quaternion);
    this.hud.retilt();
    this.sfx.play('ui', null, { vol: 1 });
  }
}

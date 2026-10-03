// All combat coordinates are 2D. Depth belongs exclusively to presentation.
export const FIELD = { left: -8, right: 8, bottom: -4.5, top: 4.5 };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function segmentHits(ax, ay, bx, by, x, y, radius) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(ax + dx * t - x, ay + dy * t - y) <= radius;
}
export class Game {
  constructor(seed = 42) { this.initialSeed = seed; this.reset(); }
  reset() {
    this.seed = this.initialSeed; this.nextId = 1; this.time = 0; this.state = 'playing';
    this.player = { x: -4.8, y: 0, r: .09, hp: 5, shield: 0, invincible: 2, weapon: 'PULSE', level: 1, echo: false, charge: 0, cooldown: 0 };
    this.enemies = []; this.shots = []; this.pickups = []; this.effects = []; this.events = [];
    this.score = 0; this.bombs = 2; this.kills = 0; this.wave = 0; this.nextWave = 2; this.nextPickup = 9; this.pickupCycle = 0;
    this.miniSpawned = false; this.bossSpawned = false; this.boss = null; this.bombWasDown = false;
    this.announce('THE GLASS TIDE', 'Hold the line. Right trigger to fire.');
  }
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  announce(title, subtitle = '') { this.emit('announce', { title, subtitle }); }
  drainEvents() { const out = this.events; this.events = []; return out; }
  addShot(x, y, vx, vy, hostile, damage = 1, kind = 'pulse', r = .08) {
    if (this.shots.length >= 450) return;
    this.shots.push({ id: this.nextId++, x, y, px: x, py: y, vx, vy, hostile, damage, kind, r, life: 10 });
  }
  burst(x, y, color, size = 1) { this.emit('burst', { x, y, color, size }); }
  spawnEnemy(type, y, index = 0) {
    const heavy = type === 'sentinel' || type === 'carrier';
    this.enemies.push({ id: this.nextId++, type, x: 8.7 + index * .7, y, homeY: y, age: 0, r: heavy ? .34 : .21,
      hp: type === 'carrier' ? 12 : heavy ? 7 : type === 'dart' ? 2 : 3, fire: 1.4 + index * .3, entry: .65,
      speed: type === 'dart' ? 2.8 : heavy ? .85 : 1.35, phase: index * .55 });
  }
  spawnWave() {
    this.wave++; const y = (this.random() - .5) * 5.8;
    const types = this.time < 25 ? ['drone', 'drone', 'dart'] : ['drone', 'dart', 'sentinel', 'weaver', 'carrier'];
    const type = types[this.wave % types.length];
    const count = type === 'sentinel' || type === 'carrier' ? 2 : 5;
    for (let i = 0; i < count; i++) this.spawnEnemy(type, clamp(y + (i - count / 2) * .48, -3.8, 3.8), i);
    if (this.time > 115 && this.wave % 2 === 0) this.spawnEnemy('sentinel', -y);
  }
  spawnBoss(mini = false) {
    const boss = { id: this.nextId++, type: mini ? 'gatekeeper' : 'cathedral', x: 9, y: 0, homeY: 0, age: 0, r: mini ? .62 : .88,
      hp: mini ? 100 : 460, maxHp: mini ? 100 : 460, fire: 2.4, entry: 3, phase: 1, pattern: 0, warning: 0, laser: 0, laserY: 0 };
    this.enemies.push(boss); this.boss = boss;
    this.announce(mini ? 'GATEKEEPER APPROACHING' : 'THE CATHEDRAL', mini ? 'Break the core.' : 'A machine too large for this reality.');
    this.emit('boss', { mini });
  }
  drop(x, y, kind) { this.pickups.push({ id: this.nextId++, x, y, kind, age: 0, r: .25 }); }
  collect(item) {
    const p = this.player;
    if (item.kind === 'SPREAD' || item.kind === 'LANCE') { p.level = p.weapon === item.kind ? Math.min(3, p.level + 1) : 1; p.weapon = item.kind; }
    if (item.kind === 'ECHO') p.echo = true;
    if (item.kind === 'SHIELD') { p.shield = Math.min(3, p.shield + 2); p.hp = Math.min(5, p.hp + 1); }
    if (item.kind === 'BOMB') this.bombs = Math.min(5, this.bombs + 1);
    this.score += 100; this.announce(item.kind === 'ECHO' ? 'ECHO WING ONLINE' : `${item.kind} ACQUIRED`);
    this.emit('pickup', { kind: item.kind });
  }
  hurtPlayer() {
    const p = this.player; if (p.invincible > 0 || this.state !== 'playing') return;
    if (p.shield > 0) p.shield--; else p.hp--;
    p.invincible = 1.8; this.burst(p.x, p.y, 'orange', 1.3); this.emit('hit');
    if (p.hp <= 0) { this.state = 'lost'; this.emit('end', { won: false }); }
  }
  damageEnemy(e, amount) {
    if (e.dead || e.entry > 0) return;
    e.hp -= amount; e.flash = .075;
    if (e.hp <= 0) {
      e.dead = true; this.kills++; this.score += e.maxHp ? (e.type === 'cathedral' ? 10000 : 2500) : e.type === 'carrier' ? 250 : 100;
      this.burst(e.x, e.y, e.maxHp ? 'orange' : 'mint', e.maxHp ? 4 : 1); this.emit('kill', { boss: !!e.maxHp, x: e.x });
      if (e.type === 'carrier') this.drop(e.x, e.y, ['SPREAD', 'LANCE', 'SHIELD'][this.wave % 3]);
      if (e.type === 'gatekeeper') { this.boss = null; this.shots = this.shots.filter(s => !s.hostile); this.drop(e.x - 1, 0, 'ECHO'); this.drop(e.x - .3, 1.2, 'SHIELD'); this.announce('GATE BROKEN', 'They heard you. Keep moving.'); }
      if (e.type === 'cathedral') { this.boss = null; this.shots = []; this.state = 'won'; this.emit('end', { won: true }); }
    }
  }
  shootPlayer() {
    const p = this.player;
    const shoot = (x, y, echo = false) => {
      if (p.weapon === 'SPREAD') for (let i = -1; i <= 1; i++) this.addShot(x, y, 12, i * (1.25 + p.level * .15), false, echo ? .65 : 1, 'spread');
      else this.addShot(x, y, p.weapon === 'LANCE' ? 19 : 14, 0, false, echo ? .7 : p.weapon === 'LANCE' ? 2.2 + p.level * .6 : 1.5, p.weapon === 'LANCE' ? 'lance' : 'pulse', .07);
    };
    shoot(p.x + .28, p.y);
    if (p.echo) shoot(p.x - .3, p.y + .45, true);
    p.cooldown = p.weapon === 'LANCE' ? .19 : .12;
    this.emit('shoot', { x: p.x });
  }
  releaseCharge() {
    const p = this.player; if (p.charge < .3) { p.charge = 0; return; }
    const strength = clamp(p.charge / 1.4, 0, 1);
    this.effects.push({ id: this.nextId++, kind: 'beam', x: p.x + .25, y: p.y, age: 0, life: .32, strength });
    for (const e of this.enemies) if (e.x > p.x && Math.abs(e.y - p.y) < e.r + .12 + strength * .13) this.damageEnemy(e, 8 + 30 * strength);
    this.shots = this.shots.filter(s => !(s.hostile && s.x > p.x && Math.abs(s.y - p.y) < .25));
    p.charge = 0; this.emit('charge');
  }
  bomb() {
    if (!this.bombs) return;
    this.bombs--; this.shots = this.shots.filter(s => !s.hostile); this.player.invincible = Math.max(1.5, this.player.invincible);
    for (const e of this.enemies) { this.damageEnemy(e, e.maxHp ? 35 : 50); e.warning = 0; e.laser = 0; e.fire = Math.max(e.fire, 1.5); }
    this.effects.push({ id: this.nextId++, kind: 'bomb', x: this.player.x, y: this.player.y, age: 0, life: .8 }); this.emit('bomb');
  }
  bossTick(e, dt) {
    e.x += (5.8 - e.x) * dt * 1.4;
    e.y = Math.sin(e.age * (e.type === 'cathedral' ? .55 : .85)) * 2.2;
    const phase = e.hp / e.maxHp < .33 ? 3 : e.hp / e.maxHp < .67 ? 2 : 1;
    if (phase !== e.phase) { e.phase = phase; this.burst(e.x, e.y, 'orange', 2); this.announce(`ARMOR FRACTURE / PHASE ${phase}`); this.shots = this.shots.filter(s => !s.hostile); e.fire = 1.4; }
    if (e.warning > 0) {
      e.warning -= dt;
      if (e.warning <= 0) { e.laser = .8; this.emit('laser'); }
    } else if (e.laser > 0) {
      e.laser -= dt;
      if (this.player.x < e.x && Math.abs(this.player.y - e.laserY) < .15 + this.player.r) this.hurtPlayer();
    }
    if (e.entry > 0 || e.fire > 0) return;
    e.pattern++; const speed = e.type === 'gatekeeper' ? 2.0 : 2.25 + phase * .18;
    const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    if (e.pattern % 4 === 0 && e.type === 'cathedral') {
      e.warning = 1.5; e.laserY = this.player.y; this.announce('LANCE CHARGING', 'Move off the warning line.');
    } else if (e.pattern % 3 === 0) {
      const count = 14 + phase * 4;
      for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2 + e.age * .1; this.addShot(e.x - .7, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 1, 'orb', .085); }
    } else {
      for (let i = -phase - 1; i <= phase + 1; i++) { const angle = aim + i * .17; this.addShot(e.x - .7, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 1, 'hostile', .075); }
      if (phase === 3) for (let i = 0; i < 7; i++) this.addShot(7.8, -3.7 + i * 1.25, -2.7, 0, true, 1, 'orb', .09);
    }
    e.fire = e.type === 'gatekeeper' ? 1.65 : phase === 3 ? 1.0 : 1.4;
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = clamp(dt, 0, 1 / 30); this.time += dt;
    const p = this.player; p.invincible = Math.max(0, p.invincible - dt); p.cooldown -= dt;
    let mx = input.x || 0, my = input.y || 0; const length = Math.hypot(mx, my); if (length > 1) { mx /= length; my /= length; }
    const speed = input.charge ? 3.1 : 5.2;
    p.x = clamp(p.x + mx * speed * dt, -7.7, 7.6); p.y = clamp(p.y + my * speed * dt, -4.2, 4.2);
    if (input.charge) p.charge = Math.min(1.4, p.charge + dt); else if (p.charge > 0) this.releaseCharge();
    if (input.fire && !input.charge && p.cooldown <= 0) this.shootPlayer();
    if (input.bomb && !this.bombWasDown) this.bomb(); this.bombWasDown = !!input.bomb;
    if (this.time >= 66 && !this.miniSpawned) { this.miniSpawned = true; this.spawnBoss(true); }
    if (this.time >= 180 && !this.bossSpawned && !this.boss) { this.bossSpawned = true; this.spawnBoss(); }
    if (!this.boss && !this.bossSpawned && this.time >= this.nextWave) { this.spawnWave(); this.nextWave = this.time + (this.time > 100 ? 4.2 : 5.3); }
    if (this.time >= this.nextPickup && !this.bossSpawned) {
      this.drop(7.4, Math.sin(this.time * .12) * 2.3, ['SPREAD', 'SHIELD', 'LANCE', 'ECHO', 'BOMB'][this.pickupCycle++ % 5]); this.nextPickup += 19;
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt; e.entry -= dt; e.fire -= dt; e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.maxHp) this.bossTick(e, dt);
      else {
        e.x -= e.speed * dt;
        if (e.type === 'drone' || e.type === 'weaver') e.y = e.homeY + Math.sin(e.age * (e.type === 'weaver' ? 2.2 : 1.5) + e.phase) * (e.type === 'weaver' ? .85 : .4);
        if (e.fire <= 0 && e.entry <= 0 && e.x < 7.7 && e.x > p.x - .5 && e.type !== 'dart') {
          const a = Math.atan2(p.y - e.y, p.x - e.x), s = e.type === 'sentinel' ? 2.8 : 2.1;
          for (let i = e.type === 'sentinel' ? -1 : 0; i <= (e.type === 'sentinel' ? 1 : 0); i++) this.addShot(e.x - .2, e.y, Math.cos(a + i * .22) * s, Math.sin(a + i * .22) * s, true);
          e.fire = e.type === 'sentinel' ? 2.6 : 3.8;
        }
      }
      if (e.entry <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) this.hurtPlayer();
    }
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.hostile) { if (segmentHits(s.px, s.py, s.x, s.y, p.x, p.y, p.r + s.r)) { this.hurtPlayer(); s.life = 0; } }
      else for (const e of this.enemies) {
        if (!e.dead && e.entry <= 0 && segmentHits(s.px, s.py, s.x, s.y, e.x, e.y, e.r + s.r)) { this.damageEnemy(e, s.damage); s.life = 0; break; }
      }
    }
    for (const item of this.pickups) {
      item.age += dt; item.x -= .85 * dt;
      const dist = Math.hypot(item.x - p.x, item.y - p.y);
      if (dist < 1.4) { item.x += (p.x - item.x) * dt * 4; item.y += (p.y - item.y) * dt * 4; }
      if (dist < .4) { this.collect(item); item.dead = true; }
    }
    for (const effect of this.effects) effect.age += dt;
    this.enemies = this.enemies.filter(e => !e.dead && e.x > -9.5);
    this.shots = this.shots.filter(s => s.life > 0 && Math.abs(s.x) < 10 && Math.abs(s.y) < 6);
    this.pickups = this.pickups.filter(p => !p.dead && p.x > -9);
    this.effects = this.effects.filter(e => e.age < e.life);
  }
}

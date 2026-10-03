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
    this.score = 0; this.bombs = 2; this.kills = 0; this.grazes = 0; this.wave = 0; this.nextWave = 1; this.nextCurtain = 12; this.nextPickup = 6; this.pickupCycle = 0;this.attackWindow='fans';
    this.miniSpawned = false; this.bossSpawned = false; this.boss = null; this.bombWasDown = false;
    this.announce('THE GLASS TIDE', 'Hold the line. Right trigger to fire.');
  }
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  announce(title, subtitle = '') { this.emit('announce', { title, subtitle }); }
  drainEvents() { const out = this.events; this.events = []; return out; }
  addShot(x, y, vx, vy, hostile, damage = 1, kind = 'pulse', r = .08) {
    // Separate budgets keep player fire available during dense hostile patterns.
    const budget=hostile?900:240;
    if (this.shots.filter(s=>s.hostile===hostile).length >= budget) return;
    this.shots.push({ id: this.nextId++, x, y, px: x, py: y, vx, vy, hostile, damage, kind, r, life: 12 });
  }
  burst(x, y, color, size = 1) { this.emit('burst', { x, y, color, size }); }
  spawnEnemy(type, y, index = 0) {
    const heavy = type === 'sentinel' || type === 'carrier';
    this.enemies.push({ id: this.nextId++, type, x: 8.7 + index * .7, y, homeY: y, age: 0, r: heavy ? .34 : .21,
      hp: type === 'carrier' ? 18 : heavy ? 10 : type === 'dart' ? 3 : 5, fire: .8 + index * .18, entry: .65,
      speed: type === 'dart' ? 3.8 : heavy ? .7 : 1.2, phase: index * .55, volley:0 });
  }
  spawnWave() {
    this.wave++; const y = (this.random() - .5) * 5.8;
    const types = this.time < 18 ? ['drone', 'sentinel', 'weaver', 'drone', 'dart'] : ['drone', 'weaver', 'sentinel', 'dart', 'carrier'];
    const type = types[this.wave % types.length];
    const count = type === 'sentinel' || type === 'carrier' ? 2 : 4;
    for (let i = 0; i < count; i++) this.spawnEnemy(type, clamp(y + (i - count / 2) * .48, -3.8, 3.8), i);
    if (this.time > 95 && this.wave % 2 === 0) this.spawnEnemy('sentinel', -y);
    if(this.wave===5)this.announce('THE GLASS RAIN', 'Find the openings. Left grip / Ctrl for precision.');
  }
  curtain(gapY, speed=2.1) {
    for(let y=-4.3;y<=4.3;y+=.32)if(Math.abs(y-gapY)>.68)this.addShot(8.25,y,-speed,0,true,1,'needle',.065);
    this.emit('enemyFire',{x:7,heavy:true});
  }
  spawnBoss(mini = false) {
    const boss = { id: this.nextId++, type: mini ? 'gatekeeper' : 'cathedral', x: 9, y: 0, homeY: 0, age: 0, r: mini ? .62 : .88,
      hp: mini ? 150 : 680, maxHp: mini ? 150 : 680, fire: 2.4, entry: 3, phase: 1, pattern: 0, warning: 0, laser: 0, laserY: 0, spiral:.15, corridor:3 };
    this.enemies.push(boss); this.boss = boss;
    this.announce(mini ? 'GATEKEEPER APPROACHING' : 'THE CATHEDRAL', mini ? 'Break the core.' : 'A machine too large for this reality.');
    this.emit('boss', { mini });
    this.shots=this.shots.filter(s=>!s.hostile);
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
    p.invincible = 1.2; this.burst(p.x, p.y, 'orange', 1.3); this.emit('hit');
    if (p.hp <= 0) { this.state = 'lost'; this.emit('end', { won: false }); }
  }
  damageEnemy(e, amount) {
    if (e.dead || e.entry > 0) return;
    e.hp -= amount; e.flash = .075; this.emit('impact',{x:e.x,y:e.y,boss:!!e.maxHp});
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
      if (p.weapon === 'SPREAD') for (let i = -2; i <= 2; i++) this.addShot(x, y, 15, i * (1.1 + p.level * .12), false, echo ? .55 : .85, 'spread',.055);
      else if(p.weapon==='LANCE')this.addShot(x,y,22,0,false,echo?.85:2.5+p.level*.6,'lance',.065);
      else for(const side of [-1,1])this.addShot(x,y+side*.05,18,0,false,echo?.55:.9,'pulse',.045);
    };
    shoot(p.x + .28, p.y);
    if (p.echo) shoot(p.x - .3, p.y + .45, true);
    p.cooldown = p.weapon === 'LANCE' ? .14 : .085;
    this.emit('shoot', { x: p.x, y:p.y,weapon:p.weapon });
  }
  releaseCharge() {
    const p = this.player; if (p.charge < .3) { p.charge = 0; return; }
    const strength = clamp(p.charge / 1.4, 0, 1);
    this.effects.push({ id: this.nextId++, kind: 'beam', x: p.x + .25, y: p.y, age: 0, life: .32, strength });
    for (const e of this.enemies) if (e.x > p.x && Math.abs(e.y - p.y) < e.r + .12 + strength * .13) this.damageEnemy(e, 8 + 30 * strength);
    this.shots = this.shots.filter(s => !(s.hostile && s.x > p.x && Math.abs(s.y - p.y) < .25));
    p.charge = 0; this.emit('charge',{x:p.x,y:p.y,strength});
  }
  bomb() {
    if (!this.bombs) return;
    this.bombs--; for(const s of this.shots.filter(s=>s.hostile).filter((_,i)=>i%4===0).slice(0,60))this.burst(s.x,s.y,'mint',.25);this.shots = this.shots.filter(s => !s.hostile); this.player.invincible = Math.max(1.5, this.player.invincible);
    for (const e of this.enemies) { this.damageEnemy(e, e.maxHp ? 35 : 50); e.warning = 0; e.laser = 0; e.fire = Math.max(e.fire, 1.5); }
    this.effects.push({ id: this.nextId++, kind: 'bomb', x: this.player.x, y: this.player.y, age: 0, life: .8 }); this.burst(this.player.x,this.player.y,'mint',3);this.emit('bomb');
  }
  bossTick(e, dt) {
    e.x += (5.8 - e.x) * dt * 1.4;
    e.y = Math.sin(e.age * (e.type === 'cathedral' ? .55 : .85)) * 2.2;
    const phase = e.hp / e.maxHp < .33 ? 3 : e.hp / e.maxHp < .67 ? 2 : 1;
    if (phase !== e.phase) { e.phase = phase; this.burst(e.x, e.y, 'orange', 2); this.announce(`ARMOR FRACTURE / PHASE ${phase}`); this.emit('phase',{phase});this.shots = this.shots.filter(s => !s.hostile); e.fire = 1.4; }
    if (e.warning > 0) {
      e.warning -= dt;
      if (e.warning <= 0) { e.laser = .8; this.emit('laser'); }
    } else if (e.laser > 0) {
      e.laser -= dt;
      if (this.player.x < e.x && Math.abs(this.player.y - e.laserY) < .15 + this.player.r) this.hurtPlayer();
    }
    if(e.entry<=0&&e.warning<=0&&e.laser<=0&&e.pattern%3!==1){
      e.spiral-=dt;e.corridor-=dt;
      if(e.spiral<=0){e.spiral=e.type==='gatekeeper'?.24:.19;const arms=e.type==='gatekeeper'?2:3+phase;
        for(let i=0;i<arms;i++){const a=e.age*(phase===3?-1.0:.72)+i/arms*Math.PI*2;this.addShot(e.x-.3,e.y,Math.cos(a)*1.85,Math.sin(a)*1.85,true,1,'petal',.065);}}
      if(e.corridor<=0&&e.type==='cathedral'&&phase>=2&&e.pattern%4===0){this.curtain(Math.sin(e.age*.28)*2.8,2.2);e.corridor=3.2;}
    }
    if (e.entry > 0 || e.fire > 0) return;
    e.pattern++; const speed = e.type === 'gatekeeper' ? 2.0 : 2.25 + phase * .18;
    const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    if (e.pattern % 4 === 0 && e.type === 'cathedral') {
      e.warning = 1.5; e.laserY = this.player.y; this.announce('LANCE CHARGING', 'Move off the warning line.');
    } else if (e.pattern % 3 === 0) {
      const count = 20 + phase * 7;
      for(let layer=0;layer<2;layer++)for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2 + e.age * .12+layer*.06; this.addShot(e.x - .7, e.y, Math.cos(angle) * speed*(1-layer*.17), Math.sin(angle) * speed*(1-layer*.17), true, 1, 'orb', .065); }
    } else {
      for (let i = -phase - 4; i <= phase + 4; i++) { const angle = aim + i * .105; this.addShot(e.x - .7, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 1, 'needle', .055); }
    }
    this.emit('enemyFire',{x:e.x,heavy:true});e.fire = e.type === 'gatekeeper' ? 1.5 : phase === 3 ? .95 : 1.2;
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = clamp(dt, 0, 1 / 30); this.time += dt;
    const p = this.player; p.invincible = Math.max(0, p.invincible - dt); p.cooldown -= dt;
    let mx = input.x || 0, my = input.y || 0; const length = Math.hypot(mx, my); if (length > 1) { mx /= length; my /= length; }
    p.focus=!!(input.focus||input.charge);p.moveX=mx;p.moveY=my;
    const speed = p.focus ? 2.4 : 5.2;
    p.x = clamp(p.x + mx * speed * dt, -7.7, 7.6); p.y = clamp(p.y + my * speed * dt, -4.2, 4.2);
    if (input.charge) p.charge = Math.min(1.4, p.charge + dt); else if (p.charge > 0) this.releaseCharge();
    if (input.fire && !input.charge && p.cooldown <= 0) this.shootPlayer();
    if (input.bomb && !this.bombWasDown) this.bomb(); this.bombWasDown = !!input.bomb;
    if (this.time >= 66 && !this.miniSpawned) { this.miniSpawned = true; this.spawnBoss(true); }
    if (this.time >= 180 && !this.bossSpawned && !this.boss) { this.bossSpawned = true; this.spawnBoss(); }
    if (!this.boss && !this.bossSpawned && this.time >= this.nextWave) { this.spawnWave(); this.nextWave = this.time + (this.time > 95 ? 2.2 : 2.8); }
    const beat=this.time%24,window=beat>=12&&beat<20?'corridor':beat>=20?'recovery':'fans';
    if(!this.boss&&!this.bossSpawned&&window!==this.attackWindow){
      this.attackWindow=window;
      if(window==='corridor'){this.shots=this.shots.filter(s=>!s.hostile);this.nextCurtain=this.time;this.announce('THREAD THE TIDE','Read the moving corridor. Precision focus helps.');}
    }
    if(!this.boss&&!this.bossSpawned&&window==='corridor'&&this.time>=this.nextCurtain){this.curtain(Math.sin(this.time*.18)*2.6);this.nextCurtain=this.time+1.7;}
    if (this.time >= this.nextPickup && !this.bossSpawned) {
      this.drop(7.4, Math.sin(this.time * .12) * 2.3, ['SPREAD', 'SHIELD', 'LANCE', 'ECHO', 'BOMB'][this.pickupCycle++ % 5]); this.nextPickup += 15;
    }
    // Conductor: aimed fans, moving corridors, then one-emitter recovery beats.
    const emitterLimit=this.boss?0:window==='corridor'?0:window==='recovery'?1:this.time<24?2:this.time<95?3:4;
    const emitters=new Set(this.enemies.filter(e=>!e.maxHp&&e.entry<=0&&e.x>p.x+.8&&e.x<7.7&&e.type!=='dart').sort((a,b)=>a.x-b.x).slice(0,emitterLimit).map(e=>e.id));
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt; e.entry -= dt; e.fire -= dt; e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.maxHp) this.bossTick(e, dt);
      else {
        e.x -= e.speed * dt;
        if (e.type === 'drone' || e.type === 'weaver') e.y = e.homeY + Math.sin(e.age * (e.type === 'weaver' ? 2.2 : 1.5) + e.phase) * (e.type === 'weaver' ? .85 : .4);
        if (e.fire <= 0 && emitters.has(e.id)) {
          const a = Math.atan2(p.y - e.y, p.x - e.x), s = e.type === 'sentinel' ? 2.3 : 1.9;
          e.volley++;
          if(e.type==='carrier')for(let i=0;i<24;i++){const angle=i/24*Math.PI*2+e.volley*.16;this.addShot(e.x,e.y,Math.cos(angle)*1.7,Math.sin(angle)*1.7,true,1,'orb',.06);}
          else {const count=e.type==='sentinel'?(this.time<24?4:6):e.type==='weaver'?4:3;
            for(let i=-count;i<=count;i++){const angle=a+i*(e.type==='sentinel'?.09:.14)+(e.type==='weaver'?Math.sin(e.age)*.25:0);this.addShot(e.x-.2,e.y,Math.cos(angle)*s,Math.sin(angle)*s,true,1,e.type==='weaver'?'petal':e.type==='sentinel'?'needle':'hostile',.055);}}
          this.emit('enemyFire',{x:e.x,heavy:e.type==='carrier'});e.fire=e.type==='sentinel'?1.55:e.type==='carrier'?2.1:1.85;
        }
      }
      if (e.entry <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) this.hurtPlayer();
    }
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.hostile) { if (segmentHits(s.px, s.py, s.x, s.y, p.x, p.y, p.r + s.r)) { this.hurtPlayer(); s.life = 0; }
        else if(!s.grazed&&p.invincible<=0&&Math.hypot(s.x-p.x,s.y-p.y)<.34){s.grazed=true;this.grazes++;this.score+=10;this.emit('graze',{x:p.x,y:p.y});}}
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

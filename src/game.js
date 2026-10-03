import { createBossParts, BOSS_CORE_RADIUS, bossCoreOpen } from './boss-parts.js';
import { DIFFICULTIES } from './menu.js';
import { firePrimary, fireModules, steerMissile, ringHits, LOOT_ROUTE, PICKUP_INFO } from './arsenal.js';
// All combat coordinates are 2D. Depth belongs exclusively to presentation.
export const FIELD = { left: -8, right: 8, bottom: -4.5, top: 4.5 };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function segmentHits(ax, ay, bx, by, x, y, radius) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(ax + dx * t - x, ay + dy * t - y) <= radius;
}
export class Game {
  constructor(seed = 42) { this.initialSeed = seed; this.difficulty = 'arcade'; this.reset(); }
  setDifficulty(id) {
    const next = Object.hasOwn(DIFFICULTIES, id) ? id : 'arcade';
    const ratio = DIFFICULTIES[next].speed / DIFFICULTIES[this.difficulty].speed;
    for (const shot of this.shots || []) if (shot.hostile) { shot.vx *= ratio; shot.vy *= ratio; }
    this.difficulty = next;
  }
  get tuning() { return DIFFICULTIES[this.difficulty]; }
  reset() {
    this.seed = this.initialSeed; this.nextId = 1; this.time = 0; this.state = 'playing';
    this.player = { x: -4.8, y: 0, r: .09, hp: 5, shield: 0, invincible: 2, weapon: 'PULSE', level: 1, echo: false, vector: 0, missiles: 0, weaponLevels: {}, charge: 0, cooldown: 0, vectorCooldown: 0, missileCooldown: 0 };
    this.path = []; this.echoWing = { x: -5.3, y: 0, moveY: 0 };
    this.enemies = []; this.shots = []; this.pickups = []; this.effects = []; this.events = [];
    this.score = 0; this.bombs = 2; this.kills = 0; this.grazes = 0; this.wave = 0; this.nextWave = 1; this.nextCurtain = 12; this.nextPickup = 6; this.pickupCycle = 0;this.attackWindow='fans';
    this.bossHold=0;this.act=1;this.setpieces=new Set();this.combo=1;this.comboTime=0;this.miniSpawned = false; this.bossSpawned = false; this.boss = null; this.bombWasDown = false;
    this.announce('THE GLASS TIDE', 'Hold the line. Right trigger to fire.');
  }
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  announce(title, subtitle = '') { this.emit('announce', { title, subtitle }); }
  drainEvents() { const out = this.events; this.events = []; return out; }
  addShot(x, y, vx, vy, hostile, damage = 1, kind = 'pulse', r = .08) {
    // Separate budgets keep player fire available during dense hostile patterns.
    const budget=hostile?900:240;
    if(this.shotList!==this.shots||this.shots.length!==(this.hostileCount||0)+(this.friendlyCount||0)){this.shotList=this.shots;this.hostileCount=0;this.friendlyCount=0;for(const s of this.shots)s.hostile?this.hostileCount++:this.friendlyCount++;}
    if((hostile?this.hostileCount:this.friendlyCount)>=budget)return;
    if(hostile)this.hostileCount++;else this.friendlyCount++;
    if (hostile) { vx *= this.tuning.speed; vy *= this.tuning.speed; }
    const shot = { id: this.nextId++, x, y, px: x, py: y, vx, vy, hostile, damage, kind, r, life: 12, level:hostile?1:this.player.level };this.shots.push(shot);return shot;
  }
  burst(x, y, color, size = 1) { this.emit('burst', { x, y, color, size }); }
  spawnEnemy(type, y, index = 0) {
    const heavy = type === 'sentinel' || type === 'carrier';
    this.enemies.push({ id: this.nextId++, type, x: 8.7 + index * .7, y, homeY: y, age: 0, r: heavy ? .34 : .21,
      hp: type === 'carrier' ? 18 : heavy ? 10 : type === 'dart' ? 3 : 5, fire: .8 + index * .18, entry: .65,
      speed: type === 'dart' ? 3.8 : heavy ? .7 : 1.2, phase: index * .55, volley:0 });
    this.enemies.at(-1).initialHp = this.enemies.at(-1).hp;
  }
  spawnWave() {
    this.wave++; const y = (this.random() - .5) * 5.8;
    const types = this.time < 18 ? ['drone', 'sentinel', 'weaver', 'drone', 'dart'] : ['drone', 'weaver', 'sentinel', 'dart', 'carrier'];
    const type = this.act===3?['weaver','sentinel','dart','carrier','weaver'][this.wave%5]:this.act===2?['sentinel','dart','carrier','drone','sentinel'][this.wave%5]:types[this.wave % types.length];
    const count = type === 'sentinel' || type === 'carrier' ? 2 : 4;
    for (let i = 0; i < count; i++) this.spawnEnemy(type, clamp(y + (i - count / 2) * .48, -3.8, 3.8), i);
    if (this.act===3 && this.wave % 3 === 0) this.spawnEnemy('sentinel', -y);
    if(this.act===2&&this.wave%4===0)for(let i=0;i<3;i++)this.spawnEnemy('dart',clamp(-y+(i-1)*.7,-3.8,3.8),i+4);
    if(this.wave===5)this.announce('THE GLASS RAIN', 'Find the openings. Left grip / Ctrl for precision.');
  }
  curtain(gapY, speed=2.1) {
    for(let y=-4.3;y<=4.3;y+=.32)if(Math.abs(y-gapY)>this.tuning.gap)this.addShot(8.25,y,-speed,0,true,1,'needle',.065);
    this.emit('enemyFire',{x:7,heavy:true});
  }
  spawnBoss(mini = false) {
    const boss = { id: this.nextId++, type: mini ? 'gatekeeper' : 'cathedral', x: 9, y: 0, homeY: 0, age: 0, r: mini ? .62 : .88,
      hp: mini ? 280 : 1350, maxHp: mini ? 280 : 1350, fire: 2.4, entry: 3, phase: 1, pattern: 0, warning: 0, laser: 0, laserY: 0, spiral:.15, corridor:3 };
    boss.parts = createBossParts(boss.type);
    this.enemies.push(boss); this.boss = boss;
    this.announce(mini ? 'GATEKEEPER APPROACHING' : 'THE CATHEDRAL', mini ? 'Destroy both marked weapon pods to open the core.' : 'Destroy all four marked modules to open the core.');
    this.emit('boss', { mini });
    this.shots=this.shots.filter(s=>!s.hostile);
  }
  drop(x, y, kind) { this.pickups.push({ id: this.nextId++, x, y, kind, age: 0, r: .25 }); }
  collect(item) {
    const p = this.player;
    if (['SPREAD','LANCE','RING'].includes(item.kind)) { p.weaponLevels[item.kind] = Math.min(3,(p.weaponLevels[item.kind]||0)+1); p.weapon=item.kind; p.level=p.weaponLevels[item.kind]; }
    if (item.kind === 'VECTOR') p.vector=Math.min(3,p.vector+1);
    if (item.kind === 'MISSILE') p.missiles=Math.min(3,p.missiles+1);
    if (item.kind === 'ECHO') p.echo = true;
    if (item.kind === 'SHIELD') { p.shield = Math.min(3, p.shield + 2); p.hp = Math.min(5, p.hp + 1); }
    if (item.kind === 'BOMB') this.bombs = Math.min(5, this.bombs + 1);
    const level=item.kind==='VECTOR'?p.vector:item.kind==='MISSILE'?p.missiles:p.level;
    this.score += 100; this.announce(item.kind === 'ECHO' ? 'ECHO WING ONLINE' : `${item.kind} ${['VECTOR','MISSILE','RING','LANCE','SPREAD'].includes(item.kind)?' / '+level:'ACQUIRED'}`,PICKUP_INFO[item.kind]);
    this.emit('pickup', { kind:item.kind,x:p.x,y:p.y,level:p.level });
  }
  hurtPlayer() {
    const p = this.player; if (p.invincible > 0 || this.state !== 'playing') return;
    if (p.shield > 0) p.shield--; else p.hp--;
    this.combo=1;this.comboTime=0;p.invincible = this.tuning.protection; this.burst(p.x, p.y, 'orange', 1.3); this.emit('hit');
    if (p.hp <= 0) { this.state = 'lost'; this.emit('end', { won: false }); }
  }
  damageEnemy(e, amount, impact = {}) {
    if (e.dead || e.entry > 0) return;
    if(e.maxHp&&!impact.partId&&(!impact.core||!bossCoreOpen(e))) {this.armorHit(e,impact);return;}
    e.hp = impact.partId&&e.maxHp?Math.max(1,e.hp-amount):e.hp-amount; if(!impact.partId)e.flash = .11;
    if (!impact.silent) this.emit('impact', { x: impact.x ?? e.x, y: impact.y ?? e.y, enemyId: e.id, partId: impact.partId ?? null, boss: !!e.maxHp, damageFraction: clamp(1 - e.hp / (e.maxHp || e.initialHp || e.hp + amount), 0, 1) });
    if (e.hp <= 0) {
      e.dead = true; this.kills++; this.score += e.maxHp ? (e.type === 'cathedral' ? 10000 : 2500) : e.type === 'carrier' ? 250 : 100;
      this.burst(e.x, e.y, e.maxHp ? 'orange' : 'mint', e.maxHp ? 4 : 1); this.emit('kill', { id:e.id,boss: !!e.maxHp, x:e.x,y:e.y,archetype:e.type,r:e.r,phase:e.phase });
      if (e.type === 'carrier') this.drop(e.x, e.y, ['VECTOR','MISSILE','RING','SPREAD','LANCE','SHIELD','BOMB','ECHO'][this.kills % 8]);
      if (e.type === 'gatekeeper') { this.boss = null; this.shots = this.shots.filter(s => !s.hostile); this.drop(e.x - 1, 0, 'ECHO'); this.drop(e.x - .3, 1.2, 'SHIELD'); this.announce('GATE BROKEN', 'They heard you. Keep moving.'); }
      if (e.type === 'cathedral') { this.boss = null; this.shots = []; this.state = 'won'; this.emit('end', { won: true }); }
    }
  }
  armorHit(e,hit={}) {
    if(e.dead||e.entry>0||this.time<(e.nextArmorHit||0))return;
    e.nextArmorHit=this.time+.08;this.emit('armorHit',{enemyId:e.id,x:hit.x??e.x-BOSS_CORE_RADIUS[e.type],y:hit.y??e.y});
  }
  damageBossPart(e, part, amount, impact = {}, transfer = true) {
    if (e.dead || e.entry > 0 || part.broken) return;
    const applied=Math.min(part.hp,amount);part.hp = Math.max(0, part.hp - amount); part.flash = .14;
    const hit = { x: impact.x ?? e.x + part.x, y: impact.y ?? e.y + part.y, partId: part.id };
    if (part.hp <= 0) {
      part.broken = true;part.brokenAt=this.time;
      this.score += e.type === 'cathedral' ? 400 : 200;
      this.emit('partBreak', { enemyId: e.id, partId: part.id, id: part.id, x: e.x + part.x, y: e.y + part.y, localX: part.x, localY: part.y, r: part.r, archetype: e.type, role: part.role });
      this.burst(e.x + part.x, e.y + part.y, 'orange', .9);
    }
    // Localized impact feedback is emitted once; structural bonus does not fake another hit.
    this.emit('impact', { ...hit, enemyId: e.id, boss: true, damageFraction: 1 - part.hp / part.maxHp });
    this.damageEnemy(e, (transfer ? applied : 0) + (part.broken ? part.breakDamage : 0), { ...hit, silent: true });
    if(part.broken&&bossCoreOpen(e)){this.announce('CORE EXPOSED','Armor seals destroyed. Aim for the small central reactor.');this.emit('coreOpen',{enemyId:e.id,x:e.x,y:e.y});e.recovery=Math.max(e.recovery||0,1.2);e.fire=Math.max(e.fire,1.2);}
  }
  projectileTargets(e) {
    // Every projectile reuses the same target objects: no per-shot arrays or maps.
    const cache = e._combatTargetCache ||= {
      parts: (e.parts || []).map(part => ({ x: 0, y: 0, r: part.r, part, hitId: e.id + ':' + part.id })),
      core: { x: 0, y: 0, r: e.r, hitId: e.id },
      armor: e.maxHp ? [{dx:0,dy:-e.r*.72,r:e.r*.37},{dx:0,dy:e.r*.72,r:e.r*.37},{dx:e.r*.95,dy:0,r:e.r*.42}].map((p,i)=>({...p,armor:true,hitId:e.id+':armor'+i})) : [], active: [],
    };
    const targets = cache.active; targets.length = 0;
    for (const target of cache.parts) {
      const part = target.part;
      if (part.broken) continue;
      target.x = e.x + part.x; target.y = e.y + part.y; target.r = part.r;
      targets.push(target);
    }
    cache.core.x = e.x; cache.core.y = e.y; cache.core.r = e.maxHp?BOSS_CORE_RADIUS[e.type]:e.r;
    cache.core.armor=!!e.maxHp&&!bossCoreOpen(e);cache.core.core=!!e.maxHp;
    targets.push(cache.core);
    for(const plate of cache.armor){plate.x=e.x+plate.dx;plate.y=e.y+plate.dy;targets.push(plate);}
    return targets;
  }
  shootPlayer() {
    firePrimary(this,this.player.x+.28,this.player.y);
    if(this.player.echo)firePrimary(this,this.echoWing.x+.18,this.echoWing.y,true);
    this.emit('shoot', { x:this.player.x,y:this.player.y,weapon:this.player.weapon,level:this.player.level });
  }
  releaseCharge() {
    const p = this.player; if (p.charge < .3) { p.charge = 0; return; }
    const strength = clamp(p.charge / 1.4, 0, 1);
    this.effects.push({ id: this.nextId++, kind: 'beam', x: p.x + .25, y: p.y, age: 0, life: .32, strength });
    for (const e of this.enemies) {
      const targets = this.projectileTargets(e).filter(t => t.x > p.x && Math.abs(t.y - p.y) < t.r + .12 + strength * .13);
      // One beam transfers hull damage once even when its width grazes two sockets.
      let transferred = false;
      for (const target of targets) {
        const hit = { x: target.x - target.r, y: clamp(p.y, target.y - target.r, target.y + target.r) };
        if(target.armor){this.armorHit(e,hit);continue;}
        if (target.part) this.damageBossPart(e, target.part, 8 + 30 * strength, hit, !transferred);
        else if (!transferred) this.damageEnemy(e, 8 + 30 * strength, {...hit,core:target.core});
        transferred = true;
      }
    }
    this.shots = this.shots.filter(s => !(s.hostile && s.x > p.x && Math.abs(s.y - p.y) < .25));
    p.charge = 0; this.emit('charge',{x:p.x,y:p.y,strength});
  }
  bomb() {
    if (!this.bombs) return;
    this.bombs--; for(const s of this.shots.filter(s=>s.hostile).filter((_,i)=>i%4===0).slice(0,60))this.burst(s.x,s.y,'mint',.25);this.shots = this.shots.filter(s => !s.hostile); this.player.invincible = Math.max(1.5, this.player.invincible);
    for (const e of this.enemies) { const open=bossCoreOpen(e);for (const part of e.parts || []) this.damageBossPart(e, part, 12, {}, false); if(!e.maxHp||open)this.damageEnemy(e, e.maxHp ? 35 : 50,{core:open}); e.warning = 0; e.laser = 0; e.fire = Math.max(e.fire, 1.5); }
    this.effects.push({ id: this.nextId++, kind: 'bomb', x: this.player.x, y: this.player.y, age: 0, life: .8 }); this.burst(this.player.x,this.player.y,'mint',3);this.emit('bomb');
  }
  bossTick(e, dt) {
    e.recovery=Math.max(0,(e.recovery||0)-dt);e.x += (5.8 - e.x) * dt * 1.4;
    e.y = Math.sin(e.age * (e.type === 'cathedral' ? .55 : .85)) * 2.2;
    const phase = e.hp / e.maxHp < .33 ? 3 : e.hp / e.maxHp < .67 ? 2 : 1;
    if (phase !== e.phase) { e.phase = phase; this.burst(e.x, e.y, 'orange', 2); this.announce(`ARMOR FRACTURE / PHASE ${phase}`); this.emit('phase',{phase});e.pattern=0;e.recovery=1.4;this.shots = this.shots.filter(s => !s.hostile); e.fire = 1.4; }
    if (e.warning > 0) {
      e.warning -= dt;
      if (e.warning <= 0) { e.laser = .8; this.emit('laser',{x:e.x,y:e.laserY}); }
    } else if (e.laser > 0) {
      e.laser -= dt;
      const p=this.player,start=this.playerStart||p,dy=p.y-start.y,half=.15+p.r;
      const t0=dy?(e.laserY-half-start.y)/dy:0,t1=dy?(e.laserY+half-start.y)/dy:1;
      const lo=Math.max(0,Math.min(t0,t1)),hi=Math.min(1,Math.max(t0,t1));
      if((dy||Math.abs(p.y-e.laserY)<half)&&lo<=hi&&Math.min(start.x+(p.x-start.x)*lo,start.x+(p.x-start.x)*hi)<e.x)this.hurtPlayer();
    }
    if(e.entry<=0&&e.warning<=0&&e.laser<=0&&e.recovery<=0&&e.fire>0&&e.pattern%3!==1){
      e.spiral-=dt;e.corridor-=dt;
      if(e.spiral<=0){e.spiral=e.type==='gatekeeper'?.24:.19;const arms=e.type==='gatekeeper'?2:3+phase;
        for(let i=0;i<arms;i++){const a=e.age*(phase===3?-1.0:.72)+i/arms*Math.PI*2;this.addShot(e.x-.3,e.y,Math.cos(a)*1.85,Math.sin(a)*1.85,true,1,'petal',.065);}}

    }
    if(e.entry>0||e.fire>0||e.warning>0||e.laser>0)return;
    e.pattern++; const speed = e.type === 'gatekeeper' ? 2.0 : 2.25 + phase * .18;
    const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    const cathedral=e.type==='cathedral';
    if(cathedral&&((phase===3&&e.pattern%2===0)||(phase<3&&e.pattern%4===0))){
      e.attackName='HEARTBREAKER';e.warning=1.5;e.laserY=this.player.y;e.recovery=2.6;
      this.emit('laserWarning',{x:e.x,y:e.laserY});this.announce('LANCE CHARGING','Move off the warning line.');
    }else if(cathedral&&phase===3){
      // A single coherent wall with a visible opening. No spiral can contaminate the reading beat.
      e.attackName='THE LAST OPENING';this.shots=this.shots.filter(s=>!s.hostile);const gap=clamp(this.player.y,-2.8,2.8);this.curtain(gap,2.6);e.recovery=2.7;
    }else if(cathedral&&phase===2){
      e.attackName='THE ORRERY';const count=32-3*(e.parts?.filter(p=>p.broken).length||0),offset=e.pattern*.17;
      for(let layer=0;layer<2;layer++)for(let i=0;i<count;i++){const a=i/count*Math.PI*2+offset+layer*.075;this.addShot(e.x-.7,e.y,Math.cos(a)*(2.2+layer*.45),Math.sin(a)*(2.2+layer*.45),true,1,layer?'petal':'orb',.06);}
      e.recovery=1.6;
    }else if(!cathedral&&phase>=2){
      e.attackName=phase===3?'SCISSOR / OVERDRIVE':'SCISSOR';const sides=phase===3?[-1,0,1]:[-1,1];
      for(const side of (bossCoreOpen(e)?[0]:sides.filter(side => side === 0 || !e.parts?.find(p => p.id === (side > 0 ? 'upper-pod' : 'lower-pod'))?.broken))){const y=e.y+side*.56,aim=Math.atan2(this.player.y-y,this.player.x-e.x);for(let i=-3;i<=3;i++){const a=aim+i*.14;this.addShot(e.x-.8,y,Math.cos(a)*2.3,Math.sin(a)*2.3,true,1,side?'needle':'petal',.055);}}e.recovery=.65;
    }else if(e.pattern%3===0){
      e.attackName='BLOOM';const count=27;
      for(let layer=0;layer<2;layer++)for(let i=0;i<count;i++){const a=i/count*Math.PI*2+e.age*.12+layer*.06;this.addShot(e.x-.7,e.y,Math.cos(a)*speed*(1-layer*.17),Math.sin(a)*speed*(1-layer*.17),true,1,'orb',.065);}e.recovery=.6;
    }else{
      e.attackName='NEEDLE CHOIR';for(let i=-5;i<=5;i++){const a=aim+i*.105;this.addShot(e.x-.7,e.y,Math.cos(a)*speed,Math.sin(a)*speed,true,1,'needle',.055);}
    }
    this.emit('attack',{name:e.attackName,x:e.x,y:e.y});this.emit('enemyFire',{x:e.x,y:e.y,heavy:true});
    const interval=cathedral?(phase===3?3.0:phase===2?2.4:1.5):phase>=2?1.8:1.5;
    e.fire=this.difficulty==='arcade'?interval:Math.max((e.recovery||0)+.15,interval/this.tuning.cadence);
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = clamp(dt, 0, 1 / 30); this.time += dt;this.comboTime=Math.max(0,this.comboTime-dt);if(this.comboTime===0)this.combo=1;
    if(this.boss?.type==='gatekeeper')this.bossHold+=dt;const progress=this.time-this.bossHold;const act=progress<90?1:progress<132?2:3;
    if(act!==this.act&&!this.boss){this.act=act;this.shots=this.shots.filter(s=>!s.hostile);this.announce(act===2?'II / THE COPPER FOUNDRY':'III / HEART OF THE MACHINE',act===2?'Armored columns. Fracture their formation.':'The tide turns inward. Stay in the openings.');this.emit('act',{act});}
    for(const [at,name]of [[30,'LEVIATHAN'],[108,'THE PROCESSION'],[150,'THE HELIX']])if(progress>=at&&!this.boss&&!this.setpieces.has(at)){this.setpieces.add(at);this.emit('setpiece',{name,act:this.act});if(at===108)for(let i=0;i<4;i++)this.spawnEnemy('carrier',(i-1.5)*1.7,i);if(at===150)for(let i=0;i<6;i++)this.spawnEnemy('weaver',Math.sin(i*1.2)*3,i);}
    const p = this.player; p.invincible = Math.max(0, p.invincible - dt); p.cooldown -= dt;p.vectorCooldown-=dt;p.missileCooldown-=dt;this.playerStart={x:p.x,y:p.y};
    let mx = input.x || 0, my = input.y || 0;
    const target=input.target;const direct=target&&Number.isFinite(target.x)&&Number.isFinite(target.y);
    if(direct){const dx=clamp(target.x,-7.7,7.6)-p.x,dy=clamp(target.y,-4.2,4.2)-p.y,dist=Math.hypot(dx,dy),limit=(input.focus||input.charge?10:18)*dt;const factor=dist?Math.min(1,limit/dist):0;mx=dx*factor/(dt||1);my=dy*factor/(dt||1);} const length = Math.hypot(mx, my); if (!direct&&length > 1) { mx /= length; my /= length; }
    p.focus=!!(input.focus||input.charge);p.moveX=direct?clamp(mx/8,-1,1):mx;p.moveY=direct?clamp(my/8,-1,1):my;
    const speed = direct ? 1 : p.focus ? 2.4 : 5.2;
    p.x = clamp(p.x + mx * speed * dt, -7.7, 7.6); p.y = clamp(p.y + my * speed * dt, -4.2, 4.2);
    this.path.push({time:this.time,x:p.x,y:p.y,moveY:p.moveY});
    while(this.path.length>1&&this.path[1].time<=this.time-.28)this.path.shift();
    const past=this.path[0];this.echoWing={x:past.x-.5,y:past.y,moveY:past.moveY};
    if (input.fire) fireModules(this);
    if (input.charge) p.charge = Math.min(1.4, p.charge + dt); else if (p.charge > 0) this.releaseCharge();
    if (input.fire && !input.charge && p.cooldown <= 0) this.shootPlayer();
    if (input.bomb && !this.bombWasDown) this.bomb(); this.bombWasDown = !!input.bomb;
    if (this.time >= 66 && !this.miniSpawned) { this.miniSpawned = true; this.spawnBoss(true); }
    if (this.time-this.bossHold >= 180 && !this.bossSpawned && !this.boss) { this.bossSpawned = true; this.spawnBoss(); }
    if (!this.boss && !this.bossSpawned && this.time >= this.nextWave) { this.spawnWave(); this.nextWave = this.time + (this.time > 95 ? 2.2 : 2.8); }
    const cycle=this.act===1?24:this.act===2?28:20,beat=this.time%cycle,window=beat>=cycle*.5&&beat<cycle*.83?'corridor':beat>=cycle*.83?'recovery':'fans';
    if(!this.boss&&!this.bossSpawned&&window!==this.attackWindow){
      this.attackWindow=window;
      if(window==='corridor'){this.shots=this.shots.filter(s=>!s.hostile);this.nextCurtain=this.time;this.announce('THREAD THE TIDE','Read the moving corridor. Precision focus helps.');}
    }
    if(!this.boss&&!this.bossSpawned&&window==='corridor'&&this.time>=this.nextCurtain){this.curtain(Math.sin(this.time*(this.act===3?.23:.18))*2.6,this.act===3?2.5:2.1);this.nextCurtain=this.time+1.7;}
    if (this.time >= this.nextPickup && !this.bossSpawned) {
      this.drop(6.6, Math.sin(this.time * .12) * 2.3, LOOT_ROUTE[this.pickupCycle++ % LOOT_ROUTE.length]); this.nextPickup += this.pickupCycle<6?10:15;
    }
    // Conductor: aimed fans, moving corridors, then one-emitter recovery beats.
    const emitterLimit=this.boss?0:window==='corridor'?0:window==='recovery'?1:this.time<24?2:this.time<95?3:4;
    const emitters=new Set(this.enemies.filter(e=>!e.maxHp&&e.entry<=0&&e.x>p.x+.8&&e.x<7.7&&e.type!=='dart').sort((a,b)=>a.x-b.x).slice(0,emitterLimit).map(e=>e.id));
    for (const e of this.enemies) {
      if (e.dead) continue;
      const enemyStart={x:e.x,y:e.y};e.age += dt; e.entry -= dt; e.fire -= dt; e.flash = Math.max(0, (e.flash || 0) - dt);
      for (const part of e.parts || []) part.flash = Math.max(0, part.flash - dt);
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
          this.emit('enemyFire',{x:e.x,y:e.y,heavy:e.type==='carrier'});e.fire=(e.type==='sentinel'?1.55:e.type==='carrier'?2.1:1.85)/this.tuning.cadence;
        }
      }
      if (e.entry <= 0 && this.projectileTargets(e).some(target => segmentHits(this.playerStart.x-enemyStart.x, this.playerStart.y-enemyStart.y, p.x-e.x, p.y-e.y, target.x-e.x, target.y-e.y, target.r+p.r))) this.hurtPlayer();
    }
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y;s.previousRadius=s.r; s.age=(s.age||0)+dt;
      if(s.kind==='missile')steerMissile(this,s,dt);
      if(s.kind==='ring')s.r=Math.min(.38+s.level*.11,.12+s.age*.55);
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.hostile) { if (segmentHits(s.px-this.playerStart.x, s.py-this.playerStart.y, s.x-p.x, s.y-p.y, 0, 0, p.r+s.r)) { this.hurtPlayer(); s.life = 0; }
        else if(!s.grazed&&p.invincible<=0&&Math.hypot(s.x-p.x,s.y-p.y)<.34){s.grazed=true;this.grazes++;this.combo=Math.min(8,this.combo+.25);this.comboTime=4;this.score+=Math.round(10*this.combo);this.emit('graze',{x:p.x,y:p.y});}}
      else for (const e of this.enemies) {
        if (e.dead || e.entry > 0 || s.life <= 0) continue;
        for (const target of this.projectileTargets(e)) {
          if (e.dead || s.hits?.includes(target.hitId) || !(s.kind === 'ring' ? ringHits(s, target) : segmentHits(s.px, s.py, s.x, s.y, target.x, target.y, target.r + s.r))) continue;
          // Surface contact, not enemy center: sparks stay attached to the side actually struck.
          const sx=s.px-target.x, sy=s.py-target.y, vx=s.x-s.px, vy=s.y-s.py;
          const a=vx*vx+vy*vy, b=2*(sx*vx+sy*vy), reach=target.r+s.r, c=sx*sx+sy*sy-reach*reach;
          const discriminant=b*b-4*a*c;
          const t=s.kind !== 'ring' && a>0 && c>0 && discriminant>=0 ? clamp((-b-Math.sqrt(discriminant))/(2*a),0,1) : 0;
          const dx=sx+vx*t, dy=sy+vy*t, length=Math.hypot(dx,dy)||1;
          const hit={x:target.x+dx/length*target.r,y:target.y+dy/length*target.r};
          if(target.armor){this.armorHit(e,hit);s.life=0;break;}
          if (target.part) this.damageBossPart(e, target.part, s.damage, hit);
          else this.damageEnemy(e, s.damage, {...hit,core:target.core});
          (s.hits ||= []).push(target.hitId); s.pierce=(s.pierce||1)-1;
          if (s.pierce<=0) { s.life=0; break; }
        }
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

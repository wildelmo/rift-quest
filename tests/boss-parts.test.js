import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { BOSS_PART_LAYOUTS } from '../src/boss-parts.js';
const arena = (mini = true) => {
  const g = new Game(); g.nextWave = g.nextPickup = g.nextCurtain = 99999;
  g.miniSpawned = g.bossSpawned = true; g.spawnBoss(mini);
  const e = g.boss; e.entry = 0; e.x = 4; e.y = 0; g.bossTick = () => {};
  g.drainEvents(); return { g, e };
};
const fireAt = (g, x, y, damage = 1, kind = 'pulse', radius = .04) => {
  const s = g.addShot(x - .6, y, 30, 0, false, damage, kind, radius);
  g.update(1 / 30); return s;
};
test('boss sockets are independent instances with physical targets outside the core', () => {
  for (const mini of [true, false]) {
    const { g, e } = arena(mini); const count = mini ? 2 : 4;
    assert.equal(e.parts.length, count);
    assert.equal(new Set(e.parts.map(p => p.id)).size, count);
    for (const p of e.parts) {
      assert.ok(Math.hypot(p.x,p.y) > e.r); assert.equal(p.hp,p.maxHp);
      assert.ok(!('z' in p));
    }
    e.parts[0].hp = 0;
    assert.notEqual(BOSS_PART_LAYOUTS[e.type][0].hp, 0);
    g.spawnBoss(mini); assert.ok(g.boss.parts[0].hp > 0);
  }
});
test('pod hits light the struck socket, emit one localized impact, and damage the hull', () => {
  const { g, e } = arena(); const p = e.parts[0];
  fireAt(g, e.x + p.x, p.y, 4);
  assert.equal(p.hp, p.maxHp - 4); assert.equal(e.hp,e.maxHp - 4);
  assert.ok(p.flash > 0); assert.equal(e.parts[1].flash,0);
  const impacts = g.drainEvents().filter(v => v.type === 'impact');
  assert.equal(impacts.length,1); const v = impacts[0];
  assert.equal(v.enemyId,e.id); assert.equal(v.partId,p.id);
  assert.ok(Math.abs(v.x - (e.x + p.x - p.r)) < 1e-9);
  assert.equal(v.y,p.y); assert.equal(v.damageFraction,4/p.maxHp);
});
test('breaking a socket awards its structural bonus once and leaves the core beatable', () => {
  const { g, e } = arena(); const p = e.parts[0];
  fireAt(g, e.x + p.x,p.y,p.maxHp);
  assert.equal(p.broken,true); assert.equal(p.hp,0);
  assert.equal(e.hp,e.maxHp-p.maxHp-p.breakDamage); assert.equal(g.score,200);
  const events = g.drainEvents(); assert.equal(events.filter(v=>v.type==='partBreak').length,1);
  const broken = events.find(v=>v.type==='partBreak');
  assert.equal(broken.partId,p.id); assert.equal(broken.localX,p.x);
  const hp=e.hp; fireAt(g,e.x+p.x,p.y,100);
  assert.equal(e.hp,hp); assert.equal(g.score,200);
  fireAt(g,e.x,0,99999); assert.equal(e.dead,true); assert.equal(g.boss,null);
});
test('bosses can be defeated through the core without breaking optional parts', () => {
  const { g,e }=arena(false); fireAt(g,e.x,0,e.maxHp);
  assert.equal(g.state,'won'); assert.ok(e.parts.every(p=>!p.broken));
});
test('ring socket collision remains annular and remembers each pierced target once', () => {
  const {g,e}=arena(false),p=e.parts[3];
  const s=g.addShot(e.x+p.x,e.y+p.y,0,0,false,2,'ring',.71);
  Object.assign(s,{age:2,level:3,pierce:5,stroke:.04,hits:[]});
  g.update(0); assert.equal(p.hp,p.maxHp); // Socket sits inside the ring's hollow center.
  s.x=e.x+p.x-.71; s.y=e.y+p.y; g.update(0);
  assert.equal(p.hp,p.maxHp-2); assert.ok(s.hits.includes(e.id+':'+p.id));
  for(let i=0;i<10;i++)g.update(0);
  assert.equal(p.hp,p.maxHp-2);
});
test('a charge can deliberately hit an outboard pod and bombs damage surviving structures', () => {
  const {g,e}=arena(false),p=e.parts[0];g.player.y=p.y;g.player.charge=1.4;
  g.releaseCharge();assert.equal(p.hp,p.maxHp-38);assert.equal(e.hp,e.maxHp-38);
  assert.equal(e.parts[1].hp,e.parts[1].maxHp);
  const before=e.hp;g.bomb();assert.equal(e.hp,before-35);assert.equal(p.hp,p.maxHp-50);
  assert.equal(e.parts[1].hp,e.parts[1].maxHp-12);
});
test('part collisions are swept on the combat plane and vanish once broken', () => {
  const {g,e}=arena(),p=e.parts[0];g.player.invincible=0;
  g.player.x=e.x+p.x-.5;g.player.y=p.y;
  g.update(1/30,{target:{x:e.x+p.x+.5,y:p.y}});
  assert.equal(g.player.hp,4);
  p.broken=true;g.player.invincible=0;g.player.x=e.x+p.x-.5;
  g.update(1/30,{target:{x:e.x+p.x+.5,y:p.y}});
  assert.equal(g.player.hp,4);
});
test('entry immunity protects both sockets and hull, while ordinary hull impacts report damage',()=>{
  const {g,e}=arena();e.entry=1;const p=e.parts[0];g.damageBossPart(e,p,999);
  assert.equal(p.hp,p.maxHp);assert.equal(e.hp,e.maxHp);assert.equal(g.events.length,0);
  g.spawnEnemy('carrier',0);const regular=g.enemies.at(-1);regular.entry=0;
  assert.equal(regular.initialHp,18);g.damageEnemy(regular,3,{x:2,y:1});
  const hit=g.events.at(-1);assert.equal(hit.partId,null);assert.equal(hit.enemyId,regular.id);
  assert.ok(Math.abs(hit.damageFraction-1/6)<1e-10);assert.equal(hit.x,2);assert.equal(hit.y,1);
});
test('broken weapon pods suppress corresponding Gatekeeper side fire',()=>{
  const {g,e}=arena();delete g.bossTick;e.hp=e.maxHp*.5;e.phase=2;e.fire=0;e.recovery=0;e.spiral=100;
  e.parts[0].broken=true;g.bossTick(e,0);
  assert.equal(e.attackName,'SCISSOR');assert.equal(g.shots.length,7);
  assert.ok(g.shots.every(s=>s.y<e.y));
});
test('oblique projectile sparks land on the actual struck surface rather than hull center',()=>{
  const {g,e}=arena();const p=e.parts[0];const x=e.x+p.x,y=e.y+p.y;
  const s=g.addShot(x-.6,y+.5,30,-15,false,1,'pulse',.04);
  g.update(1/30);const impact=g.drainEvents().find(v=>v.type==='impact');
  assert.ok(impact);assert.equal(impact.partId,p.id);
  assert.ok(Math.abs(Math.hypot(impact.x-x,impact.y-y)-p.r)<1e-9);
  assert.ok(impact.x<x);assert.ok(impact.y>y);
  const slope=(impact.y-y)/(impact.x-x);
  assert.ok(Math.abs(slope-(-.5/.6))>.1); // Impact uses segment entry, not its starting direction.
});

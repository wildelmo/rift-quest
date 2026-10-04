import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseCapsule } from '../src/game/enemies.js';
import { WAVES } from '../src/game/stage.js';
import { BOSS_HP, APERTURE_HIT_ANGLE, EYE_CONE } from '../src/game/boss.js';
import { SHIP } from '../src/game/player.js';
import { RIFT_SLOTS } from '../src/game/room.js';

test('capsules never offer upgrades the ship cannot take', () => {
  // a maxed ship with a full bomb bay and a shield only gets score bonuses
  const maxed = { level: 4, optionCount: 3, shield: true, bombs: 3 };
  for (let i = 0; i < 200; i++) assert.equal(chooseCapsule(maxed, () => i / 200), 'P');
  // shields and bombs stay rare even when they are all a maxed ship could take
  const bare = { level: 4, optionCount: 3, shield: false, bombs: 0 };
  const rare = { P: 0, S: 0, B: 0 };
  for (let i = 0; i < 1000; i++) rare[chooseCapsule(bare, () => (i + 0.5) / 1000)]++;
  assert.ok(rare.S + rare.B < 0.35 * 1000, JSON.stringify(rare));
  const fresh = { level: 1, optionCount: 0, shield: false, bombs: 1 };
  const counts = {};
  for (let i = 0; i < 1000; i++) {
    const k = chooseCapsule(fresh, () => (i + 0.5) / 1000);
    counts[k] = (counts[k] || 0) + 1;
  }
  // a fresh ship mostly gets power and options
  assert.ok(counts.P > counts.S && counts.O > counts.S);
});

test('stage has four authored waves before the boss', () => {
  assert.equal(WAVES.length, 4);
  for (const w of WAVES) {
    assert.equal(typeof w.script, 'function');
    assert.ok(w.name.length > 0);
  }
});

test('boss tuning stays in sane bounds', () => {
  assert.ok(BOSS_HP.pod > 0 && BOSS_HP.emitter > BOSS_HP.pod && BOSS_HP.core > BOSS_HP.emitter);
  // the hit window through the aperture should be roughly the size of the safe eye
  assert.ok(APERTURE_HIT_ANGLE > EYE_CONE && APERTURE_HIT_ANGLE < EYE_CONE * 2);
});

test('ship hitbox is tiny compared with graze radius', () => {
  assert.ok(SHIP.hitRadius < 0.01);
  assert.ok(SHIP.grazeRadius > SHIP.hitRadius * 3);
});

test('every rift slot has a direction, fallback distance and radius', () => {
  for (const s of Object.values(RIFT_SLOTS)) {
    assert.equal(s.dir.length, 3);
    assert.ok(s.dist > 1 && s.radius > 0);
  }
});

test('a hit handler that clears bullets does not corrupt the bullet list', async () => {
  const THREE = await import('three');
  const { EnemyBullets } = await import('../src/game/bullets.js');
  const b = new EnemyBullets(new THREE.Group());
  // bullets that miss come first in the list, so a mid-loop clear would leave holes behind them
  for (let i = 0; i < 10; i++) b.spawn(0.3, 0, -0.5, 0, 0, 0.1, 'small');
  for (let i = 0; i < 20; i++) b.spawn(0, 0, -0.05 - i * 0.002, 0, 0, 0.5, 'small');
  let hits = 0;
  const ship = { x: 0, y: 0, z: 0, radius: 0.006, grazeRadius: 0.03, vulnerable: true, active: true, present: true };
  b.update(0.2, ship, { onHit: () => { hits++; b.cancelAll(false); }, onGraze() {}, onStar() {} });
  assert.equal(hits, 1);
  assert.ok(b.live.every((x) => x && x.alive));
  b.update(0.016, ship, { onHit() {}, onGraze() {}, onStar() {} });
  assert.ok(b.live.every((x) => x && x.alive));
});

test('difficulty modes are ordered: easy is gentler than normal, normal than hard', async () => {
  const { DIFFICULTIES, ORDER } = await import('../src/game/difficulty.js');
  const [e, n, h] = ORDER.map((k) => DIFFICULTIES[k]);
  for (const k of ['enemyHp', 'bulletSpeed', 'density', 'pressure', 'bossHp', 'escorts', 'mineReach']) {
    assert.ok(e[k] < n[k] && n[k] <= h[k], k);
  }
  assert.ok(e.pace > n.pace && n.pace > h.pace, 'lower pace means faster enemies');
  assert.ok(e.lives >= n.lives && e.bombs >= n.bombs);
});

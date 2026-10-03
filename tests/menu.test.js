import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { PauseMenu, normalizeSettings, DIFFICULTIES } from '../src/menu.js';

test('stored settings reject malformed values and clamp valid ranges', () => {
  assert.deepEqual(normalizeSettings(null), normalizeSettings());
  const s = normalizeSettings({ volume: -1, musicVolume: 12, distance: NaN, width: '9', difficulty: '__proto__' });
  assert.equal(s.volume, 0); assert.equal(s.musicVolume, 1); assert.equal(s.distance, 1.98); assert.equal(s.width, 3.8); assert.equal(s.difficulty, 'arcade');
});
test('difficulty rescales hostile speed without teleporting bullets or changing ship/fire', () => {
  const g = new Game(); g.addShot(2, 1, -2, .5, true); g.addShot(0, 0, 18, 0, false);
  const player = { ...g.player }; g.setDifficulty('expert');
  assert.equal(g.shots[0].vx, -2 * 1.18); assert.equal(g.shots[0].x, 2); assert.equal(g.shots[1].vx, 18); assert.deepEqual(g.player, player);
  g.setDifficulty('casual'); assert.ok(Math.abs(g.shots[0].vx + 2 * .82) < 1e-12);
  g.reset(); assert.equal(g.difficulty, 'casual'); g.addShot(0, 0, -3, 0, true); assert.equal(g.shots[0].vx, -3 * .82);
  g.setDifficulty('invalid'); assert.equal(g.difficulty, 'arcade');
});
test('all difficulties retain curtain routes, boss recovery, and beam warning', () => {
  for (const id of Object.keys(DIFFICULTIES)) {
    const g = new Game(); g.setDifficulty(id); g.curtain(1);
    assert.ok(g.shots.every(s => Math.abs(s.y - 1) > DIFFICULTIES[id].gap)); assert.ok(DIFFICULTIES[id].gap > g.player.r + .065);
    g.spawnBoss(); const b = g.boss; b.entry = 0; b.hp = 180; b.phase = 3; b.pattern = 0; b.fire = 0; b.spiral = 0;
    g.update(1 / 90); assert.equal(b.attackName, 'THE LAST OPENING'); assert.ok(b.fire >= b.recovery + .15 - .012);
    b.pattern = 1; b.fire = 0; b.recovery = 0; g.update(1 / 90); assert.ok(b.warning >= 1.48);
  }
});
test('controller menu navigates, repeats predictably, adjusts, and confirms Exit', () => {
  const m = new PauseMenu(), s = normalizeSettings();
  m.input(0, -1, false, 1, s); assert.equal(m.selected, 1);
  m.input(0, -1, false, 1.1, s); assert.equal(m.selected, 1);
  m.input(0, -1, false, 1.25, s); assert.equal(m.selected, 2);
  m.input(0, 0, false, 1.3, s); assert.equal(m.input(-1, 0, false, 1.31, s), 'changed'); assert.equal(s.musicVolume, .95);
  m.selected = 3; m.nextMove = 0; m.input(1, 0, false, 2, s); assert.equal(s.difficulty, 'expert');
  m.selected = m.rows(s).findIndex(r=>r.id==='exit'); assert.equal(m.input(0, 0, true, 3, s), 'exit');
  m.open(); assert.equal(m.selected, 0); assert.equal(m.rows(s, true)[0].label, 'Play again');
});

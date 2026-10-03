// Exercises the human flow with the desktop rig: title -> grab -> pause/resume -> game over -> continue.
import { serve, launch, openGame } from './harness.mjs';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const out = 'tests/e2e/out';
mkdirSync(out, { recursive: true });
const server = await serve();
const browser = await launch();
const state = (page) => page.evaluate(() => window.__rift.game.state);
try {
  const { page, errors } = await openGame(browser, server.url, 'mute&wave=2', { width: 800, height: 500 });
  await page.screenshot({ path: `${out}/flow-0-menu.png` });
  await page.evaluate(() => window.__rift.startDesktop());
  await page.waitForTimeout(1500);
  assert.equal(await state(page), 'title');
  await page.screenshot({ path: `${out}/flow-1-title.png` });
  // grab: click on the canvas near the resting ship
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => window.__rift.game.state === 'playing', null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__rift.game.waveIndex), 1, 'starts at requested wave');
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__rift.game.state === 'paused', null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/flow-2-paused.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__rift.game.state === 'playing', null, { timeout: 5000 });
  // bomb
  const bombsBefore = await page.evaluate(() => window.__rift.game.ship.bombs);
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.__rift.game.ship.bombs), bombsBefore - 1, 'bomb used');
  // lose every ship
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const g = window.__rift.game; g.ship.invuln = 0; g.ship.dead = false; g.ship.shield = false; g.shipHit(); });
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.__rift.game.state === 'gameover', null, { timeout: 15000 });
  await page.waitForFunction(() => window.__rift.game.restReady, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/flow-3-gameover.png` });
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForFunction(() => window.__rift.game.state === 'playing', null, { timeout: 5000 });
  const after = await page.evaluate(() => ({ wave: window.__rift.game.waveIndex, lives: window.__rift.game.ship.lives, score: window.__rift.game.score }));
  assert.equal(after.wave, 1, 'continue resumes the same wave');
  assert.equal(after.lives, 3);
  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
  console.log('FLOW OK');
} catch (e) {
  console.log('FLOW FAILED', e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

// Audio health check through the whole boss fight with sound ON: looping sounds must never leak
// (a leaked laser hum is an endless buzz) and the voice count must stay under the cap.
import { serve, launch, openGame } from './harness.mjs';
import assert from 'node:assert/strict';

const server = await serve(4794);
const browser = await launch();
let failed = false;
try {
  const { page, errors } = await openGame(browser, server.url, 'boss&bot&god&substeps=24&wave=5', { width: 320, height: 200 });
  await page.evaluate(() => window.__rift.startDesktop());
  let maxVoices = 0, maxLoops = 0, leaks = 0, samples = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 500000) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const g = window.__rift.game;
      return { state: g.state, phase: g.boss && g.boss.phase, loops: g.sfx.loops.size, voices: g.sfx.voices, firing: g.lasers.items.filter((l) => l.state === 'fire').length, ctx: g.audio.ctx && g.audio.ctx.state };
    });
    samples++;
    maxVoices = Math.max(maxVoices, s.voices);
    maxLoops = Math.max(maxLoops, s.loops);
    // a loop may outlive its beam by its short release; anything beyond the firing beams + 1 is a leak
    if (s.loops > s.firing + 1) { leaks++; console.log('possible leak', JSON.stringify(s)); }
    if (s.state === 'victory') break;
  }
  const end = await page.evaluate(() => ({ loops: window.__rift.game.sfx.loops.size, state: window.__rift.game.state, phase: window.__rift.game.boss && window.__rift.game.boss.phase }));
  console.log(JSON.stringify({ samples, maxVoices, maxLoops, leaks, end }));
  // the boss must at least have reached the laser phase and beyond for this to mean anything
  assert.ok(end.state === 'victory' || end.phase === 'heart' || end.phase === 'dying', 'reached the late boss phases');
  assert.equal(end.loops, 0, 'no loops left playing after the fight');
  assert.ok(leaks <= 1, 'loops track the beams that own them');
  assert.ok(maxVoices <= 40, 'voice count stays bounded');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('AUDIO OK');
} catch (e) {
  failed = true;
  console.log('AUDIO FAILED', e.message);
} finally {
  await browser.close();
  server.close();
  if (failed) process.exitCode = 1;
}

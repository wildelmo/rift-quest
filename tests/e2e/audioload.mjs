// Measures audio-graph churn during the boss's late "heart" phase (the busiest audio moment):
// audio nodes created per game-second, and frame-to-frame garbage. Prints numbers; with
// --assert it fails if churn exceeds the budget.
import { serve, launch, openGame } from './harness.mjs';

const server = await serve(4798);
const browser = await launch();
const strict = process.argv.includes('--assert');
let failed = false;
try {
  const { page, errors } = await openGame(browser, server.url, 'boss&bot&god&substeps=8', { width: 320, height: 200 });
  await page.addInitScript(() => {});
  await page.evaluate(() => {
    // count every audio node the page creates
    window.__nodes = 0;
    const P = Object.getPrototypeOf((window.AudioContext || window.webkitAudioContext).prototype); // BaseAudioContext
    for (const k of Object.getOwnPropertyNames(P)) {
      if (!k.startsWith('create') || typeof P[k] !== 'function') continue;
      const orig = P[k];
      P[k] = function (...a) { window.__nodes++; return orig.apply(this, a); };
    }
  });
  await page.evaluate(() => window.__rift.startDesktop());
  // fast-forward to the heart phase
  await page.waitForFunction(() => window.__rift.game.boss && window.__rift.game.boss.phase === 'heart', null, { timeout: 400000, polling: 1000 });
  const a = await page.evaluate(() => ({ n: window.__nodes, t: window.__rift.game.time, music: window.__rift.game.audio.music.ctx ? 1 : 0 }));
  await page.waitForTimeout(6000);
  const b = await page.evaluate(() => ({ n: window.__nodes, t: window.__rift.game.time, phase: window.__rift.game.boss.phase, voices: window.__rift.game.sfx.voices }));
  // nodes created per second of game time
  const perSec = (b.n - a.n) / Math.max(0.001, b.t - a.t);
  console.log(JSON.stringify({ nodesPerGameSecond: Math.round(perSec), gameSeconds: +(b.t - a.t).toFixed(1), phase: b.phase, voicesNow: b.voices }));
  if (strict && perSec > 60) { failed = true; console.log('AUDIO LOAD FAILED: too much node churn'); }
  if (errors.length) { failed = true; console.log(errors.slice(0, 5).join('\n')); }
  if (!failed) console.log('AUDIO LOAD OK');
} finally {
  await browser.close();
  server.close();
  if (failed) process.exitCode = 1;
}

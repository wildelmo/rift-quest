// Full stage play-through with the autopilot (invulnerable), fast-forwarded with fixed substeps.
// Verifies every wave and all three boss phases complete, with no runtime errors.
import { serve, launch, openGame } from './harness.mjs';
import { mkdirSync } from 'node:fs';

const out = 'tests/e2e/out';
mkdirSync(out, { recursive: true });
const query = process.argv[2] || 'bot&god&mute&substeps=24';
const limitMs = Number(process.argv[3] || 600000);
const server = await serve();
const browser = await launch();
let ok = false;
try {
  const { page, errors } = await openGame(browser, server.url, query, { width: 640, height: 400 });
  await page.evaluate(() => window.__rift.startDesktop());
  const t0 = Date.now();
  const seen = new Set();
  let last = '';
  while (Date.now() - t0 < limitMs) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => {
      const g = window.__rift.game;
      const info = window.__rift.renderer.info.render;
      return { state: g.state, label: g.waveLabel, phase: g.boss ? g.boss.phase : '-', score: Math.floor(g.score), t: Math.round(g.time), bullets: g.bullets.count, calls: info.calls, tris: info.triangles, lives: g.ship.lives, lvl: g.ship.level, opt: g.ship.optionCount };
    });
    const key = `${s.label}/${s.phase}/${s.state}`;
    if (!seen.has(key)) {
      seen.add(key);
      await page.screenshot({ path: `${out}/pt-${seen.size.toString().padStart(2, '0')}-${key.replace(/[^a-z0-9]+/gi, '_')}.png` });
    }
    const line = JSON.stringify(s);
    if (line !== last) console.log(Math.round((Date.now() - t0) / 1000) + 's', line);
    last = line;
    if (s.state === 'victory') { ok = true; break; }
    if (errors.length) break;
  }
  if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 10).join('\n'));
  console.log(ok && !errors.length ? 'PLAYTHROUGH OK' : 'PLAYTHROUGH FAILED');
  if (!ok || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

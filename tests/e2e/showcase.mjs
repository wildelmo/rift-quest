// Captures screenshots at authored moments for visual review: node tests/e2e/showcase.mjs [query]
import { serve, launch, openGame } from './harness.mjs';
import { mkdirSync } from 'node:fs';
const out = 'tests/e2e/out';
mkdirSync(out, { recursive: true });
const query = process.argv[2] || 'boss&bot&god&mute&substeps=8&eyecam';
const tag = process.argv[3] || 'show';
const server = await serve();
const browser = await launch();
try {
  const { page, errors } = await openGame(browser, server.url, query, { width: 900, height: 700 });
  await page.evaluate(() => window.__rift.startDesktop());
  const want = (process.argv[4] || 'intro,crown,lattice-laser,heart-bullets,dying,victory').split(',');
  const t0 = Date.now();
  while (want.length && Date.now() - t0 < 400000) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => { const g = window.__rift.game; return { state: g.state, phase: g.boss && g.boss.phase, lasers: g.lasers.items.filter(l => l.state === 'fire').length, bullets: g.bullets.count, wave: g.waveLabel, mites: g.swarm.mites.length, enemies: g.enemies.filter(e => e.alive).length }; });
    const cond = {
      intro: s.phase === 'intro', crown: s.phase === 'crown' && s.bullets > 60, 'lattice-laser': s.phase === 'lattice' && s.lasers > 0,
      'heart-bullets': s.phase === 'heart' && s.bullets > 150, dying: s.phase === 'dying', victory: s.state === 'victory',
      swarm: s.mites > 25, wave: s.enemies > 3 && s.bullets > 10, bloom: s.bullets > 60, mine: s.lasers >= 2 && s.phase === 'dormant',
    }[want[0]];
    if (cond) {
      await page.screenshot({ path: `${out}/${tag}-${want[0]}.png` });
      console.log('captured', want[0], JSON.stringify(s));
      want.shift();
    }
  }
  if (errors.length) console.log('ERRORS', errors.join('\n'));
} finally {
  await browser.close();
  server.close();
}

import { serve, launch, openGame } from './harness.mjs';
import { mkdirSync } from 'node:fs';
const out = 'tests/e2e/out';
mkdirSync(out, { recursive: true });
const server = await serve();
const browser = await launch();
try {
  const q = process.argv[2] || 'bot&god&mute&capture';
  const { page, errors } = await openGame(browser, server.url, q);
  await page.evaluate(() => window.__rift.startDesktop());
  const shots = Number(process.argv[3] || 4);
  const gap = Number(process.argv[4] || 3000);
  for (let i = 0; i < shots; i++) {
    await page.waitForTimeout(gap);
    const info = await page.evaluate(() => { const g = window.__rift.game; return { state: g.state, wave: g.waveIndex, label: g.waveLabel, score: Math.floor(g.score), bullets: g.bullets.count, enemies: g.enemies.filter(e=>e.alive).length, mites: g.swarm.mites.length, boss: g.boss && g.boss.phase, fps: 0 }; });
    console.log(i, JSON.stringify(info));
    await page.screenshot({ path: `${out}/smoke-${i}.png` });
  }
  console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
} finally {
  await browser.close();
  server.close();
}

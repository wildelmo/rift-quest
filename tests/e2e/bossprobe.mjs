// Boss difficulty probe: the autopilot fights the Gyre on each difficulty. Hits are counted
// (with a short invulnerability after each) instead of costing lives, so every run reaches the
// end. Reports seconds spent and hits taken per phase. A tuning aid, not a pass/fail test.
//   node tests/e2e/bossprobe.mjs [easy,normal,hard] [seed]
import { serve, launch, openGame } from './harness.mjs';

const diffs = (process.argv[2] || 'easy,normal,hard').split(',');
const seed = process.argv[3] || '7';
const server = await serve(4791);
const browser = await launch();
try {
  for (const key of diffs) {
    const { page, errors } = await openGame(browser, server.url, `boss&bot&mute&substeps=24&seed=${seed}`, { width: 320, height: 200 });
    await page.evaluate((k) => localStorage.setItem('rift.difficulty', k), key);
    await page.reload();
    await page.waitForFunction(() => window.__rift && window.__rift.game);
    await page.evaluate(() => {
      const g = window.__rift.game;
      window.__probe = { hits: {}, time: {}, escorts: 0, src: {} };
      let src = 'contact';
      for (const [name, sys] of [['laser', g.lasers], ['bullet', g.bullets]]) {
        const upd = sys.update.bind(sys);
        sys.update = (...a) => { src = name; try { return upd(...a); } finally { src = 'contact'; } };
      }
      g.shipHit = () => {
        const ph = g.boss ? g.boss.phase : '-';
        window.__probe.hits[ph] = (window.__probe.hits[ph] || 0) + 1;
        window.__probe.src[src] = (window.__probe.src[src] || 0) + 1;
        g.ship.invuln = 1.0;
      };
      let last = g.time;
      const tick = () => {
        const ph = g.boss ? g.boss.phase : '-';
        window.__probe.time[ph] = (window.__probe.time[ph] || 0) + (g.time - last);
        window.__probe.escorts = Math.max(window.__probe.escorts, g.enemies.filter((e) => e.kind === 'escort' && e.alive).length);
        last = g.time;
        requestAnimationFrame(tick);
      };
      tick();
      window.__rift.startDesktop();
    });
    const t0 = Date.now();
    while (Date.now() - t0 < 420000) {
      await page.waitForTimeout(2000);
      if (await page.evaluate(() => window.__rift.game.state === 'victory' || (window.__rift.game.boss && window.__rift.game.boss.defeated))) break;
      if (errors.length) break;
    }
    const r = await page.evaluate(() => window.__probe);
    const fmt = (o) => ['crown', 'lattice', 'heart'].map((p) => `${p} ${Math.round(o[p] || 0)}`).join('  ');
    console.log(`${key.padEnd(6)} time: ${fmt(r.time)}   hits: ${fmt(r.hits)}   max escorts ${r.escorts}   by ${JSON.stringify(r.src)}`);
    if (errors.length) console.log('ERRORS\n' + errors.slice(0, 5).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

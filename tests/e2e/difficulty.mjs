// Mortal autopilot run: reports where the bot dies. A rough difficulty probe, not a pass/fail test.
import { serve, launch, openGame } from './harness.mjs';
const server = await serve(4790);
const browser = await launch();
try {
  const { page, errors } = await openGame(browser, server.url, process.argv[2] || 'bot&mute&substeps=24', { width: 480, height: 300 });
  await page.evaluate(() => {
    const g = window.__rift.game;
    const orig = g.shipHit.bind(g);
    window.__deaths = [];
    g.shipHit = () => { const before = g.ship.lives, sh = g.ship.shield; orig(); if (g.ship.lives < before || (sh && !g.ship.shield)) window.__deaths.push(`${g.waveLabel}/${g.boss ? g.boss.phase : ''}${sh ? '(shield)' : ''}`); };
    // continue automatically so the probe covers the whole stage
    window.__rift.startDesktop();
  });
  const t0 = Date.now();
  let cont = 0;
  while (Date.now() - t0 < 600000) {
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => ({ state: window.__rift.game.state, label: window.__rift.game.waveLabel, ready: window.__rift.game.restReady }));
    if (s.state === 'gameover' && s.ready) {
      cont++;
      await page.evaluate(() => { const g = window.__rift.game; g.continues++; g.startGame(g.continueFrom, true); });
    }
    if (s.state === 'victory') break;
  }
  const deaths = await page.evaluate(() => window.__deaths);
  console.log('continues', cont, 'hits', deaths.length);
  console.log(deaths.join('\n'));
  if (errors.length) console.log('ERRORS', errors.join('\n'));
} finally { await browser.close(); server.close(); }

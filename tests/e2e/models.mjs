// Renders every model in a lineup for visual review: node tests/e2e/models.mjs
import { serve, launch, openGame } from './harness.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/e2e/out', { recursive: true });
const server = await serve(4793);
const browser = await launch();
try {
  const { page, errors } = await openGame(browser, server.url, 'mute&eyecam', { width: 1200, height: 700 });
  await page.evaluate(() => window.__rift.startDesktop());
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const { models, THREE, game, camera, room } = window.__rift;
    game.ship.setVisible(false);
    room.dimTarget = 0.6;
    const list = [
      [models.buildPlayerShip(), 2.4], [models.buildDart(), 2.8], [models.buildBloom(), 2.0],
      [models.buildLancer(), 1.6], [models.buildCarrier(), 0.95],
    ];
    const mites = models.miteGeometries();
    const mite = new THREE.Group();
    mite.add(new THREE.Mesh(mites.hull, models.hullMaterial({ metalness: 0.6, roughness: 0.35 })), new THREE.Mesh(mites.glow, models.getGlowMaterial()));
    list.push([mite, 5]);
    const root = new THREE.Group();
    game.hud.hidePanel();
    game.menu.hide();
    game.halo.visible = false;
    camera.fov = 40;
    camera.updateProjectionMatrix();
    camera.position.set(0, 1.42, 0.85);
    camera.lookAt(0, 1.32, -0.3);
    root.position.set(0, 1.32, -0.3);
    list.forEach(([m, s], i) => {
      m.scale.setScalar(s);
      m.position.set(-0.55 + (i % 3) * 0.55, i < 3 ? 0.13 : -0.13, 0);
      m.rotation.set(0.5, 0.7, 0);
      root.add(m);
    });
    window.__lineup = root;
    window.__rift.scene.add(root);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/e2e/out/models.png' });
  await page.evaluate(() => window.__lineup.children.forEach((m) => { m.rotation.set(0.15, Math.PI - 0.6, 0); }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/e2e/out/models-back.png' });
  console.log('errors', errors);
} finally { await browser.close(); server.close(); }

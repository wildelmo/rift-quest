// Isolated Chrome lifecycle QA. Set NODE_PATH to the bundled Playwright runtime.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.RIFT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader'] });
  const errors = [], results = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  const url = process.env.RIFT_URL || 'http://localhost:5173/';
  const load = async () => { await page.goto(url); await page.waitForFunction(() => !!window.__rift); };
  try {
    fs.mkdirSync('.artifacts', { recursive: true });
    await load(); await page.click('#practice'); await page.waitForFunction(() => window.__rift.sound.ctx?.state === 'running');
    await page.keyboard.press('p'); await page.waitForFunction(() => window.__rift.sound.ctx.state === 'suspended');
    const time = await page.evaluate(() => window.__rift.game.time); await page.waitForTimeout(180); assert.equal(await page.evaluate(() => window.__rift.game.time), time);
    for (const [id, value] of [['pause-volume', '.35'], ['pause-music-volume', '.2']]) await page.locator('#' + id).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await page.selectOption('#pause-difficulty', 'expert');
    const settings = await page.evaluate(() => ({ ...window.__rift.settings, running: window.__rift.sound.desiredRunning }));
    assert.equal(settings.volume, .35); assert.equal(settings.musicVolume, .2); assert.equal(settings.difficulty, 'expert'); assert.equal(settings.running, false);
    await page.screenshot({ path: '.artifacts/pause-settings.png' });
    await page.click('#resume'); await page.waitForFunction(() => window.__rift.sound.ctx.state === 'running');
    assert.ok(Math.abs(await page.evaluate(() => window.__rift.sound.master.gain.value) - .48 * .35) < .001);
    await page.evaluate(() => { window.oldContext = window.__rift.sound.ctx; window.__rift.returnHome(); });
    await page.waitForFunction(() => oldContext.state === 'closed'); assert.equal(await page.evaluate(() => window.__rift.sound.sources.size), 0);
    await page.click('#practice'); await page.waitForFunction(() => window.__rift.sound.ctx?.state === 'running');
    assert.equal(await page.evaluate(() => oldContext !== window.__rift.sound.ctx && oldContext.state === 'closed'), true);
    results.push('pause suspends audio and combat; settings apply; return to hangar closes old audio; restart creates a fresh context');
    await page.evaluate(() => { window.qaHidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => qaHidden }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__rift.sound.ctx.state === 'suspended');
    const frames = await page.evaluate(() => window.__rift.frameCount); await page.waitForTimeout(180); assert.equal(await page.evaluate(() => window.__rift.frameCount), frames);
    await page.evaluate(() => { window.qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(180); assert.equal(await page.evaluate(() => window.__rift.paused && window.__rift.sound.ctx.state === 'suspended' && window.__rift.loopRunning), true);
    results.push('hidden page stops rendering and audio; returning does not autoplay');
    await page.click('#resume'); await page.waitForFunction(() => window.__rift.sound.ctx.state === 'running');
    const shutdown = await page.evaluate(async () => {
      const r = window.__rift, c = r.sound.ctx; r.sound.event({ type: 'bomb' });
      const a = r.exitGame({ navigate: false, closeWindow: false }), b = r.exitGame({ navigate: false, closeWindow: false });
      const same = a === b; await a; const count = r.frameCount;
      await new Promise(resolve => setTimeout(resolve, 160));
      return { same, state: c.state, loop: r.loopRunning, framesStopped: count === r.frameCount, voices: r.sound.sources.size, canvases: document.querySelectorAll('#viewport canvas').length, disposed: r.view.disposed, playing: r.playing };
    });
    assert.deepEqual(shutdown, { same: true, state: 'closed', loop: false, framesStopped: true, voices: 0, canvases: 0, disposed: true, playing: false });
    results.push('Exit during long effects closes AudioContext, removes all sources and canvas, disposes graphics, stops frames; repeated Exit is safe');
    await load(); assert.equal(await page.locator('#difficulty').inputValue(), 'expert'); assert.equal(await page.locator('#volume').inputValue(), '0.35');
    await page.click('#practice'); await page.keyboard.press('p');
    let exitSnapshot;
    await page.exposeFunction('reportExit', value => { exitSnapshot = value; });
    await page.evaluate(() => { const r = window.__rift, c = r.sound.ctx; window.close = () => { reportExit({ audio: c.state, loop: r.loopRunning, disposed: r.view.disposed, sources: r.sound.sources.size }); }; });
    await page.click('#exit'); await page.waitForURL('**/closed.html');
    assert.deepEqual(exitSnapshot, { audio: 'closed', loop: false, disposed: true, sources: 0 });
    assert.equal(await page.locator('script,canvas,audio,video,iframe').count(), 0); assert.equal(await page.locator('h1').textContent(), 'Game closed.');
    results.push('browser-blocked tab closure falls back to a static page with no scripts, media, or renderer');
    // Fake only the WebXR transport. Exercise the real session events/controller menu.
    await page.addInitScript(() => {
      class FakeSession extends EventTarget {
        constructor() { super(); this.visibilityState = 'visible'; this.inputSources = ['left', 'right'].map(handedness => ({ handedness, gamepad: { axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, () => ({ pressed: false })) } })); this.ends = 0; }
        async end() { this.ends++; this.dispatchEvent(new Event('end')); }
      }
      Object.defineProperty(navigator, 'xr', { configurable: true, value: { isSessionSupported: async () => true, requestSession: async () => (window.fakeSession = new FakeSession()) } });
    });
    await load(); await page.evaluate(() => { window.__rift.view.renderer.xr.setSession = async () => {}; window.close = () => {}; });
    await page.click('#enter-xr'); await page.waitForFunction(() => document.body.classList.contains('xr'));
    const anchoring=await page.evaluate(()=>{
      const r=window.__rift,renderer=r.view.renderer,original=renderer.setAnimationLoop.bind(renderer);let animate;
      renderer.setAnimationLoop=callback=>{if(callback)animate=callback;return original(callback);};
      fakeSession.visibilityState='hidden';fakeSession.dispatchEvent(new Event('visibilitychange'));
      fakeSession.visibilityState='visible';fakeSession.dispatchEvent(new Event('visibilitychange'));
      const pose=x=>({transform:{orientation:{x:0,y:0,z:0,w:1},position:{x,y:1.7,z:0}}});
      animate(1000,{getViewerPose:()=>pose(1)});const before=r.view.root.position.toArray();
      animate(1011,{getViewerPose:()=>pose(2)});
      document.getElementById('pause-music-volume').dispatchEvent(new Event('input'));
      const after=r.view.root.position.toArray();
      r.menu.selected=4;fakeSession.inputSources[0].gamepad.axes[2]=1;r.readInput(.01,99);fakeSession.inputSources[0].gamepad.axes[2]=0;
      const fitted=r.view.root.position.toArray();r.menu.open();renderer.setAnimationLoop=original;
      return{before,after,fitted};
    });
    assert.deepEqual(anchoring.after,anchoring.before);assert.notDeepEqual(anchoring.fitted,anchoring.before);
    results.push('volume changes preserve the world anchor; deliberate room-fit changes reposition the arena');
    const xrMenu = await page.evaluate(() => {
      const r = window.__rift, left = fakeSession.inputSources[0].gamepad;
      left.axes[3] = 1; r.readInput(.01, 100); left.axes[3] = 0; r.readInput(.01, 100.1);
      left.axes[2] = -1; r.readInput(.01, 100.2); left.axes[2] = 0;
      r.view.hudUpdate(r.game, true, true, null, r.settings, { rows: r.menu.rows(r.settings), selected: r.menu.selected });
      return { selected: r.menu.selected, volume: r.settings.volume, visible: r.view.pausePanel.visible, png: r.view.pausePanel.userData.canvas.toDataURL() };
    });
    assert.equal(xrMenu.selected, 1); assert.equal(xrMenu.volume, .3); assert.equal(xrMenu.visible, true);
    fs.writeFileSync('.artifacts/xr-pause-menu.png', Buffer.from(xrMenu.png.split(',')[1], 'base64'));
    await page.evaluate(async () => { await window.__rift.sound.start(); fakeSession.visibilityState = 'hidden'; fakeSession.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__rift.sound.ctx.state === 'suspended'); assert.equal(await page.evaluate(() => window.__rift.loopRunning), false);
    await page.evaluate(() => {
      const xr=window.__rift.view.renderer.xr;Object.defineProperty(xr,'isPresenting',{configurable:true,value:true});
      const renderer=window.__rift.view.renderer,original=renderer.setAnimationLoop.bind(renderer);window.qaDesktopStarts=0;
      renderer.setAnimationLoop=callback=>{if(callback)qaDesktopStarts++;return original(callback);};
      fakeSession.visibilityState = 'visible'; fakeSession.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(xr,'isPresenting',{configurable:true,value:false});
    });
    assert.equal(await page.evaluate(()=>qaDesktopStarts),0);
    assert.equal(await page.evaluate(() => window.__rift.paused && window.__rift.sound.ctx.state === 'suspended'), true);
    await page.evaluate(() => { const r = window.__rift; r.menu.selected = 8; fakeSession.inputSources[1].gamepad.buttons[0].pressed = true; r.readInput(.01, 101); });
    await page.waitForURL('**/closed.html');
    results.push('XR controller menu adjusts volume, pauses on XR visibility loss, and exits with right trigger');
    await load(); await page.evaluate(() => { window.__rift.view.renderer.xr.setSession = async () => {}; window.close = () => {}; });
    await page.click('#enter-xr'); await page.waitForFunction(() => document.body.classList.contains('xr'));
    await page.evaluate(async () => { await window.__rift.sound.start(); await fakeSession.end(); });
    await page.waitForURL('**/closed.html');
    results.push('headset/system session end uses the same full shutdown');
    await load(); const race = await page.evaluate(async () => { const r = window.__rift; const starting = r.sound.start(); const c = r.sound.ctx; await r.exitGame({ navigate: false, closeWindow: false }); await starting.catch(() => {}); return { state: c.state, ctx: r.sound.ctx, sources: r.sound.sources.size, frames: r.loopRunning }; });
    assert.deepEqual(race, { state: 'closed', ctx: null, sources: 0, frames: false });
    results.push('Exit wins over an in-flight audio resume');
    await load(); await page.evaluate(() => { window.__rift.view.renderer.xr.setSession = async () => {}; window.close = () => {}; });
    await page.click('#enter-xr'); await page.waitForFunction(() => document.body.classList.contains('xr'));
    await page.evaluate(() => { fakeSession.end=()=>{throw new Error('Session already gone');};window.__rift.exitGame(); });
    await page.waitForURL('**/closed.html');results.push('failed XR end still completes shutdown and fallback');
    await page.evaluate(url=>{const button=document.createElement('button');button.id='qa-popup';button.textContent='Play';button.onclick=()=>window.open(url,'rift-qa');document.body.append(button);},url);
    const popupPromise=page.waitForEvent('popup');await page.click('#qa-popup');const popup=await popupPromise;
    await popup.waitForFunction(()=>!!window.__rift);await popup.click('#practice');await popup.keyboard.press('p');
    const closed=popup.waitForEvent('close');await popup.click('#exit');await closed;results.push('Exit also closes a browser tab that permits script closure');
    assert.deepEqual(errors, []); console.log(JSON.stringify({ results, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

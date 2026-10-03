// Isolated browser QA. Run with NODE_PATH pointing to the bundled Playwright runtime.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.RIFT_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-webgl']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  try {const errors=[];page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('.artifacts',{recursive:true});
  await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
  await page.screenshot({path:'.artifacts/hangar.png',fullPage:true});
  await page.click('#practice');await page.keyboard.press('e');await page.keyboard.press('p');await page.waitForFunction(()=>document.getElementById('bombs').textContent==='01');
  assert.equal(await page.locator('#bombs').textContent(),'01');assert.ok(await page.locator('#overlay').isVisible());
  await page.click('#restart');
  await page.evaluate(()=>{const {game:g}=window.__rift;for(let i=0;i<90*26;i++){g.player.invincible=10;g.update(1/90,{fire:true,y:Math.sin(i*.007)});}g.player.invincible=0;g.drainEvents();});
  await page.waitForTimeout(150);await page.keyboard.press('p');
  // Pause overlay is removed only in this QA capture to show a frozen representative combat field.
  await page.evaluate(()=>{document.getElementById('overlay').hidden=true;});
  await page.screenshot({path:'.artifacts/combat.png'});
  const combat=await page.evaluate(()=>({hostiles:window.__rift.game.shots.filter(s=>s.hostile).length,drawCalls:window.__rift.view.renderer.info.render.calls,triangles:window.__rift.view.renderer.info.render.triangles}));
  await page.keyboard.press('p');
  await page.evaluate(()=>{const {game:g,view:v}=window.__rift;g.reset();v.clear();g.spawnBoss();g.boss.entry=0;g.boss.hp=390;for(let i=0;i<90*8;i++){g.player.invincible=10;g.update(1/90,{fire:true});}g.player.invincible=0;g.drainEvents();v.burst({x:-.5,y:.2,color:'orange',size:1.2});});
  await page.waitForTimeout(80);await page.keyboard.press('p');await page.evaluate(()=>{document.getElementById('overlay').hidden=true;});
  await page.screenshot({path:'.artifacts/boss.png'});
  const boss=await page.evaluate(()=>({hostiles:window.__rift.game.shots.filter(s=>s.hostile).length,drawCalls:window.__rift.view.renderer.info.render.calls,triangles:window.__rift.view.renderer.info.render.triangles}));
  await page.keyboard.press('p');await page.evaluate(()=>{const{game:g,view:v}=window.__rift;g.reset();v.clear();g.spawnBoss(true);g.boss.entry=0;for(let i=0;i<90*8;i++){g.player.invincible=10;g.update(1/90,{fire:true});}g.player.invincible=0;g.drainEvents();});await page.waitForTimeout(120);await page.keyboard.press('p');await page.evaluate(()=>{document.getElementById('overlay').hidden=true;});await page.screenshot({path:'.artifacts/gatekeeper.png'});
  console.log(JSON.stringify({errors,combat,boss},null,2));assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Visual compositing fixtures are QA-only; the shipped game never draws a room background.
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.RIFT_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader']});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|GL_INVALID|VALIDATE_STATUS/i.test(m.text()))errors.push(m.text());});
 await page.goto('http://localhost:5173/');await page.waitForFunction(()=>!!window.__rift);await page.click('#practice');await page.keyboard.press('p');
 await page.evaluate(()=>{
  const r=window.__rift,g=r.game,v=r.view;v.renderer.setAnimationLoop(null);g.reset();v.clear();g.player.invincible=1;g.player.y=-2.2;
  for(const [i,type] of ['drone','dart','weaver','sentinel','carrier'].entries()){g.spawnEnemy(type,-.5);const e=g.enemies.at(-1);e.entry=0;e.x=-5+i*2.5;}
  for(const [i,kind] of ['needle','petal','orb','pulse','spread','rail'].entries())g.addShot(-5+i*2,1.5,-2,0,i<3,1,kind,kind==='rail'?.03:kind==='pulse'?.045:.055);
  v.camera.fov=60;v.camera.position.set(0,0,1.98/(3.8/16));v.camera.updateProjectionMatrix();v.update(g,0,0);v.ship.scale.setScalar(.34);v.debris.visible=false;v.corners.visible=false;
  document.getElementById('game-ui').hidden=true;document.getElementById('overlay').hidden=true;document.body.style.background='transparent';
 });
 const fixtures={white:'#f5f4ef',warm:'linear-gradient(90deg,#d4b48c 0 18%,#f5eee1 18% 58%,#d3c1aa 58% 61%,#fffbee 61% 90%,#b5a183 90%)',busy:'repeating-linear-gradient(90deg,transparent 0 47px,#57423799 48px 51px),repeating-linear-gradient(0deg,#b0a391 0 26px,#f4eee1 26px 58px,#a3b8ae 58px 83px,#645747 83px 95px)',dark:'#15212c'};
 fs.mkdirSync('.artifacts',{recursive:true});const evidence=[];
 for(const [name,background] of Object.entries(fixtures)){
  await page.evaluate(background=>{document.documentElement.style.background=background;window.__rift.view.render(0,true);},background);
  await page.screenshot({path:`.artifacts/contrast-${name}.png`});
  const report=await page.evaluate(()=>{
    const{game:g,view:v}=window.__rift;v.render(0,true);const output=document.createElement('canvas');output.width=v.renderer.domElement.width;output.height=v.renderer.domElement.height;const c=output.getContext('2d');c.drawImage(v.renderer.domElement,0,0);const image=c.getImageData(0,0,output.width,output.height),pixels=image.data;
    const sample=(x,y)=>{const i=(y*output.width+x)*4;return{r:pixels[i],g:pixels[i+1],b:pixels[i+2],alpha:pixels[i+3]/255};};
    const marks=g.shots.map(s=>{const p=v.ship.position.clone().set(s.x,s.y,0).project(v.camera),cx=Math.round((p.x*.5+.5)*output.width),cy=Math.round((-.5*p.y+.5)*output.height);let dark=0,colored=0,opaque=0;
      for(let y=cy-12;y<=cy+12;y++)for(let x=cx-20;x<=cx+20;x++){const p=sample(x,y);if(p.alpha>.95){opaque++;if(Math.max(p.r,p.g,p.b)<90)dark++;if(Math.max(p.r,p.g,p.b)-Math.min(p.r,p.g,p.b)>65)colored++;}}
      return{kind:s.kind,center:sample(cx,cy),dark,colored,opaque};
    });
    return{marks,draws:v.renderer.info.render.calls,alpha:v.renderer.getClearAlpha(),background:v.scene.background,shipVisible:v.ship.visible,contours:v.ship.getObjectsByProperty('name','contrast-contour').length,brokenPrograms:v.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
  });
  for(const m of report.marks){assert.ok(m.dark>=4,`${name}/${m.kind} missing solid dark edge`);assert.ok(m.colored>=2,`${name}/${m.kind} missing colored body`);assert.ok(m.center.alpha>.95,`${name}/${m.kind} not opaque`);}
  assert.equal(report.alpha,0);assert.equal(report.background,null);assert.equal(report.shipVisible,true);assert.equal(report.contours,2);assert.equal(report.brokenPrograms,0);evidence.push({name,...report});
 }
 await page.evaluate(()=>{const v=window.__rift.view;v.camera.position.z=2.44/(2.4/16);v.camera.updateProjectionMatrix();v.render(0,true);document.documentElement.style.background='#f5f4ef';});
 await page.screenshot({path:'.artifacts/contrast-farthest-small-arena.png'});
 const minimum=await page.evaluate(()=>{
  const{game:g,view:v}=window.__rift;v.render(0,true);const c=document.createElement('canvas');c.width=v.renderer.domElement.width;c.height=v.renderer.domElement.height;const ctx=c.getContext('2d');ctx.drawImage(v.renderer.domElement,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
  return g.shots.map(s=>{const q=v.ship.position.clone().set(s.x,s.y,0).project(v.camera),cx=Math.round((q.x*.5+.5)*c.width),cy=Math.round((-.5*q.y+.5)*c.height);let solid=0,dark=0;for(let y=cy-6;y<=cy+6;y++)for(let x=cx-25;x<=cx+25;x++){const i=(y*c.width+x)*4;if(data[i+3]>240){solid++;if(Math.max(data[i],data[i+1],data[i+2])<90)dark++;}}return{kind:s.kind,solid,dark};});
 });for(const mark of minimum){assert.ok(mark.solid>=6);assert.ok(mark.dark>=3,mark.kind+' loses its dark edge at maximum distance');}
 await page.evaluate(()=>{const v=window.__rift.view;v.camera.position.set(5,1,9);v.camera.lookAt(0,0,0);v.camera.updateProjectionMatrix();v.render(0,true);});
 await page.screenshot({path:'.artifacts/contrast-side-view.png'});
 const planes=await page.evaluate(()=>{const v=window.__rift.view;return{layers:[v.bulletOutline,v.bullets,v.bulletCore].map(m=>Array.from(m.instanceMatrix.array.slice(12,15))),marker:[v.hitbox.position.z,v.playerBeaconOutline.position.z]};});
 assert.deepEqual(planes.layers[0],planes.layers[1]);assert.deepEqual(planes.layers[1],planes.layers[2]);assert.deepEqual(planes.marker,[0,0]);
 await page.evaluate(()=>{const v=window.__rift.view;v.camera.position.set(0,0,1.98/(3.8/16));v.camera.lookAt(0,0,0);v.camera.updateProjectionMatrix();});
 await page.evaluate(()=>{const r=window.__rift;r.game.spawnBoss();const b=r.game.boss;b.entry=0;b.x=5;b.laserY=-1;b.warning=1;r.view.burst({x:0,y:1.5,color:'orange',size:1.3});r.view.update(r.game,.08,.08);document.documentElement.style.background='#f5f4ef';r.view.render(.08,true);});
 await page.screenshot({path:'.artifacts/contrast-warning-and-burst.png'});
 await page.evaluate(()=>{const r=window.__rift;r.game.boss.warning=0;r.game.boss.laser=.8;r.view.update(r.game,.1,.18);r.view.render(.18,true);});await page.screenshot({path:'.artifacts/contrast-beam.png'});
 const layers=await page.evaluate(()=>{const v=window.__rift.view;return{threats:[v.bulletOutline,v.bullets,v.bulletCore].map(m=>({order:m.renderOrder,depth:m.material.depthTest,opacity:m.material.opacity})),particles:v.particleMesh.renderOrder,warning:v.objects.get(window.__rift.game.boss.id).userData.warning.getObjectByName('warning-core').visible,beam:v.objects.get(window.__rift.game.boss.id).userData.laser.getObjectByName('energy').material.blending};});
 assert.ok(layers.threats.every(m=>m.order>layers.particles&&!m.depth&&m.opacity===1));assert.deepEqual(errors,[]);
 const burstReading=await page.evaluate(()=>{
  const r=window.__rift,g=r.game,v=r.view;g.reset();v.clear();g.player.invincible=999;
  for(let i=0;i<90*26;i++)g.update(1/90,{fire:true,y:Math.sin(i*.007)});g.drainEvents();
  const s=g.shots.find(s=>s.hostile&&Math.abs(s.x)<5&&Math.abs(s.y)<3);if(!s)throw new Error('Busy scene has no probe projectile');
  v.burst({x:s.x,y:s.y,color:'orange',size:1.8});v.update(g,.06,.24);v.render(.24,true);
  const canvas=document.createElement('canvas');canvas.width=v.renderer.domElement.width;canvas.height=v.renderer.domElement.height;const ctx=canvas.getContext('2d');ctx.drawImage(v.renderer.domElement,0,0);
  const q=v.ship.position.clone().set(s.x,s.y,0).project(v.camera),cx=Math.round((q.x*.5+.5)*canvas.width),cy=Math.round((-.5*q.y+.5)*canvas.height),pixel=Array.from(ctx.getImageData(cx,cy,1,1).data);
  return{pixel,hostiles:g.shots.filter(s=>s.hostile).length,particles:v.particles.length,draws:v.renderer.info.render.calls};
 });
 assert.ok(burstReading.pixel[0]>200&&burstReading.pixel[1]>180&&burstReading.pixel[2]>150&&burstReading.pixel[3]>240,'Explosion obscures the threat core');
 await page.screenshot({path:'.artifacts/contrast-busy-combat.png'});
 assert.deepEqual(errors,[]);
 fs.writeFileSync('.artifacts/contrast-evidence.json',JSON.stringify({errors,evidence,layers,minimum,burstReading},null,2));console.log(JSON.stringify({errors,fixtures:evidence.map(({name,draws})=>({name,draws})),minimum,layers,burstReading},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

import * as THREE from 'three';
const MINT = 0xb4ffe2, ORANGE = 0xff7545, DARK = 0x183b36, WHITE = 0xeaf5df;
const colors = { SPREAD: 0xffc570, LANCE: 0x98dfff, ECHO: 0xd4a8ff, SHIELD: MINT, BOMB: ORANGE };
export class View {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x000000, 0); this.renderer.xr.enabled = true; this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; container.append(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xd1ffe9, 0x253e45, 2.4));
    const key = new THREE.DirectionalLight(0xffe5cf, 3.4); key.position.set(-3, 5, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x57e5c5, 2); rim.position.set(1, -2, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .01, 100);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.geo = { sphere: new THREE.IcosahedronGeometry(1, 1), smooth: new THREE.SphereGeometry(1, 12, 8), box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(1, 1, 5), ring: new THREE.TorusGeometry(1, .035, 5, 48), oct: new THREE.OctahedronGeometry(1) };
    this.mat = {};
    this.material = (c, emissive = false, metal = false) => { const id = `${c}-${emissive}-${metal}`; return this.mat[id] ||= emissive ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshStandardMaterial({ color: c, metalness: metal ? .7 : .25, roughness: .38 }); };
    this.ship = this.makeShip(); this.ship.scale.setScalar(.5); this.root.add(this.ship);
    this.echo = this.makeShip(); this.echo.scale.setScalar(.32); this.root.add(this.echo);
    this.shield = new THREE.Mesh(this.geo.ring, this.material(MINT, true)); this.shield.scale.setScalar(.36); this.root.add(this.shield);
    this.charge = new THREE.Mesh(this.geo.smooth, this.material(0xc7ecff, true)); this.root.add(this.charge);
    this.objects = new Map(); this.pickupObjects = new Map(); this.effectObjects = new Map(); this.particles = [];
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.bullets = new THREE.InstancedMesh(this.geo.smooth, new THREE.MeshBasicMaterial({ color: 0xffffff }), 450); this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bullets.frustumCulled = false; this.root.add(this.bullets);
    this.particleMesh = new THREE.InstancedMesh(this.geo.oct, new THREE.MeshBasicMaterial({ color: 0xffffff }), 500); this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.frustumCulled = false; this.root.add(this.particleMesh);
    this.debris = new THREE.Group(); this.root.add(this.debris);
    for (let i = 0; i < 24; i++) { const shard = this.mesh('oct', i % 3 ? 0x426e63 : 0xcb7851, false, [0,0,0], [.03 + (i % 3) * .03, .02, .12]); shard.position.set((i * 3.71 % 20) - 10, Math.sin(i * 2.1) * 4.8, i % 2 ? -1.1 - (i % 4) * .5 : .8 + (i % 3) * .6); shard.userData.speed = .3 + (i % 3) * .22; this.debris.add(shard); }
    this.corners = new THREE.Group(); this.root.add(this.corners);
    for (const x of [-8,8]) for (const y of [-4.5,4.5]) { this.corners.add(this.mesh('box', 0x779387, true, [x - Math.sign(x)*.15,y,0], [.3,.015,.015])); this.corners.add(this.mesh('box', 0x779387, true,[x,y-Math.sign(y)*.15,0],[.015,.3,.015])); }
    this.hud = this.textPanel(1536, 180, 15, 1.76); this.hud.position.set(0, 5.1, 0); this.root.add(this.hud);
    this.message = this.textPanel(1536, 560, 11.5, 4.2); this.message.position.set(0, .4, .4); this.root.add(this.message);
    this.bossBar = this.textPanel(1024, 110, 7, .75); this.bossBar.position.set(1.5, -4.85, 0); this.root.add(this.bossBar);
    this.previewScene = new THREE.Scene(); this.previewScene.add(new THREE.HemisphereLight(0xd4ffed,0x18332c,3));
    const previewLight = new THREE.DirectionalLight(0xffdac6,4); previewLight.position.set(-2,4,5); this.previewScene.add(previewLight);
    this.previewCamera = new THREE.PerspectiveCamera(34, 1.5, .01,100); this.previewCamera.position.set(0,0,6.2);
    this.previewShip = this.makeShip(); this.previewShip.scale.setScalar(5); this.previewScene.add(this.previewShip);
    this.previewRing = new THREE.Group(); this.previewScene.add(this.previewRing);
    for (let i = 0; i < 2; i++) { const ring = new THREE.Mesh(this.geo.ring,this.material(i ? 0x38554b : 0x608b76,true)); ring.scale.setScalar(1.35 + i*.1); ring.rotation.x=.45; ring.rotation.y=-.6; this.previewRing.add(ring); }
    addEventListener('resize', () => this.resize()); this.resize();
  }
  mesh(shape,c,emissive=false,pos=[0,0,0],scale=[1,1,1]) { const m = new THREE.Mesh(this.geo[shape],this.material(c,emissive)); m.position.set(...pos); m.scale.set(...scale); return m; }
  makeShip() {
    const g = new THREE.Group();
    const body = this.mesh('cone',WHITE,false,[.03,0,0],[.12,.5,.1]); body.rotation.z=-Math.PI/2; g.add(body);
    g.add(this.mesh('box',DARK,false,[-.07,0,.035],[.3,.12,.11]));
    g.add(this.mesh('smooth',0x75d7d9,false,[.04,0,.085],[.13,.065,.055]));
    for (const side of [-1,1]) { const wing=this.mesh('cone',0xe47749,false,[-.1,side*.115,-.015],[.1,.3,.045]); wing.rotation.z=side>0 ? -2.1 : -1.05; g.add(wing); g.add(this.mesh('box',WHITE,false,[-.16,side*.17,.02],[.19,.035,.07])); const engine=this.mesh('cone',MINT,true,[-.31,side*.09,0],[.035,.23,.035]); engine.rotation.z=Math.PI/2; engine.name='engine'; g.add(engine); }
    g.add(this.mesh('smooth',MINT,true,[.08,0,.137],[.038,.038,.01])); return g;
  }
  enemy(e) {
    const g=new THREE.Group(); const boss=!!e.maxHp;
    g.add(this.mesh('sphere',boss ? 0x334e4b : 0x436b60,false,[0,0,-.04],[e.r,e.r,e.r*.65]));
    const core=this.mesh('sphere',ORANGE,true,[0,0,e.r*.6],[e.r*.58,e.r*.58,e.r*.28]); core.name='core'; g.add(core);
    if (boss) {
      const machinery=new THREE.Group(); machinery.name='machinery'; g.add(machinery);
      for(let i=0;i<3;i++) { const ring=this.mesh('ring',i===1?0xd18054:0x668579,false,[0,0,-.25-i*.6],[e.r*(1.5+i*.65),e.r*(1.5+i*.65),e.r*(1.5+i*.65)]); ring.rotation.y=i*.35; machinery.add(ring); }
      for(let i=0;i<8;i++) { const a=i/8*Math.PI*2, arm=new THREE.Group(); arm.position.set(Math.cos(a)*e.r*1.7,Math.sin(a)*e.r*1.7,-.5); arm.rotation.z=a; arm.add(this.mesh('box',0x496359,false,[0,0,0],[e.r*1.2,.16,.22])); arm.add(this.mesh('oct',0x9e785e,false,[e.r*.5,0,-.45],[.22,.2,1.2])); machinery.add(arm); }
      const halo=this.mesh('ring',ORANGE,true,[0,0,.02],[e.r*1.03,e.r*1.03,e.r*1.03]); g.add(halo);
      // The narrow amber ring marks the only collidable boss body.
      const warn=this.mesh('box',0xffb168,true,[-7,0,.015],[14,.025,.015]); warn.name='warning'; warn.visible=false; this.root.add(warn); g.userData.warning=warn;
      const laser=this.mesh('box',0xffe6b5,true,[-7,0,0],[14,.3,.02]); laser.name='laser'; laser.visible=false; this.root.add(laser); g.userData.laser=laser;
    } else {
      for (const s of [-1,1]) { const wing=this.mesh(e.type==='dart'?'cone':'box',e.type==='carrier'?0xcda36a:0x759184,false,[.06,s*e.r*.9,-.08],[e.r*1.8,.09,.13]); wing.rotation.z=s*.4; g.add(wing); }
      if (e.type==='sentinel'||e.type==='carrier') g.add(this.mesh('ring',0xdfb87a,true,[0,0,0],[e.r*1.3,e.r*1.3,e.r*1.3]));
      if(e.type==='dart'){const nose=this.mesh('cone',0xd4b199,false,[-.25,0,-.03],[.15,.44,.1]);nose.rotation.z=Math.PI/2;g.add(nose);}
      if(e.type==='weaver')for(const side of [-1,1]){const fin=this.mesh('oct',0x78a999,false,[.12,side*.29,-.06],[.24,.13,.12]);fin.rotation.z=side*.55;g.add(fin);}
      if(e.type==='carrier')for(const side of [-1,1])g.add(this.mesh('box',0xe0ab70,false,[.06,side*.35,-.08],[.55,.14,.2]));
    }
    this.root.add(g); return g;
  }
  textPanel(w,h,width,height) {
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material); panel.userData={canvas,ctx:canvas.getContext('2d'),texture,last:''}; return panel;
  }
  paintPanel(panel, key, draw) { if(panel.userData.last===key)return; panel.userData.last=key; const {canvas,ctx,texture}=panel.userData; ctx.clearRect(0,0,canvas.width,canvas.height); draw(ctx,canvas.width,canvas.height); texture.needsUpdate=true; }
  hudUpdate(game, xr, paused, message, settings) {
    const p=game.player; this.hud.visible=xr; this.message.visible=xr && (paused || game.state!=='playing' || !!message); this.corners.visible=!xr || paused;
    if (xr) this.paintPanel(this.hud,`${p.hp}/${p.shield}/${p.weapon}/${p.level}/${p.echo}/${game.bombs}/${game.score}/${Math.floor(p.charge*10)}`,c=>{
      c.fillStyle='#101e19dd'; c.fillRect(0,30,1536,125); c.fillStyle='#ff956b'; c.font='bold 32px monospace'; c.fillText('RIFT / 01',30,78);
      c.fillStyle='#edfae8'; c.font='26px monospace'; c.fillText(`HULL ${'◆'.repeat(Math.max(0,p.hp))}  SHIELD ${p.shield}`,30,123); c.fillText(`${p.weapon} ${p.level} ${p.echo?'+ ECHO':''}`,570,78); c.fillText(`BOMBS ${game.bombs}  CHARGE ${Math.floor(p.charge/1.4*100)}%`,570,123); c.fillStyle='#b4ffe2'; c.font='bold 43px monospace'; c.fillText(String(game.score).padStart(6,'0'),1280,107);
    });
    const ended=game.state==='won'||game.state==='lost';
    const title=ended ? game.state==='won'?'CATHEDRAL DOWN':'SIGNAL LOST' : paused?'FLIGHT STANDBY':message?.title;
    const subtitle=ended ? `SCORE ${String(game.score).padStart(6,'0')}  /  ${game.kills} TARGETS` : paused?`DISTANCE ${(settings.distance*3.281).toFixed(1)} FT  ·  WIDTH ${(settings.width*3.281).toFixed(1)} FT`:message?.subtitle;
    if(xr && this.message.visible) this.paintPanel(this.message,`${title}/${subtitle}`, (c,w,h)=>{
      if(paused||ended) {c.fillStyle='#102019ed';c.fillRect(0,0,w,h); c.strokeStyle='#729b85';c.lineWidth=2;c.strokeRect(2,2,w-4,h-4);}
      c.textAlign='center';c.shadowColor='#081510';c.shadowBlur=8;c.fillStyle='#ff9468';c.font=`bold ${paused||ended?66:48}px monospace`;c.fillText(title||'',w/2,paused||ended?130:100);
      c.fillStyle='#daf7e5';c.font='28px monospace';c.fillText(subtitle||'',w/2,paused||ended?205:157);
      if(paused){c.font='28px monospace';c.fillText('LEFT STICK: WIDTH / DISTANCE   ·   X: RECENTER',w/2,290);c.fillText('RIGHT TRIGGER: DEPLOY / RESUME   ·   B: PAUSE',w/2,348);c.fillStyle='#9cbaa9';c.font='24px monospace';c.fillText('FLY: LEFT STICK   FIRE: RIGHT TRIGGER   CHARGE: RIGHT GRIP',w/2,430);c.fillText('A: PULSE BOMB   ·   AMBER CORES & BULLETS CAN HIT YOU',w/2,477);}
      if(ended){c.font='30px monospace';c.fillText('RIGHT TRIGGER TO FLY AGAIN',w/2,350);c.fillStyle='#9cbaa9';c.font='24px monospace';c.fillText('Use the system menu to leave mixed reality.',w/2,425);}
    });
    this.bossBar.visible=!!game.boss;
    if(game.boss) {const b=game.boss;this.paintPanel(this.bossBar,`${b.type}/${Math.ceil(b.hp)}/${b.phase}`,c=>{c.fillStyle='#13241dea';c.fillRect(0,0,1024,110);c.fillStyle='#ffbc8b';c.font='23px monospace';c.fillText(`${b.type.toUpperCase()} / PHASE ${b.phase}`,20,35);c.fillStyle='#3e5549';c.fillRect(20,60,984,22);c.fillStyle='#ff7545';c.fillRect(20,60,984*Math.max(0,b.hp/b.maxHp),22);});}
  }
  burst(e) { for(let i=0;i<Math.min(60,e.size*20);i++){if(this.particles.length>=500)this.particles.shift();const angle=Math.random()*Math.PI*2,speed=(.4+Math.random()*2)*e.size;this.particles.push({x:e.x,y:e.y,z:0,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:(Math.random()-.5)*speed*1.4,life:.4+Math.random()*.6,age:0,color:e.color==='orange'?ORANGE:MINT,size:.018+Math.random()*.04});} }
  clear() { for(const map of [this.objects,this.pickupObjects,this.effectObjects]){for(const obj of map.values())this.removeObject(obj);map.clear();}this.particles=[]; }
  removeObject(obj){this.root.remove(obj);if(obj.userData.warning)this.root.remove(obj.userData.warning);if(obj.userData.laser)this.root.remove(obj.userData.laser);if(obj.userData.label){obj.userData.label.geometry.dispose();obj.userData.label.material.map.dispose();obj.userData.label.material.dispose();}}
  sync(map,items,create,update){const ids=new Set();for(const e of items){ids.add(e.id);let obj=map.get(e.id);if(!obj){obj=create(e);map.set(e.id,obj);}update(obj,e);}for(const [id,obj]of map)if(!ids.has(id)){this.removeObject(obj);map.delete(id);}}
  update(game,dt,time){
    const p=game.player;this.ship.position.set(p.x,p.y,0);this.ship.rotation.x=Math.sin(time*3)*.07;this.ship.rotation.y=.07;this.ship.visible=!(p.invincible>0&&Math.floor(time*14)%2===0);
    this.echo.visible=p.echo;this.echo.position.set(p.x-.3,p.y+.45,0);this.echo.rotation.x=time;
    this.shield.visible=p.shield>0;this.shield.position.set(p.x,p.y,0);this.shield.rotation.y=Math.sin(time*2)*.3;
    this.charge.visible=p.charge>.1;this.charge.position.set(p.x+.3,p.y,0);this.charge.scale.setScalar(.025+p.charge*.08);
    this.ship.children.filter(c=>c.name==='engine').forEach(c=>c.scale.y=.17+Math.sin(time*45)*.05);
    this.sync(this.objects,game.enemies,e=>this.enemy(e),(g,e)=>{g.position.set(e.x,e.y,Math.max(0,e.entry)*-1.2);const core=g.getObjectByName('core');core.material=this.material(e.flash>0?WHITE:ORANGE,true);
      if(e.maxHp){const machine=g.getObjectByName('machinery');machine.rotation.z=e.age*.17;machine.rotation.y=Math.sin(e.age*.6)*.3;machine.scale.setScalar(1+(e.phase-1)*.12);const w=g.userData.warning,l=g.userData.laser;w.visible=e.warning>0&&Math.floor(time*8)%2===0;l.visible=e.laser>0;w.position.set((e.x-8)/2,e.laserY,0);l.position.copy(w.position);w.scale.x=l.scale.x=e.x+8;}
      else{g.rotation.x=Math.sin(e.age*2+e.phase)*.2;g.rotation.z=e.type==='weaver'?Math.sin(e.age*2)*.25:0;}
    });
    this.bullets.count=game.shots.length;game.shots.forEach((s,i)=>{this.dummy.position.set(s.x,s.y,0);this.dummy.rotation.set(0,0,Math.atan2(s.vy,s.vx));this.dummy.scale.set(s.hostile?s.r:s.kind==='lance'?.36:.19,s.r,s.r*.6);this.dummy.updateMatrix();this.bullets.setMatrixAt(i,this.dummy.matrix);this.bullets.setColorAt(i,this.color.setHex(s.hostile?s.kind==='orb'?0xffcf83:ORANGE:s.kind==='lance'?0x9bdfff:MINT));});this.bullets.instanceMatrix.needsUpdate=true;if(this.bullets.instanceColor)this.bullets.instanceColor.needsUpdate=true;
    this.sync(this.pickupObjects,game.pickups,item=>{const g=new THREE.Group();g.add(this.mesh('ring',colors[item.kind],true,[0,0,0],[.3,.3,.3]));g.add(this.mesh('oct',colors[item.kind],false,[0,0,0],[.18,.18,.18]));const label=this.textPanel(256,80,.85,.27);label.position.set(0,-.46,0);this.paintPanel(label,item.kind,c=>{c.fillStyle='#0b1712dd';c.fillRect(0,0,256,80);c.fillStyle='#edfbea';c.textAlign='center';c.font='bold 36px monospace';c.fillText(item.kind,128,54);});g.add(label);g.userData.label=label;this.root.add(g);return g;},(g,e)=>{g.position.set(e.x,e.y,0);g.children[0].rotation.y=Math.sin(e.age*2)*.4;g.children[1].rotation.set(e.age,e.age,0);});
    this.sync(this.effectObjects,game.effects,e=>{const g=this.mesh(e.kind==='beam'?'box':'ring',e.kind==='beam'?0xd3f5ff:MINT,true);this.root.add(g);return g;},(g,e)=>{const f=1-e.age/e.life;if(e.kind==='beam'){g.position.set((e.x+8)/2,e.y,0);g.scale.set(8-e.x,(.16+e.strength*.2)*f,.035);}else{g.position.set(e.x,e.y,e.age*.5);g.scale.setScalar(.1+e.age*21);}});
    this.particles=this.particles.filter(p=>p.age<p.life);this.particleMesh.count=this.particles.length;
    this.particles.forEach((p,i)=>{p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(p.age*3,p.age*2,0);this.dummy.scale.setScalar(p.size*Math.max(0,1-p.age/p.life));this.dummy.updateMatrix();this.particleMesh.setMatrixAt(i,this.dummy.matrix);this.particleMesh.setColorAt(i,this.color.setHex(p.color));});this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
    for(const d of this.debris.children){d.position.x-=dt*d.userData.speed;if(d.position.x< -10)d.position.x=10;d.rotation.x+=dt*.2;d.rotation.z+=dt*.15;}
  }
  resize(){if(this.renderer.xr.isPresenting)return;this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.position.set(0,0,Math.max(13.8,9.2/this.camera.aspect/Math.tan(21*Math.PI/180)));this.camera.updateProjectionMatrix();}
  place(pose,settings){const q=new THREE.Quaternion().fromArray(pose.transform.orientation? [pose.transform.orientation.x,pose.transform.orientation.y,pose.transform.orientation.z,pose.transform.orientation.w]:[0,0,0,1]);const forward=new THREE.Vector3(0,0,-1).applyQuaternion(q);forward.y=0;forward.normalize();const pos=pose.transform.position;this.root.scale.setScalar(settings.width/16);this.root.position.set(pos.x+forward.x*settings.distance,Math.max(settings.width*9/32+.15,pos.y-.12),pos.z+forward.z*settings.distance);this.root.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);}
  desktop(){this.root.scale.setScalar(1);this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);this.resize();}
  render(time,playing){if(playing){this.renderer.setScissorTest(false);this.renderer.render(this.scene,this.camera);}else{
    this.renderer.setScissorTest(false);this.renderer.clear();const rect=document.querySelector('.preview-space').getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)return;
    this.renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);this.renderer.setScissor(rect.left,innerHeight-rect.bottom,rect.width,rect.height);this.renderer.setScissorTest(true);
    this.previewCamera.aspect=rect.width/rect.height;this.previewCamera.updateProjectionMatrix();this.previewShip.rotation.set(.4+Math.sin(time*.4)*.12,-.5, .15+Math.sin(time*.6)*.06);this.previewShip.position.y=Math.sin(time*.8)*.08;this.previewRing.rotation.z=time*.06;this.renderer.render(this.previewScene,this.previewCamera);this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,innerWidth,innerHeight);
  }}
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Art } from './sculpt.js';
const MINT = 0xb4ffe2, ORANGE = 0xff7545, DARK = 0x183b36, WHITE = 0xeaf5df;
const colors = { SPREAD: 0xffc570, LANCE: 0x98dfff, ECHO: 0xd4a8ff, SHIELD: MINT, BOMB: ORANGE };
export class View {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x000000, 0); this.renderer.xr.enabled = true; this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95; container.append(this.renderer.domElement);
    this.art=new Art();const pmrem=new THREE.PMREMGenerator(this.renderer),studio=new RoomEnvironment();this.environment=pmrem.fromScene(studio,.04).texture;studio.dispose();pmrem.dispose();
    this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xc6e5ff, 0x12223c, .65));
    this.scene.environment=this.environment;
    const key = new THREE.DirectionalLight(0xffddbb, 2.4); key.position.set(-3, 5, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4b9cff, 3.5); rim.position.set(1, -2, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .01, 100);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.geo = { sphere: new THREE.IcosahedronGeometry(1, 1), smooth: new THREE.SphereGeometry(1, 12, 8), box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(1, 1, 5), ring: new THREE.TorusGeometry(1, .035, 5, 48), oct: new THREE.OctahedronGeometry(1) };
    this.mat = {};
    this.material = (c, emissive = false, metal = false) => { const id = `${c}-${emissive}-${metal}`; return this.mat[id] ||= emissive ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshStandardMaterial({ color: c, metalness: metal ? .7 : .25, roughness: .38 }); };
    this.ship = this.makeShip(); this.ship.scale.setScalar(.8); this.root.add(this.ship);
    this.echo = this.makeShip(); this.echo.scale.setScalar(.45); this.root.add(this.echo);
    this.shield = new THREE.Mesh(this.geo.ring, this.material(MINT, true)); this.shield.scale.setScalar(.36); this.root.add(this.shield);
    this.charge = new THREE.Mesh(this.geo.smooth, this.material(0xc7ecff, true)); this.root.add(this.charge);
    this.cinematics=[];this.recoil=0;this.sceneTime=0;this.objects = new Map(); this.pickupObjects = new Map(); this.effectObjects = new Map(); this.particles = [];this.flashes=[];this.shockwaves=[];
    this.hitbox=this.mesh('smooth',0xffffff,true,[0,0,.18],[.09,.09,.015]);this.root.add(this.hitbox);
    this.hitboxRing=this.mesh('ring',0x65dfff,true,[0,0,.16],[.15,.15,.15]);this.root.add(this.hitboxRing);
    this.chargeGlow=this.art.glow(0x77ceff,1);this.root.add(this.chargeGlow);this.chargeArcs=new THREE.Group();for(let i=0;i<3;i++){const arc=new THREE.Mesh(new THREE.TorusGeometry(.32+i*.075,.007,5,48,Math.PI*1.35),this.material(0x87d5ff,true));arc.rotation.z=i*2.1;this.chargeArcs.add(arc);}this.root.add(this.chargeArcs);
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.bullets = new THREE.InstancedMesh(this.geo.smooth, new THREE.MeshBasicMaterial({ color: 0xffffff,toneMapped:false }), 1200); this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bullets.frustumCulled = false; this.root.add(this.bullets);
    this.bulletOutline=new THREE.InstancedMesh(this.geo.smooth,new THREE.MeshBasicMaterial({color:0x17131f}),1200);this.bulletOutline.frustumCulled=false;this.root.add(this.bulletOutline);
    this.bulletHalos=new THREE.InstancedMesh(this.art.plane,new THREE.MeshBasicMaterial({map:this.art.glowTexture,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),1200);this.bulletHalos.frustumCulled=false;this.root.add(this.bulletHalos);
    this.particleMesh = new THREE.InstancedMesh(this.geo.oct, new THREE.MeshBasicMaterial({ color: 0xffffff,toneMapped:false }), 1800); this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.frustumCulled = false; this.root.add(this.particleMesh);
    this.emberMesh=new THREE.InstancedMesh(this.art.plane,new THREE.MeshBasicMaterial({map:this.art.glowTexture,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),1800);this.emberMesh.frustumCulled=false;this.root.add(this.emberMesh);
    this.fragments=[];this.fragmentMesh=new THREE.InstancedMesh(this.art.box,this.art.mat(0x8ea3b0),180);this.fragmentMesh.frustumCulled=false;this.root.add(this.fragmentMesh);
    this.debris = new THREE.Group(); this.root.add(this.debris);
    for (let i = 0; i < 24; i++) { const shard = this.mesh('oct', i % 3 ? 0x426e63 : 0xcb7851, false, [0,0,0], [.03 + (i % 3) * .03, .02, .12]); shard.position.set((i * 3.71 % 20) - 10, Math.sin(i * 2.1) * 4.8, i % 2 ? -1.1 - (i % 4) * .5 : .8 + (i % 3) * .6); shard.userData.speed = .3 + (i % 3) * .22; this.debris.add(shard); }
    this.corners = new THREE.Group(); this.root.add(this.corners);
    for (const x of [-8,8]) for (const y of [-4.5,4.5]) { this.corners.add(this.mesh('box', 0x779387, true, [x - Math.sign(x)*.15,y,0], [.3,.015,.015])); this.corners.add(this.mesh('box', 0x779387, true,[x,y-Math.sign(y)*.15,0],[.015,.3,.015])); }
    this.hud = this.textPanel(1536, 180, 15, 1.76); this.hud.position.set(0, 5.1, 0); this.root.add(this.hud);
    this.message = this.textPanel(1536, 560, 11.5, 4.2); this.message.position.set(0, .4, .4); this.root.add(this.message);
    this.bossBar = this.textPanel(1024, 110, 7, .75); this.bossBar.position.set(1.5, -4.85, 0); this.root.add(this.bossBar);
    this.previewScene = new THREE.Scene();this.previewScene.environment=this.environment; this.previewScene.add(new THREE.HemisphereLight(0xe0eeff,0x101a30,.7));
    const previewLight = new THREE.DirectionalLight(0xffe0c3,3); previewLight.position.set(-2,4,5); this.previewScene.add(previewLight);
    this.previewCamera = new THREE.PerspectiveCamera(34, 1.5, .01,100); this.previewCamera.position.set(0,0,6.2);
    this.previewShip = this.makeShip(); this.previewShip.scale.setScalar(2.9); this.previewScene.add(this.previewShip);
    this.previewRing = new THREE.Group(); this.previewScene.add(this.previewRing);
    for (let i = 0; i < 2; i++) { const ring = new THREE.Mesh(this.geo.ring,this.material(i ? 0x263440 : 0x477586,true)); ring.scale.setScalar(1.55 + i*.1);ring.position.z=-1; ring.rotation.x=.45; ring.rotation.y=-.6; this.previewRing.add(ring); }
    addEventListener('resize', () => this.resize()); this.resize();
  }
  mesh(shape,c,emissive=false,pos=[0,0,0],scale=[1,1,1]) { const m = new THREE.Mesh(this.geo[shape],this.material(c,emissive)); m.position.set(...pos); m.scale.set(...scale); return m; }
  makeShip() {
    return this.art.ship();
  }
  enemy(e) {
    const boss=!!e.maxHp,g=boss?this.art.boss(e.type,e.r):this.art.enemy(e.type,e.r);
    if (boss) {
      // The narrow amber ring marks the only collidable boss body.
      const warn=this.mesh('box',0xffb168,true,[-7,0,.015],[14,.025,.015]); warn.name='warning'; warn.visible=false; this.root.add(warn); g.userData.warning=warn;
      const laser=new THREE.Group();const energy=this.energy(0xff642c);energy.name='energy';energy.scale.y=1.1;laser.add(energy);const glow=this.art.glow(0xff623b,1);glow.scale.set(1,1.3,1);laser.add(glow);laser.visible=false;this.root.add(laser);g.userData.laser=laser;
    }
    const boundary=new THREE.Mesh(new THREE.TorusGeometry(e.r,.008,5,64),new THREE.MeshBasicMaterial({color:0xff9b5e,transparent:true,opacity:boss?.8:.5,depthTest:false,depthWrite:false}));boundary.renderOrder=4;this.root.add(boundary);g.userData.boundary=boundary;this.root.add(g); return g;
  }
  textPanel(w,h,width,height) {
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material); panel.userData={canvas,ctx:canvas.getContext('2d'),texture,last:''}; return panel;
  }
  paintPanel(panel, key, draw) { if(panel.userData.last===key)return; panel.userData.last=key; const {canvas,ctx,texture}=panel.userData; ctx.clearRect(0,0,canvas.width,canvas.height); draw(ctx,canvas.width,canvas.height); texture.needsUpdate=true; }
  hudUpdate(game, xr, paused, message, settings) {
    const p=game.player;this.message.position.y=paused||game.state!=='playing'?.4:4.05;this.message.scale.setScalar(paused||game.state!=='playing'?1:.60); this.hud.visible=xr; this.message.visible=xr && (paused || game.state==='lost' || (game.state==='won'&&!this.cinematics.some(c=>c.kind==='death')) || (game.state==='playing'&&!!message)); this.corners.visible=!xr || paused;
    if (xr) this.paintPanel(this.hud,`${p.hp}/${p.shield}/${p.weapon}/${p.level}/${p.echo}/${game.bombs}/${game.score}/${Math.floor(p.charge*10)}`,c=>{
      c.fillStyle='#101e19dd'; c.fillRect(0,30,1536,125); c.fillStyle='#ff956b'; c.font='bold 32px monospace'; c.fillText('RIFT / 01',30,78);
      c.fillStyle='#edfae8'; c.font='26px monospace'; c.fillText(`HULL ${'◆'.repeat(Math.max(0,p.hp))}  SHIELD ${p.shield}`,30,123); c.fillText(`${p.weapon} ${p.level} ${p.echo?'+ ECHO':''}`,570,78); c.fillText(`BOMBS ${game.bombs}  CHARGE ${Math.floor(p.charge/1.4*100)}%   ×${game.combo.toFixed(1)}`,570,123); c.fillStyle='#b4ffe2'; c.font='bold 43px monospace'; c.fillText(String(game.score).padStart(6,'0'),1280,107);
    });
    const ended=game.state==='won'||game.state==='lost';
    const title=ended ? game.state==='won'?'CATHEDRAL DOWN':'SIGNAL LOST' : paused?'FLIGHT STANDBY':message?.title;
    const subtitle=ended ? `SCORE ${String(game.score).padStart(6,'0')}  /  ${game.kills} TARGETS` : paused?`DISTANCE ${(settings.distance*3.281).toFixed(1)} FT  ·  WIDTH ${(settings.width*3.281).toFixed(1)} FT`:message?.subtitle;
    if(xr && this.message.visible) this.paintPanel(this.message,`${title}/${subtitle}`, (c,w,h)=>{
      if(paused||ended) {c.fillStyle='#102019ed';c.fillRect(0,0,w,h); c.strokeStyle='#729b85';c.lineWidth=2;c.strokeRect(2,2,w-4,h-4);}
      c.textAlign='center';c.shadowColor='#081510';c.shadowBlur=8;c.fillStyle='#ff9468';c.font=`bold ${paused||ended?66:48}px monospace`;c.fillText(title||'',w/2,paused||ended?130:100);
      c.fillStyle='#daf7e5';c.font='28px monospace';c.fillText(subtitle||'',w/2,paused||ended?205:157);
      if(paused){c.font='28px monospace';c.fillText('LEFT STICK: WIDTH / DISTANCE   ·   X: RECENTER',w/2,290);c.fillText('RIGHT TRIGGER: DEPLOY / RESUME   ·   B: PAUSE',w/2,348);c.fillStyle='#9cbaa9';c.font='24px monospace';c.fillText('FLY: LEFT STICK   FIRE: RIGHT TRIGGER   CHARGE: RIGHT GRIP',w/2,430);c.fillText('LEFT GRIP: PRECISION FOCUS   ·   A: PULSE BOMB',w/2,477);}
      if(ended){c.font='30px monospace';c.fillText('RIGHT TRIGGER TO FLY AGAIN',w/2,350);c.fillStyle='#9cbaa9';c.font='24px monospace';c.fillText('Use the system menu to leave mixed reality.',w/2,425);}
    });
    this.bossBar.visible=!!game.boss;
    if(game.boss) {const b=game.boss;this.paintPanel(this.bossBar,`${b.type}/${Math.ceil(b.hp)}/${b.phase}/${b.attackName}`,c=>{c.fillStyle='#13241dea';c.fillRect(0,0,1024,110);c.fillStyle='#ffbc8b';c.font='23px monospace';c.fillText(`${b.type.toUpperCase()} / PHASE ${b.phase} / ${b.attackName||'AWAKENING'}`,20,35);c.fillStyle='#3e5549';c.fillRect(20,60,984,22);c.fillStyle='#ff7545';c.fillRect(20,60,984*Math.max(0,b.hp/b.maxHp),22);});}
  }
  flash(x,y,color,size=.5,life=.16) {if(this.flashes.length>40)return;const obj=this.art.glow(color,size);obj.position.set(x,y,.22);this.root.add(obj);this.flashes.push({obj,size,age:0,life});}
  spark(x,y,color,count=6,strength=1) {for(let i=0;i<count;i++){if(this.particles.length>=1800)this.particles.shift();const angle=Math.random()*Math.PI*2,speed=(.6+Math.random()*3)*strength;this.particles.push({x,y,z:0,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:(Math.random()-.5)*strength*1.7,life:.25+Math.random()*.65,age:0,color,size:.014+Math.random()*.026});}}
  burst(e) {const color=e.color==='orange'?ORANGE:0x7beaff;this.spark(e.x,e.y,color,Math.min(240,Math.round(e.size*100)),e.size);this.flash(e.x,e.y,0xffba78,e.size*2,.25);const obj=this.shock(color);obj.position.set(e.x,e.y,.1);this.root.add(obj);this.shockwaves.push({obj,age:0,life:.6,size:e.size});for(let i=0;i<Math.min(45,12*e.size);i++){if(this.fragments.length>=180)this.fragments.shift();const a=Math.random()*Math.PI*2;this.fragments.push({x:e.x,y:e.y,z:0,vx:Math.cos(a)*(1+Math.random())*e.size,vy:Math.sin(a)*(1+Math.random())*e.size,vz:(Math.random()-.3)*e.size*2,age:0,life:.7+Math.random(),size:(.025+Math.random()*.07)*Math.sqrt(e.size)});}}
  event(e){if(e.type==='shoot')this.recoil=1;if(e.type==='enemyFire'&&e.y!==undefined)this.flash(e.x,e.y,0xff673f,.5,.11);
    if(e.type==='setpiece'){const obj=this.art.setpiece(e.name);obj.scale.setScalar(e.act===1?1.8:1.35);obj.position.set(15,e.act===3?-1.9:1.9,-4.5);obj.rotation.y=e.act===3?-.35:-.22;this.root.add(obj);this.cinematics.push({obj,kind:'flyby',name:e.name,age:0,life:16,speed:2.2});}
    if(e.type==='kill'&&e.boss){let obj;const rendered=this.objects.get(e.id);if(rendered){const data=rendered.userData;rendered.userData={};obj=rendered.clone(true);rendered.userData=data;}else obj=this.art.boss(e.archetype,e.r);obj.position.set(e.x,e.y,0);obj.userData.origin={x:e.x,y:e.y};obj.traverse(m=>{if(m.isMesh)m.userData.drift=(Math.random()-.5)*2;});this.root.add(obj);this.cinematics.push({obj,kind:'death',age:0,life:e.archetype==='cathedral'?4.4:2.6,next:.1});}
    if(e.type==='pickup'){this.flash(e.x,e.y,colors[e.kind],1.5,.35);this.spark(e.x,e.y,colors[e.kind],22,.7);}
    if(e.type==='charge'){this.flash(e.x+.4,e.y,0xaceeff,2,.2);for(let i=0;i<5;i++){const obj=this.mesh('ring',0x78c5ff,true,[e.x+.6+i*.6,e.y,.12]);obj.rotation.y=Math.PI/2;this.root.add(obj);this.shockwaves.push({obj,age:-i*.035,life:.36,size:.7});}}
    if(e.type==='shoot'){this.flash(e.x+.4,e.y,e.weapon==='SPREAD'?0xb4ff68:e.weapon==='LANCE'?0x919bff:0x7de8ff,.5,.065);this.spark(e.x+.4,e.y,0xaceeff,2,.22);}if(e.type==='impact'){this.flash(e.x,e.y,0xffc878,.45,.08);this.spark(e.x,e.y,0xffb056,7,.6);}if(e.type==='graze')this.spark(e.x,e.y,0x91caff,3,.3);}
  clear() {for(const e of this.cinematics)this.removeObject(e.obj);this.cinematics=[];this.recoil=0;this.sceneTime=0; for(const map of [this.objects,this.pickupObjects,this.effectObjects]){for(const obj of map.values())this.removeObject(obj);map.clear();}for(const e of [...this.flashes,...this.shockwaves])this.removeObject(e.obj);this.flashes=[];this.shockwaves=[];this.particles=[];this.fragments=[]; }
  removeObject(obj){obj.traverse(m=>{if(m.isMesh&&m.material?.isShaderMaterial){m.geometry!==this.art.plane&&m.geometry.dispose();m.material.dispose();}});this.root.remove(obj);if(obj.userData.boundary){this.root.remove(obj.userData.boundary);obj.userData.boundary.geometry.dispose();obj.userData.boundary.material.dispose();}if(obj.userData.warning)this.root.remove(obj.userData.warning);if(obj.userData.laser)this.root.remove(obj.userData.laser);if(obj.userData.label){obj.userData.label.geometry.dispose();obj.userData.label.material.map.dispose();obj.userData.label.material.dispose();}}
  sync(map,items,create,update){const ids=new Set();for(const e of items){ids.add(e.id);let obj=map.get(e.id);if(!obj){obj=create(e);map.set(e.id,obj);}update(obj,e);}for(const [id,obj]of map)if(!ids.has(id)){this.removeObject(obj);map.delete(id);}}
  update(game,dt,time){
    this.sceneTime+=dt;time=this.sceneTime;this.recoil=Math.max(0,this.recoil-dt*7);this.updateCinematics(dt,time);
    const p=game.player,xr=this.renderer.xr.isPresenting,shipScale=xr?.34:.8;this.ship.scale.setScalar(shipScale);this.ship.position.set(p.x-this.recoil*.05,p.y,0);this.ship.rotation.x=THREE.MathUtils.lerp(this.ship.rotation.x,(p.moveY||0)*-.42,Math.min(1,dt*14));this.ship.rotation.y=THREE.MathUtils.lerp(this.ship.rotation.y,(p.moveX||0)*.12,Math.min(1,dt*14));this.ship.rotation.z=THREE.MathUtils.lerp(this.ship.rotation.z,(p.moveY||0)*.11,Math.min(1,dt*14));this.ship.visible=p.hp>0&&!(game.state==='playing'&&p.invincible>0&&Math.floor(time*14)%2===0);
    this.echo.visible=p.echo&&p.hp>0;this.echo.scale.setScalar(xr?.21:.45);this.echo.position.set(p.x-.3,p.y+.45,0);this.echo.rotation.x=this.ship.rotation.x;
    this.hitbox.visible=!!p.focus&&p.hp>0;this.hitboxRing.visible=!!p.focus&&p.hp>0;this.hitbox.position.set(p.x,p.y,.22);this.hitboxRing.position.set(p.x,p.y,.20);
    this.shield.visible=p.shield>0;this.shield.position.set(p.x,p.y,0);this.shield.rotation.y=Math.sin(time*2)*.3;this.shield.rotation.z=time*.6;
    this.charge.visible=p.charge>.1;this.charge.position.set(p.x+.3,p.y,0);this.charge.scale.setScalar(.025+p.charge*.08);
    this.chargeArcs.visible=p.charge>.1;this.chargeArcs.position.set(p.x+.22,p.y,.05);this.chargeArcs.scale.setScalar(.65+p.charge*.4);this.chargeArcs.rotation.z=time*(3+p.charge*3);this.chargeGlow.visible=p.charge>.1;this.chargeGlow.position.set(p.x+.35,p.y,.1);this.chargeGlow.scale.setScalar(.3+p.charge*.6);
    this.animateEngines(this.ship,time,1+(p.moveX||0)*.3);this.animateEngines(this.echo,time,1);
    this.trailClock=(this.trailClock||0)+dt;if(this.trailClock>.025&&p.hp>0){this.trailClock=0;for(const side of [-1,1]){const px=p.x-.6*shipScale,py=p.y+side*.2*shipScale;this.particles.push({x:px,y:py,z:0,vx:-2-Math.random()*2,vy:(Math.random()-.5)*.1,vz:0,life:.2+Math.random()*.16,age:0,color:0x69dfff,size:.02});}}
    this.sync(this.objects,game.enemies.filter(e=>!e.dead),e=>this.enemy(e),(g,e)=>{g.position.set(e.x,e.y,Math.max(0,e.entry)*-1.2);g.userData.boundary.position.set(e.x,e.y,0);g.userData.boundary.visible=e.entry<=0;g.rotation.y=e.maxHp?Math.sin(e.age*.42)*.14:Math.sin(e.age*2)*.12;const core=g.getObjectByName('core');core.material=this.material(e.flash>0?WHITE:e.type==='weaver'?0xdc85ce:0xffb774,true);
      if(e.maxHp){const machine=g.getObjectByName('machinery');machine.rotation.z=e.type==='gatekeeper'?Math.sin(e.age*.6)*.06:e.age*.12;machine.rotation.y=Math.sin(e.age*.6)*.2;machine.scale.setScalar((1+(e.phase-1)*.12)*(e.entry>0?.35+.65*(1-Math.max(0,e.entry)/3):1));const turbine=machine.getObjectByName('turbine');if(turbine)turbine.rotation.z=-e.age*(.5+e.phase*.15);const iris=machine.getObjectByName('iris');if(iris){iris.rotation.z=e.age*-.32;iris.scale.setScalar(e.warning>0?.9+.15*Math.sin(time*22):1);}let petalIndex=0;for(const arm of machine.children.filter(c=>c.name==='petal')){arm.rotation.y=Math.sin(e.age*.8+arm.rotation.z)*.12+(e.phase-1)*.40;arm.position.z=-(e.phase-1)*.35;arm.visible=e.phase<3||petalIndex++%3!==0;}for(const claw of machine.children.filter(c=>c.name==='claw'))claw.rotation.z=claw.userData.side*(.04+Math.sin(e.age*1.4)*.12);const w=g.userData.warning,l=g.userData.laser;w.visible=e.warning>0;w.material=this.material(Math.floor(time*10)%2?0xffb168:0xee4e36,true);l.visible=e.laser>0;w.position.set((e.x-8)/2,e.laserY,0);l.position.copy(w.position);w.scale.x=l.scale.x=e.x+8;if(l.visible)l.getObjectByName('energy').material.uniforms.uTime.value=time;}
      else{const limbs=g.getObjectByName('limbs');if(limbs)for(const fin of limbs.children)fin.rotation.x=fin.userData.side*Math.sin(e.age*4+fin.userData.phase)*.35;g.rotation.x=Math.sin(e.age*2+e.phase)*.2;g.rotation.z=e.type==='weaver'?Math.sin(e.age*2)*.25:0;}
    });
    this.bullets.count=this.bulletHalos.count=this.bulletOutline.count=game.shots.length;
    game.shots.forEach((s,i)=>{const angle=Math.atan2(s.vy,s.vx),length=s.hostile?s.kind==='needle'?s.r*2.2:s.kind==='petal'?s.r*1.8:s.r:s.kind==='lance'?.65:s.kind==='rail'?.42:.23;
      const color=s.hostile?s.kind==='petal'?0xff5eab:s.kind==='orb'?0xffc354:0xff764b:s.kind==='spread'?0xa8ff54:s.kind==='rail'?0x778aff:0x67dfff;
      this.dummy.position.set(s.x,s.y,.05);this.dummy.rotation.set(0,0,angle);this.dummy.scale.set(length,s.r*.68,s.r*.5);this.dummy.updateMatrix();this.bullets.setMatrixAt(i,this.dummy.matrix);this.bullets.setColorAt(i,this.color.setHex(s.hostile?0xffecce:0xd7ffff));
      this.dummy.position.z=.0;this.dummy.scale.set(length*1.23,s.r*1.15,s.r*.5);this.dummy.updateMatrix();this.bulletOutline.setMatrixAt(i,this.dummy.matrix);
      this.dummy.position.set(s.x-(s.hostile?0:Math.cos(angle)*.18),s.y,.075);this.dummy.scale.set(s.hostile?length*4:s.kind==='lance'?1.7:.9,s.r*(s.hostile?4:3),1);this.dummy.updateMatrix();this.bulletHalos.setMatrixAt(i,this.dummy.matrix);this.bulletHalos.setColorAt(i,this.color.setHex(color));
    });for(const mesh of [this.bullets,this.bulletOutline,this.bulletHalos]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    this.sync(this.pickupObjects,game.pickups,item=>{const g=this.art.pickup(item.kind,colors[item.kind]);const label=this.textPanel(256,80,.72,.22);label.position.set(0,-.4,0);this.paintPanel(label,item.kind,c=>{c.fillStyle='#091320bb';c.fillRect(0,0,256,80);c.fillStyle='#edfbea';c.textAlign='center';c.font='bold 36px monospace';c.fillText(item.kind,128,54);});g.add(label);g.userData.label=label;this.root.add(g);return g;},(g,e)=>{g.position.set(e.x,e.y,0);g.getObjectByName('capsule').rotation.y=Math.sin(e.age*2)*.35;});
    this.sync(this.effectObjects,game.effects,e=>{const g=new THREE.Group();if(e.kind==='beam'){const energy=this.energy(0x66b7ff);energy.name='energy';g.add(energy);}else{const shock=this.shock(0x73dfff);shock.name='shock';g.add(shock);g.add(this.art.glow(0x46a7ff,1.5));}this.root.add(g);return g;},(g,e)=>{const f=1-e.age/e.life;if(e.kind==='beam'){g.position.set((e.x+8)/2,e.y,0);g.scale.set(8-e.x,(.9+e.strength)*f,1);g.getObjectByName('energy').material.uniforms.uTime.value=time;}else{g.position.set(e.x,e.y,e.age*.5);g.scale.setScalar(.1+e.age*21);g.getObjectByName('shock').material.uniforms.uFade.value=f;}});
    this.particles=this.particles.filter(p=>p.age<p.life).slice(-1800);this.particleMesh.count=this.emberMesh.count=this.particles.length;
    this.particles.forEach((p,i)=>{p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;const size=p.size*Math.max(0,1-p.age/p.life);this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(0,0,Math.atan2(p.vy,p.vx));this.dummy.scale.set(size*4,size*.55,size);this.dummy.updateMatrix();this.particleMesh.setMatrixAt(i,this.dummy.matrix);this.particleMesh.setColorAt(i,this.color.setHex(p.color));this.dummy.scale.set(size*12,size*4,1);this.dummy.updateMatrix();this.emberMesh.setMatrixAt(i,this.dummy.matrix);this.emberMesh.setColorAt(i,this.color);});for(const mesh of [this.particleMesh,this.emberMesh]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    this.flashes=this.flashes.filter(e=>{e.age+=dt;const f=1-e.age/e.life;e.obj.scale.setScalar(e.size*Math.max(0,f));if(f<=0)this.root.remove(e.obj);return f>0;});
    this.shockwaves=this.shockwaves.filter(e=>{e.age+=dt;e.obj.scale.setScalar(.1+e.age*e.size*4);if(e.obj.material.uniforms?.uFade)e.obj.material.uniforms.uFade.value=Math.max(0,1-e.age/e.life);if(e.age>=e.life)this.removeObject(e.obj);return e.age<e.life;});
    this.fragments=this.fragments.filter(f=>f.age<f.life);this.fragmentMesh.count=this.fragments.length;this.fragments.forEach((f,i)=>{f.age+=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.z+=f.vz*dt;this.dummy.position.set(f.x,f.y,f.z);this.dummy.rotation.set(f.age*4,f.age*3,i);const size=f.size*Math.max(0,1-f.age/f.life);this.dummy.scale.set(size*2,size,.025);this.dummy.updateMatrix();this.fragmentMesh.setMatrixAt(i,this.dummy.matrix);});this.fragmentMesh.instanceMatrix.needsUpdate=true;
    for(const d of this.debris.children){d.position.x-=dt*d.userData.speed;if(d.position.x< -10)d.position.x=10;d.rotation.x+=dt*.2;d.rotation.z+=dt*.15;}
  }
  updateCinematics(dt,time){
    this.cinematics=this.cinematics.filter(e=>{
      e.age+=dt;
      if(e.kind==='flyby'){e.obj.position.x-=dt*e.speed;e.obj.position.y+=Math.sin(time*.4)*dt*.15;if(e.name==='LEVIATHAN'){e.obj.rotation.z=Math.sin(e.age*.27)*.055;e.obj.position.z=-4.5+Math.sin(e.age*.2)*.7;}else if(e.name==='THE PROCESSION'){for(const forge of e.obj.children.filter(c=>c.name==='forge')){forge.rotation.y=e.age*.18;forge.getObjectByName('cage').rotation.z=e.age*(forge.userData.index%2?-.4:.4);}}else{e.obj.rotation.x=e.age*.22;e.obj.rotation.z=Math.sin(e.age*.3)*.1;}}
      else{
        const o=e.obj.userData.origin;e.obj.rotation.z+=dt*.16;e.obj.position.z-=dt*.2;
        const machine=e.obj.getObjectByName('machinery');machine.children.forEach((part,i)=>{part.position.x+=Math.cos(i*2.4)*dt*.7;part.position.y+=Math.sin(i*2.4)*dt*.7;part.position.z+=dt*(i%2?.5:-.5);part.rotation.y+=dt*.4;});
        const core=e.obj.getObjectByName('core');core.scale.multiplyScalar(Math.exp(-dt*.8));core.visible=e.age<2.8&&Math.floor(e.age*16)%2===0;
        if(e.age>=e.next&&e.age<2.5){e.next=e.age+.18;this.burst({x:o.x+(Math.random()-.5)*2.1,y:o.y+(Math.random()-.5)*2.1,color:'orange',size:.7+Math.random()*.5});}
        if(e.age>2.4)e.obj.scale.multiplyScalar(Math.exp(-dt*1.2));
      }
      if(e.age>=e.life){this.removeObject(e.obj);return false;}return true;
    });
  }
  shock(color){
    return new THREE.Mesh(this.art.plane,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uColor:{value:new THREE.Color(color)},uFade:{value:1}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;uniform vec3 uColor;uniform float uFade;void main(){float r=length(vUv-.5);float arc=exp(-abs(r-.45)*180.0)+exp(-abs(r-.425)*55.0)*.25;float rays=.8+.2*sin(atan(vUv.y-.5,vUv.x-.5)*38.0);gl_FragColor=vec4(uColor,arc*uFade*rays);}'
    }));
  }
  energy(color){
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(color)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vUv;uniform float uTime;uniform vec3 uColor;void main(){float warp=sin(vUv.x*55.0-uTime*35.0)*.024+sin(vUv.x*119.0+uTime*22.0)*.008;float y=abs(vUv.y-.5+warp);float core=exp(-y*95.0);float corona=exp(-y*12.0)*.45;float filament=exp(-abs(y-.085-sin(vUv.x*32.0-uTime*12.0)*.025)*90.0)*.4;float ends=smoothstep(0.0,.03,vUv.x)*smoothstep(0.0,.03,1.0-vUv.x);gl_FragColor=vec4(mix(uColor,vec3(1.0),core),min(1.0,core+corona+filament)*ends);}'
    });return new THREE.Mesh(this.art.plane,material);
  }
  animateEngines(ship,time,power=1){for(const side of [-1,1]){const jet=ship.getObjectByName(`jet${side}`),engine=ship.getObjectByName(`engine${side}`);if(jet)jet.scale.x=(.65+Math.sin(time*53+side)*.08)*power;if(engine)engine.scale.y=(.23+Math.sin(time*47)*.04)*power;}}
  resize(){if(this.renderer.xr.isPresenting)return;this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.position.set(0,0,Math.max(13.8,9.2/this.camera.aspect/Math.tan(21*Math.PI/180)));this.camera.updateProjectionMatrix();}
  place(pose,settings){const q=new THREE.Quaternion().fromArray(pose.transform.orientation? [pose.transform.orientation.x,pose.transform.orientation.y,pose.transform.orientation.z,pose.transform.orientation.w]:[0,0,0,1]);const forward=new THREE.Vector3(0,0,-1).applyQuaternion(q);forward.y=0;forward.normalize();const pos=pose.transform.position;this.root.scale.setScalar(settings.width/16);this.root.position.set(pos.x+forward.x*settings.distance,Math.max(settings.width*9/32+.15,pos.y-.12),pos.z+forward.z*settings.distance);this.root.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);}
  desktop(){this.root.scale.setScalar(1);this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);this.resize();}
  render(time,playing){if(playing){this.renderer.setScissorTest(false);this.renderer.render(this.scene,this.camera);}else{
    this.renderer.setScissorTest(false);this.renderer.clear();const rect=document.querySelector('.preview-space').getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)return;
    this.renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);this.renderer.setScissor(rect.left,innerHeight-rect.bottom,rect.width,rect.height);this.renderer.setScissorTest(true);
    this.previewCamera.aspect=rect.width/rect.height;this.previewCamera.updateProjectionMatrix();this.previewShip.rotation.set(.4+Math.sin(time*.4)*.12,-.5, .15+Math.sin(time*.6)*.06);this.previewShip.position.y=Math.sin(time*.8)*.08;this.animateEngines(this.previewShip,time);this.previewRing.rotation.z=time*.06;this.renderer.render(this.previewScene,this.previewCamera);this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,innerWidth,innerHeight);
  }}
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { placeArena } from './room.js';
import { Art } from './sculpt.js';
import { prepareDamageMaterials, updateDamageMaterials, createBlast, createReactorMaterial } from './damage-fx.js';
import { KEYLINE, projectileStyle } from './contrast.js';
const MINT = 0xb4ffe2, ORANGE = 0xff7545, DARK = 0x183b36, WHITE = 0xeaf5df;
const colors = { SPREAD: 0xffc570, LANCE: 0x98dfff, ECHO: 0xd4a8ff, SHIELD: MINT, BOMB: ORANGE, VECTOR: 0x81d7ff, MISSILE: 0x76ffd0, RING: 0xb7adff };
export class View {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x000000, 0); this.renderer.xr.enabled = true; this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95; container.append(this.renderer.domElement);
    this.art=new Art();const pmrem=new THREE.PMREMGenerator(this.renderer),studio=new RoomEnvironment();this.environmentTarget=pmrem.fromScene(studio,.04);this.environment=this.environmentTarget.texture;studio.dispose();pmrem.dispose();
    this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xc6e5ff, 0x12223c, .65));
    this.scene.environment=this.environment;
    const key = new THREE.DirectionalLight(0xffddbb, 2.4); key.position.set(-3, 5, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4b9cff, 3.5); rim.position.set(1, -2, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .01, 100);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.geo = { sphere: new THREE.IcosahedronGeometry(1, 1), smooth: new THREE.SphereGeometry(1, 12, 8), box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(1, 1, 5), ring: new THREE.TorusGeometry(1, .035, 5, 48), oct: new THREE.OctahedronGeometry(1) };
    this.mat = {};
    this.material = (c, emissive = false, metal = false) => { const id = `${c}-${emissive}-${metal}`; return this.mat[id] ||= emissive ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshStandardMaterial({ color: c, metalness: metal ? .7 : .25, roughness: .38 }); };
    this.tether=new THREE.Group();this.scene.add(this.tether);this.tether.visible=false;
    this.tetherCone=new THREE.Mesh(new THREE.CylinderGeometry(.026,.0015,1,12,1,true),new THREE.MeshBasicMaterial({color:0x60cfff,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));this.tetherCone.renderOrder=8;
    this.tetherEdge=new THREE.Mesh(new THREE.CylinderGeometry(.0016,.0016,1,6),new THREE.MeshBasicMaterial({color:KEYLINE,transparent:true,opacity:.5,depthWrite:false,toneMapped:false}));this.tetherEdge.renderOrder=9;
    this.tetherCore=new THREE.Mesh(new THREE.CylinderGeometry(.0007,.0007,1,6),new THREE.MeshBasicMaterial({color:0x86e8ff,transparent:true,opacity:.85,depthWrite:false,toneMapped:false}));this.tetherCore.renderOrder=10;
    this.tether.add(this.tetherCone,this.tetherEdge,this.tetherCore);
    this.pointerMark=new THREE.Group();this.pointerMark.visible=false;this.root.add(this.pointerMark);
    this.pointerInk=new THREE.MeshBasicMaterial({color:KEYLINE,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});
    this.pointerColor=new THREE.MeshBasicMaterial({color:0x86e8ff,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});
    for(const vertical of [false,true])for(const outline of [true,false]){const m=new THREE.Mesh(this.geo.box,outline?this.pointerInk:this.pointerColor);m.scale.set(vertical?(outline?.036:.012):.30,vertical?.30:(outline?.036:.012),.004);m.renderOrder=outline?14:15;this.pointerMark.add(m);}
    this.ship = this.makeShip(); this.ship.scale.setScalar(.8); this.root.add(this.ship);
    this.echo = this.makeShip(); this.echo.scale.setScalar(.45); this.root.add(this.echo);
    this.shield = new THREE.Mesh(this.geo.ring, this.material(MINT, true)); this.shield.scale.setScalar(.36); this.root.add(this.shield);
    this.charge = new THREE.Mesh(this.geo.smooth, this.material(0xc7ecff, true)); this.root.add(this.charge);
    this.blasts=[];this.cinematics=[];this.recoil=0;this.sceneTime=0;this.objects = new Map(); this.pickupObjects = new Map(); this.effectObjects = new Map(); this.particles = [];this.flashes=[];this.shockwaves=[];
    this.hitbox=this.mesh('smooth',0xffffff,true,[0,0,.18],[.09,.09,.015]);this.root.add(this.hitbox);
    this.playerBeaconOutline=this.mesh('smooth',KEYLINE,true,[0,0,.2],[.065,.065,.015]);this.root.add(this.playerBeaconOutline);
    for(const [mesh,order] of [[this.playerBeaconOutline,40],[this.hitbox,41]]){mesh.material=new THREE.MeshBasicMaterial({color:mesh===this.hitbox?0xd9fff4:KEYLINE,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});mesh.renderOrder=order;}
    this.hitboxRing=this.mesh('ring',0x65dfff,true,[0,0,.16],[.15,.15,.15]);this.hitboxRing.material=new THREE.MeshBasicMaterial({color:0x65dfff,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});this.hitboxRing.renderOrder=42;this.root.add(this.hitboxRing);
    this.chargeGlow=this.art.glow(0x77ceff,1);this.root.add(this.chargeGlow);this.chargeArcs=new THREE.Group();for(let i=0;i<3;i++){const arc=new THREE.Mesh(new THREE.TorusGeometry(.32+i*.075,.007,5,48,Math.PI*1.35),this.material(0x87d5ff,true));arc.rotation.z=i*2.1;this.chargeArcs.add(arc);}this.root.add(this.chargeArcs);
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.bullets = new THREE.InstancedMesh(this.geo.smooth, new THREE.MeshBasicMaterial({ color: 0xffffff,toneMapped:false }), 1200); this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bullets.frustumCulled = false; this.root.add(this.bullets);
    this.bullets.material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vFlightNormal;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\nvFlightNormal=normalize(normalMatrix*normal);');
      shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying vec3 vFlightNormal;\nvoid main() {').replace('#include <opaque_fragment>','vec3 flightNormal=normalize(vFlightNormal);float facing=abs(flightNormal.z);float sheen=pow(max(0.0,dot(flightNormal,normalize(vec3(-.3,.8,.7)))),18.0);outgoingLight=outgoingLight*(.58+.42*facing)+vec3(.20)*sheen;\n#include <opaque_fragment>');
    };
    this.bullets.material.customProgramCacheKey=()=> 'solid-plasma-body-v1';
    this.bulletCore=new THREE.InstancedMesh(this.geo.smooth,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),1200);this.bulletCore.frustumCulled=false;this.root.add(this.bulletCore);
    this.bulletOutline=new THREE.InstancedMesh(this.geo.smooth,new THREE.MeshBasicMaterial({color:KEYLINE}),1200);this.bulletOutline.frustumCulled=false;this.root.add(this.bulletOutline);
    this.bulletHalos=new THREE.InstancedMesh(this.art.plane,new THREE.MeshBasicMaterial({map:this.art.glowTexture,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),1200);this.bulletHalos.frustumCulled=false;this.root.add(this.bulletHalos);
    // Put opaque threat marks in the transparent render queue so they draw after sparks/glow.
    for(const [mesh,order] of [[this.bulletOutline,31],[this.bullets,32],[this.bulletCore,33]]){Object.assign(mesh.material,{transparent:true,opacity:1,depthTest:false,depthWrite:false});mesh.renderOrder=order;}
    this.bulletHalos.material.opacity=.38;this.bulletHalos.renderOrder=30;this.bulletHalos.material.depthTest=false;
    // Friendly weapon banks sit below hostile outlines, regardless of shot insertion order.
    this.friendlyBank={};for(const [name,geo,color,order] of [['outline',this.geo.smooth,KEYLINE,20],['body',this.geo.smooth,0xffffff,21],['core',this.geo.smooth,0xd9fff4,22],['missileOutline',this.geo.cone,KEYLINE,20],['missileBody',this.geo.cone,0x19bf96,21],['missileCore',this.geo.cone,0xd9fff4,22],['ringOutline',new THREE.TorusGeometry(1,.10,6,64),KEYLINE,20],['ringBody',new THREE.TorusGeometry(1,.065,6,64),0x8272e9,21],['ringCore',new THREE.TorusGeometry(1,.016,4,64),0xe5fffa,22],['trail',this.geo.smooth,0x237b6c,19]]){
      const mesh=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false}),name==='trail'?1800:240);mesh.frustumCulled=false;mesh.renderOrder=order;mesh.count=0;this.root.add(mesh);this.friendlyBank[name]=mesh;
    }
    this.vectorPods=new THREE.Group();this.missilePods=new THREE.Group();this.ship.add(this.vectorPods,this.missilePods);
    for(const side of [-1,1]){
      const mount=this.mesh('box',0x233347,false,[-.03,side*.26,.035],[.30,.085,.085]);this.vectorPods.add(mount);const tip=this.mesh('smooth',0x83deff,true,[.15,side*.30,.06],[.075,.035,.035]);this.vectorPods.add(tip);
      const pod=this.mesh('box',0x283f3c,false,[-.35,side*.25,.025],[.24,.10,.09]);this.missilePods.add(pod);for(const offset of [-.025,.025])this.missilePods.add(this.mesh('smooth',0x90ffd9,true,[-.23,side*.25+offset,.075],[.04,.02,.015]));
    }
    this.particleKeyline=new THREE.InstancedMesh(this.geo.oct,new THREE.MeshBasicMaterial({color:KEYLINE,toneMapped:false}),1800);this.particleKeyline.frustumCulled=false;this.root.add(this.particleKeyline);
    this.particleMesh = new THREE.InstancedMesh(this.geo.oct, new THREE.MeshBasicMaterial({ color: 0xffffff,toneMapped:false }), 1800); this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.frustumCulled = false; this.root.add(this.particleMesh);
    this.emberMesh=new THREE.InstancedMesh(this.art.plane,new THREE.MeshBasicMaterial({map:this.art.glowTexture,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),1800);this.emberMesh.frustumCulled=false;this.root.add(this.emberMesh);
    this.fragments=[];this.fragmentMesh=new THREE.InstancedMesh(this.art.box,this.art.mat(0x8ea3b0),180);this.fragmentMesh.frustumCulled=false;this.root.add(this.fragmentMesh);
    this.debris = new THREE.Group(); this.root.add(this.debris);
    for (let i = 0; i < 24; i++) { const shard = this.mesh('oct', i % 3 ? 0x426e63 : 0xcb7851, false, [0,0,0], [.03 + (i % 3) * .03, .02, .12]); shard.position.set((i * 3.71 % 20) - 10, Math.sin(i * 2.1) * 4.8, i % 2 ? -1.1 - (i % 4) * .5 : .8 + (i % 3) * .6); shard.userData.speed = .3 + (i % 3) * .22; this.debris.add(shard); }
    this.corners = new THREE.Group(); this.root.add(this.corners);
    for (const x of [-8,8]) for (const y of [-4.5,4.5]) { this.corners.add(this.mesh('box', 0x779387, true, [x - Math.sign(x)*.15,y,0], [.3,.015,.015])); this.corners.add(this.mesh('box', 0x779387, true,[x,y-Math.sign(y)*.15,0],[.015,.3,.015])); }
    this.hud = this.textPanel(1536, 180, 15, 1.76); this.hud.position.set(0, 5.1, 0); this.root.add(this.hud);
    this.message = this.textPanel(1536, 560, 11.5, 4.2); this.message.position.set(0, .4, .4); this.root.add(this.message);
    this.pausePanel=this.textPanel(1536,1140,9,6.68);this.pausePanel.position.set(0,.2,.45);this.pausePanel.visible=false;this.root.add(this.pausePanel);
    this.bossBar = this.textPanel(1024, 110, 7, .75); this.bossBar.position.set(1.5, -4.85, 0); this.root.add(this.bossBar);
    this.previewScene = new THREE.Scene();this.previewScene.environment=this.environment; this.previewScene.add(new THREE.HemisphereLight(0xe0eeff,0x101a30,.7));
    const previewLight = new THREE.DirectionalLight(0xffe0c3,3); previewLight.position.set(-2,4,5); this.previewScene.add(previewLight);
    this.previewCamera = new THREE.PerspectiveCamera(34, 1.5, .01,100); this.previewCamera.position.set(0,0,6.2);
    this.previewShip = this.makeShip(); this.previewShip.scale.setScalar(2.9); this.previewScene.add(this.previewShip);
    this.previewRing = new THREE.Group(); this.previewScene.add(this.previewRing);
    for (let i = 0; i < 2; i++) { const ring = new THREE.Mesh(this.geo.ring,this.material(i ? 0x263440 : 0x477586,true)); ring.scale.setScalar(1.55 + i*.1);ring.position.z=-1; ring.rotation.x=.45; ring.rotation.y=-.6; this.previewRing.add(ring); }
    this.onResize=()=>this.resize();addEventListener('resize',this.onResize); this.resize();
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.renderer.setAnimationLoop(null);removeEventListener('resize',this.onResize);
    const geometries=new Set(),materials=new Set(),textures=new Set();
    const collectMaterial=m=>{if(!m)return;materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);for(const uniform of Object.values(m.uniforms||{}))if(uniform?.value?.isTexture)textures.add(uniform.value);};
    const collect=o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])collectMaterial(m);};
    this.scene.traverse(collect);this.previewScene.traverse(collect);
    for(const model of this.art.models.values())model.traverse(collect);
    for(const m of this.art.materials.values())collectMaterial(m);
    for(const m of Object.values(this.mat))collectMaterial(m);
    for(const g of [...Object.values(this.geo),this.art.box,this.art.cylinder,this.art.sphere,this.art.plane])geometries.add(g);
    textures.add(this.art.surface);textures.add(this.art.glowTexture);
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t?.dispose();
    this.environmentTarget.dispose();this.scene.clear();this.previewScene.clear();
    this.objects.clear();this.pickupObjects.clear();this.effectObjects.clear();this.art.models.clear();this.art.materials.clear();
    this.particles=[];this.fragments=[];this.cinematics=[];this.flashes=[];this.shockwaves=[];
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
  mesh(shape,c,emissive=false,pos=[0,0,0],scale=[1,1,1]) { const m = new THREE.Mesh(this.geo[shape],this.material(c,emissive)); m.position.set(...pos); m.scale.set(...scale); return m; }
  makeShip() {
    return this.art.ship();
  }
  enemy(e) {
    const boss=!!e.maxHp,g=boss?this.art.boss(e.type,e.r):this.art.enemy(e.type,e.r);prepareDamageMaterials(g);if(boss){g.getObjectByName('core').material=createReactorMaterial();for(const part of e.parts||[]){const cell=g.getObjectByName('weakpoint-'+part.id)?.getObjectByName('weak-core');if(cell)cell.material=createReactorMaterial('xy');}}
    if (boss) {
      // The amber ring marks the central body; breakable pods use their own planar hit areas.
      const warn=this.mesh('box',KEYLINE,true,[-7,0,.015],[14,.048,.015]);warn.material=new THREE.MeshBasicMaterial({color:KEYLINE,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});warn.renderOrder=28;const warningCore=this.mesh('box',0xffae45,true,[0,0,.6],[1,.42,1]);warningCore.material=new THREE.MeshBasicMaterial({color:0xffae45,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});warningCore.name='warning-core';warningCore.renderOrder=29;warn.add(warningCore);warn.name='warning'; warn.visible=false; this.root.add(warn); g.userData.warning=warn;
      const laser=new THREE.Group();const energy=this.energy(0xff642c);energy.name='energy';energy.scale.y=1.1;laser.add(energy);const glow=this.art.glow(0xff623b,1);glow.scale.set(1,1.3,1);laser.add(glow);laser.visible=false;this.root.add(laser);g.userData.laser=laser;
    }
    const boundary=new THREE.Group();const markerMaterial=new THREE.MeshBasicMaterial({color:0xd09e66,transparent:true,opacity:.72,toneMapped:false,depthTest:false,depthWrite:false});const markerGeometry=new THREE.TorusGeometry(e.r,.006,3,12,Math.PI*.12);for(let i=0;i<4;i++){const arc=new THREE.Mesh(markerGeometry,markerMaterial);arc.rotation.z=i*Math.PI/2-Math.PI*.06;arc.renderOrder=4;boundary.add(arc);}this.art.merge(boundary);markerGeometry.dispose();this.root.add(boundary);g.userData.boundary=boundary;this.root.add(g); return g;
  }
  textPanel(w,h,width,height) {
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material); panel.userData={canvas,ctx:canvas.getContext('2d'),texture,last:''}; return panel;
  }
  paintPanel(panel, key, draw) { if(panel.userData.last===key)return; panel.userData.last=key; const {canvas,ctx,texture}=panel.userData; ctx.clearRect(0,0,canvas.width,canvas.height); draw(ctx,canvas.width,canvas.height); texture.needsUpdate=true; }
  hudUpdate(game, xr, paused, message, settings, menu) {
    this.pausePanel.visible=xr&&paused;
    if(this.pausePanel.visible&&menu)this.paintPanel(this.pausePanel,JSON.stringify(menu)+settings.difficulty,(c,w,h)=>{
      c.fillStyle='#102019f2';c.fillRect(0,0,w,h);c.strokeStyle='#729b85';c.lineWidth=3;c.strokeRect(2,2,w-4,h-4);
      c.textAlign='left';c.fillStyle='#ff9468';c.font='bold 54px monospace';c.fillText('RIFT / FLIGHT SYSTEMS',64,85);
      c.fillStyle='#a9c4b6';c.font='28px monospace';c.fillText(menu.tracking==='recenter'?'ROOM TRACKING CHANGED · X TO RECENTER':menu.tracking==='lost'?'ROOM TRACKING LOST · WAIT FOR TRACKING':'PAUSED · '+settings.difficulty.toUpperCase()+' · '+(settings.controls==='motion'?'CONTROLLER AIM':'THUMBSTICK'),64,137);
      for(let i=0;i<menu.rows.length;i++){
        const row=menu.rows[i],y=178+i*74,selected=i===menu.selected;
        if(selected){c.fillStyle='#b4ffe2';c.fillRect(40,y,w-80,66);}
        c.fillStyle=selected?'#102019':row.id==='exit'?'#ffa17c':'#e1f5e9';c.font='bold 38px monospace';c.fillText((selected?'› ':'  ')+row.label,64,y+46);
        c.textAlign='right';c.font='36px monospace';c.fillText(row.value,w-72,y+46);c.textAlign='left';
      }
      c.fillStyle='#a9c4b6';c.font='26px monospace';c.fillText('LEFT STICK ↑↓ SELECT / ←→ ADJUST',64,1030);c.fillText('RIGHT TRIGGER CONFIRM · B RESUME · X RECENTER',64,1078);c.font='22px monospace';c.fillText(menu.deploying?'ARENA STAYS HERE · RIGHT TRIGGER DEPLOYS · X RECENTERS':'AIM: POINT RIGHT HAND · HOLD RIGHT STICK TO HOLD SHIP',64,1120);
    });
    const p=game.player;this.message.position.y=paused||game.state!=='playing'?.4:4.05;this.message.scale.setScalar(paused||game.state!=='playing'?1:.60); this.hud.visible=xr; this.message.visible=xr && !paused && ( game.state==='lost' || (game.state==='won'&&!this.cinematics.some(c=>c.kind==='death')) || (game.state==='playing'&&!!message)); this.corners.visible=!xr || paused;
    if (xr) this.paintPanel(this.hud,`${p.hp}/${p.shield}/${p.weapon}/${p.level}/${p.echo}/${p.vector}/${p.missiles}/${game.bombs}/${game.score}/${Math.floor(p.charge*10)}`,c=>{
      c.fillStyle='#101e19dd'; c.fillRect(0,30,1536,125); c.fillStyle='#ff956b'; c.font='bold 32px monospace'; c.fillText('RIFT / 01',30,78);
      c.fillStyle='#edfae8'; c.font='26px monospace'; c.fillText(`HULL ${'◆'.repeat(Math.max(0,p.hp))}  S${p.shield}  CHARGE ${Math.floor(p.charge/1.4*100)}%`,30,123); c.fillText(`${p.weapon} ${p.level} ${p.echo?'+ ECHO':''}`,570,78); c.fillText(`VECTOR ${p.vector} · MISSILE ${p.missiles} · BOMBS ${game.bombs}`,570,123); c.fillStyle='#b4ffe2'; c.font='bold 43px monospace'; c.fillText(String(game.score).padStart(6,'0'),1280,107);
    });
    const ended=game.state==='won'||game.state==='lost';
    const title=ended ? game.state==='won'?'CATHEDRAL DOWN':'SIGNAL LOST' : paused?'FLIGHT STANDBY':message?.title;
    const subtitle=ended ? `SCORE ${String(game.score).padStart(6,'0')}  /  ${game.kills} TARGETS` : paused?`DISTANCE ${(settings.distance*3.281).toFixed(1)} FT  ·  WIDTH ${(settings.width*3.281).toFixed(1)} FT`:message?.subtitle;
    if(xr && this.message.visible) this.paintPanel(this.message,`${title}/${subtitle}`, (c,w,h)=>{
      if(paused||ended) {c.fillStyle='#102019ed';c.fillRect(0,0,w,h); c.strokeStyle='#729b85';c.lineWidth=2;c.strokeRect(2,2,w-4,h-4);}
      c.textAlign='center';c.shadowColor='#081510';c.shadowBlur=8;c.fillStyle='#ff9468';c.font=`bold ${paused||ended?66:48}px monospace`;c.fillText(title||'',w/2,paused||ended?130:100);
      c.fillStyle='#daf7e5';c.font='28px monospace';c.fillText(subtitle||'',w/2,paused||ended?205:157);
      if(paused){c.font='28px monospace';c.fillText('LEFT STICK: WIDTH / DISTANCE   ·   X: RECENTER',w/2,290);c.fillText('RIGHT TRIGGER: DEPLOY / RESUME   ·   B: PAUSE',w/2,348);c.fillStyle='#9cbaa9';c.font='24px monospace';c.fillText('FLY: LEFT STICK   FIRE: RIGHT TRIGGER   CHARGE: RIGHT GRIP',w/2,430);c.fillText('LEFT GRIP: PRECISION FOCUS   ·   A: PULSE BOMB',w/2,477);}
      if(ended){c.font='30px monospace';c.fillText('RIGHT TRIGGER TO FLY AGAIN',w/2,350);c.fillStyle='#9cbaa9';c.font='24px monospace';c.fillText('B: SETTINGS / EXIT GAME',w/2,425);}
    });
    this.bossBar.visible=!!game.boss;
    if(game.boss) {const b=game.boss;this.paintPanel(this.bossBar,`${b.type}/${Math.ceil(b.hp)}/${b.phase}/${b.attackName}`,c=>{c.fillStyle='#13241dea';c.fillRect(0,0,1024,110);c.fillStyle='#ffbc8b';c.font='23px monospace';c.fillText(`${b.type.toUpperCase()} / PHASE ${b.phase} / ${b.attackName||'AWAKENING'}`,20,35);c.fillStyle='#3e5549';c.fillRect(20,60,984,22);c.fillStyle='#ff7545';c.fillRect(20,60,984*Math.max(0,b.hp/b.maxHp),22);});}
  }
  flash(x,y,color,size=.5,life=.16) {if(this.flashes.length>40)return;const obj=this.art.glow(color,size);obj.position.set(x,y,.22);this.root.add(obj);this.flashes.push({obj,size,age:0,life});}
  spark(x,y,color,count=6,strength=1) {for(let i=0;i<count;i++){if(this.particles.length>=1800)this.particles.shift();const angle=Math.random()*Math.PI*2,speed=(.6+Math.random()*3)*strength;this.particles.push({x,y,z:0,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:(Math.random()-.5)*strength*1.7,life:.25+Math.random()*.65,age:0,color,size:.014+Math.random()*.026});}}
  blast(x,y,size=1){if(this.blasts.length>=18){if(size<.5)return;const retired=this.blasts.shift();this.removeObject(retired.obj);}const obj=createBlast(this.art.plane);obj.position.set(x,y,.14);obj.renderOrder=5;this.root.add(obj);this.blasts.push({obj,size,age:0,life:.48+Math.min(size,2)*.12});}
  detachPart(e){const target=this.objects.get(e.enemyId),node=target?.getObjectByName('weakpoint-'+e.partId);if(!node)return;this.root.updateMatrixWorld(true);const obj=node.clone(true),transform=this.root.matrixWorld.clone().invert().multiply(node.matrixWorld);transform.decompose(obj.position,obj.quaternion,obj.scale);prepareDamageMaterials(obj);obj.traverse(m=>{if(m.name==='weak-core')m.visible=false;});this.root.add(obj);node.visible=false;this.cinematics.push({obj,kind:'armor',age:0,life:1.45,vx:-.6,vy:Math.sign(e.y-target.position.y)*1.1,vz:.65,spin:(e.y>target.position.y?1:-1)*2.5});}
  burst(e) {if(e.size>=.5)this.blast(e.x,e.y,e.size);const color=e.color==='orange'?ORANGE:0x7beaff;this.spark(e.x,e.y,color,Math.min(240,Math.round(e.size*100)),e.size);this.flash(e.x,e.y,0xffba78,e.size*2,.25);const obj=this.shock(color);obj.position.set(e.x,e.y,.1);this.root.add(obj);this.shockwaves.push({obj,age:0,life:.6,size:e.size});for(let i=0;i<Math.min(45,12*e.size);i++){if(this.fragments.length>=180)this.fragments.shift();const a=Math.random()*Math.PI*2;this.fragments.push({x:e.x,y:e.y,z:0,vx:Math.cos(a)*(1+Math.random())*e.size,vy:Math.sin(a)*(1+Math.random())*e.size,vz:(Math.random()-.3)*e.size*2,age:0,life:.7+Math.random(),size:(.025+Math.random()*.07)*Math.sqrt(e.size)});}}
  event(e){if(e.type==='partBreak'){this.detachPart(e);this.flash(e.x,e.y,0xffe5b2,.75,.10);}if(e.type==='shoot')this.recoil=1;if(e.type==='missile'){for(const side of [-1,1]){this.flash(e.x-.1,e.y+side*.18,0x80ffd8,.22,.10);this.spark(e.x-.1,e.y+side*.18,0x80ffd8,3,.20);}}if(e.type==='vector'){for(const side of [-1,1])this.flash(e.x+.1,e.y+side*.18,0x83dcff,.25,.06);}if(e.type==='enemyFire'&&e.y!==undefined)this.flash(e.x,e.y,0xff673f,.5,.11);
    if(e.type==='setpiece'){const obj=this.art.setpiece(e.name);obj.scale.setScalar(e.act===1?1.8:1.35);obj.position.set(15,e.act===3?-1.9:1.9,-4.5);obj.rotation.y=e.act===3?-.35:-.22;this.root.add(obj);this.cinematics.push({obj,kind:'flyby',name:e.name,age:0,life:16,speed:2.2});}
    if(e.type==='kill'&&e.boss){let obj;const rendered=this.objects.get(e.id);if(rendered){const data=rendered.userData;rendered.userData={};obj=rendered.clone(true);rendered.userData=data;}else obj=this.art.boss(e.archetype,e.r);prepareDamageMaterials(obj);obj.position.set(e.x,e.y,0);obj.userData.origin={x:e.x,y:e.y};obj.traverse(m=>{if(m.isMesh)m.userData.drift=(Math.random()-.5)*2;});this.root.add(obj);this.cinematics.push({obj,kind:'death',age:0,life:e.archetype==='cathedral'?4.4:2.6,next:.1});}
    if(e.type==='pickup'){this.flash(e.x,e.y,colors[e.kind],1.5,.35);this.spark(e.x,e.y,colors[e.kind],22,.7);}
    if(e.type==='charge'){this.flash(e.x+.4,e.y,0xaceeff,2,.2);for(let i=0;i<5;i++){const obj=this.mesh('ring',0x78c5ff,true,[e.x+.6+i*.6,e.y,.12]);obj.rotation.y=Math.PI/2;this.root.add(obj);this.shockwaves.push({obj,age:-i*.035,life:.36,size:.7});}}
    if(e.type==='shoot'){this.flash(e.x+.4,e.y,e.weapon==='SPREAD'?0xb4ff68:e.weapon==='LANCE'?0x919bff:0x7de8ff,.5,.065);this.spark(e.x+.4,e.y,0xaceeff,2,.22);}if(e.type==='impact'){this.flash(e.x,e.y,0xffe3a8,.32,.075);this.spark(e.x,e.y,0xffd78f,8,.7);const target=this.objects.get(e.enemyId);if(target&&this.sceneTime-(target.userData.lastBlast||-1)>.09){target.userData.lastBlast=this.sceneTime;this.blast(e.x,e.y,.24);}}if(e.type==='graze')this.spark(e.x,e.y,0x91caff,3,.3);}
  clear() {this.tether.visible=this.pointerMark.visible=false;for(const e of this.cinematics)this.removeObject(e.obj);this.cinematics=[];this.recoil=0;this.sceneTime=0; for(const map of [this.objects,this.pickupObjects,this.effectObjects]){for(const obj of map.values())this.removeObject(obj);map.clear();}for(const e of [...this.flashes,...this.shockwaves,...this.blasts])this.removeObject(e.obj);this.flashes=[];this.shockwaves=[];this.blasts=[];this.particles=[];this.fragments=[]; }
  removeObject(obj){const owned=new Set();obj.traverse(m=>{if(m.material?.userData.damageOwned)owned.add(m.material);if(m.isMesh&&m.material?.isShaderMaterial){m.geometry!==this.art.plane&&m.geometry.dispose();m.material.dispose();}});for(const material of owned)material.dispose();this.root.remove(obj);if(obj.userData.boundary){this.root.remove(obj.userData.boundary);const marker=obj.userData.boundary.children[0];marker.geometry.dispose();marker.material.dispose();}if(obj.userData.warning){obj.userData.warning.traverse(m=>{if(m.isMesh)m.material.dispose();});this.root.remove(obj.userData.warning);}if(obj.userData.laser)this.root.remove(obj.userData.laser);if(obj.userData.label){obj.userData.label.geometry.dispose();obj.userData.label.material.map.dispose();obj.userData.label.material.dispose();}}
  sync(map,items,create,update){const ids=new Set();for(const e of items){ids.add(e.id);let obj=map.get(e.id);if(!obj){obj=create(e);map.set(e.id,obj);}update(obj,e);}for(const [id,obj]of map)if(!ids.has(id)){this.removeObject(obj);map.delete(id);}}
  update(game,dt,time){
    this.sceneTime+=dt;time=this.sceneTime;this.recoil=Math.max(0,this.recoil-dt*7);this.updateCinematics(dt,time);
    const p=game.player,xr=this.renderer.xr.isPresenting,shipScale=xr?.34:.8;this.ship.scale.setScalar(shipScale);this.ship.position.set(p.x-this.recoil*.05,p.y,0);this.ship.rotation.x=THREE.MathUtils.lerp(this.ship.rotation.x,(p.moveY||0)*-.42,Math.min(1,dt*14));this.ship.rotation.y=THREE.MathUtils.lerp(this.ship.rotation.y,(p.moveX||0)*.12,Math.min(1,dt*14));this.ship.rotation.z=THREE.MathUtils.lerp(this.ship.rotation.z,(p.moveY||0)*.11,Math.min(1,dt*14));this.ship.visible=p.hp>0;
    this.echo.visible=p.echo&&p.hp>0;this.echo.scale.setScalar(xr?.21:.45);this.echo.position.set(game.echoWing.x,game.echoWing.y,0);this.echo.rotation.x=THREE.MathUtils.lerp(this.echo.rotation.x,game.echoWing.moveY*-.42,Math.min(1,dt*14));
    this.vectorPods.visible=p.vector>0;this.missilePods.visible=p.missiles>0;this.vectorPods.rotation.z=Math.sin(time*12)*.015*p.vector;
    this.hitbox.visible=this.playerBeaconOutline.visible=p.hp>0;this.hitbox.scale.set(p.focus?p.r:.035,p.focus?p.r:.035,.015);this.playerBeaconOutline.scale.set(p.focus?p.r+.025:.065,p.focus?p.r+.025:.065,.012);this.playerBeaconOutline.position.set(p.x,p.y,0);this.hitbox.material.color.setHex(p.invincible>0&&Math.floor(time*3)%2?0xffc165:0xd9fff4);this.hitboxRing.visible=!!p.focus&&p.hp>0;this.hitbox.position.set(p.x,p.y,0);this.hitboxRing.position.set(p.x,p.y,0);
    this.shield.visible=p.shield>0;this.shield.position.set(p.x,p.y,0);this.shield.rotation.y=Math.sin(time*2)*.3;this.shield.rotation.z=time*.6;
    this.charge.visible=p.charge>.1;this.charge.position.set(p.x+.3,p.y,0);this.charge.scale.setScalar(.025+p.charge*.08);
    this.chargeArcs.visible=p.charge>.1;this.chargeArcs.position.set(p.x+.22,p.y,.05);this.chargeArcs.scale.setScalar(.65+p.charge*.4);this.chargeArcs.rotation.z=time*(3+p.charge*3);this.chargeGlow.visible=p.charge>.1;this.chargeGlow.position.set(p.x+.35,p.y,.1);this.chargeGlow.scale.setScalar(.3+p.charge*.6);
    this.animateEngines(this.ship,time,1+(p.moveX||0)*.3);this.animateEngines(this.echo,time,1);
    this.trailClock=(this.trailClock||0)+dt;if(this.trailClock>.025&&p.hp>0){this.trailClock=0;for(const side of [-1,1]){const px=p.x-.6*shipScale,py=p.y+side*.2*shipScale;this.particles.push({x:px,y:py,z:0,vx:-2-Math.random()*2,vy:(Math.random()-.5)*.1,vz:0,life:.2+Math.random()*.16,age:0,color:0x69dfff,size:.02});}}
    this.sync(this.objects,game.enemies.filter(e=>!e.dead),e=>this.enemy(e),(g,e)=>{g.position.set(e.x,e.y,Math.max(0,e.entry)*-1.2);g.userData.boundary.position.set(e.x,e.y,0);g.userData.boundary.visible=e.entry<=0;g.rotation.y=e.maxHp?0:Math.sin(e.age*2)*.12;updateDamageMaterials(g,e);for(const part of e.parts||[]){const node=g.getObjectByName('weakpoint-'+part.id);if(node){node.visible=!part.broken;const energy=node.getObjectByName('weak-core');if(energy?.material.userData.reactor){const u=energy.material.userData.reactorUniforms;u.time.value=time+part.y;u.hit.value=Math.min(1,part.flash/.14);}if(!part.broken&&part.hp<part.maxHp*.4){node.userData.sparkClock=(node.userData.sparkClock||0)+dt;if(node.userData.sparkClock>.22){node.userData.sparkClock=0;this.spark(e.x+part.x,e.y+part.y,0xff9d4d,3,.28);}}}const socket=g.getObjectByName('socket-'+part.id);if(socket)socket.visible=part.broken;}const core=g.getObjectByName('core');if(core.material.userData.reactor){const u=core.material.userData.reactorUniforms;u.time.value=time;u.hit.value=Math.min(1,(e.flash||0)/.11);}else core.material=this.material(e.flash>0?WHITE:e.type==='weaver'?0xdc85ce:0xffb774,true);
      if(e.maxHp){const machine=g.getObjectByName('machinery');machine.rotation.z=Math.sin(e.age*.6)*.035;machine.rotation.y=Math.sin(e.age*.6)*.2;machine.scale.setScalar((1+(e.phase-1)*.12)*(e.entry>0?.35+.65*(1-Math.max(0,e.entry)/3):1));const turbine=machine.getObjectByName('turbine');if(turbine)turbine.rotation.z=-e.age*(.5+e.phase*.15);const iris=machine.getObjectByName('iris');if(iris){iris.rotation.z=e.age*-.32;iris.scale.setScalar(e.warning>0?.9+.15*Math.sin(time*22):1);}for(const arm of machine.children.filter(c=>c.name==='petal')){arm.rotation.y=Math.sin(e.age*.8+arm.rotation.z)*.12+(e.phase-1)*.40;arm.position.z=-(e.phase-1)*.35;arm.visible=true;}for(const claw of machine.children.filter(c=>c.name==='claw'))claw.rotation.z=claw.userData.side*(.04+Math.sin(e.age*1.4)*.12);const w=g.userData.warning,l=g.userData.laser;w.visible=e.warning>0;w.getObjectByName('warning-core').material.color.setHex(Math.floor(time*3)%2?0xffbd58:0xf17526);l.visible=e.laser>0;w.position.set((e.x-8)/2,e.laserY,0);l.position.copy(w.position);w.scale.x=l.scale.x=e.x+8;if(l.visible)l.getObjectByName('energy').material.uniforms.uTime.value=time;}
      else{const limbs=g.getObjectByName('limbs');if(limbs)for(const fin of limbs.children)fin.rotation.x=fin.userData.side*Math.sin(e.age*4+fin.userData.phase)*.35;g.rotation.x=Math.sin(e.age*2+e.phase)*.2;g.rotation.z=e.type==='weaver'?Math.sin(e.age*2)*.25:0;}
    });
    let hostileIndex=0;for(const mesh of Object.values(this.friendlyBank))mesh.count=0;
    for(const shot of game.shots){
      const angle=Math.atan2(shot.vy,shot.vx),style=projectileStyle(shot);this.dummy.rotation.set(0,0,angle);
      if(!shot.hostile&&shot.kind==='ring'){
        for(const [name,factor] of [['ringOutline',1],['ringBody',1],['ringCore',1]]){const mesh=this.friendlyBank[name],i=mesh.count++;this.dummy.position.set(shot.x,shot.y,0);this.dummy.rotation.z=shot.age*2;this.dummy.scale.set(shot.r*factor,shot.r*factor,.25);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);}
        continue;
      }
      if(!shot.hostile&&shot.kind==='missile'){
        for(const [name,factor]of [['missileOutline',1.25],['missileBody',1],['missileCore',.48]]){const mesh=this.friendlyBank[name],i=mesh.count++;this.dummy.position.set(shot.x,shot.y,0);this.dummy.rotation.z=angle-Math.PI/2;this.dummy.scale.set(.065*factor,.19*factor,.045);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);}
        const trail=this.friendlyBank.trail;for(let n=1;n<shot.trail.length;n+=2){const point=shot.trail[n],previous=shot.trail[n-1];if(trail.count>=1800)break;this.dummy.position.set((point.x+previous.x)/2,(point.y+previous.y)/2,0);this.dummy.rotation.z=Math.atan2(point.y-previous.y,point.x-previous.x);this.dummy.scale.set(Math.hypot(point.x-previous.x,point.y-previous.y)*1.5,.016*point.life/.28,.008);this.dummy.updateMatrix();trail.setMatrixAt(trail.count++,this.dummy.matrix);}
        continue;
      }
      const bank=shot.hostile?{outline:this.bulletOutline,body:this.bullets,core:this.bulletCore}:this.friendlyBank;
      const i=shot.hostile?hostileIndex++:bank.body.count++;if(!shot.hostile)bank.outline.count=bank.core.count=bank.body.count;
      this.dummy.rotation.z=angle;
      for(const [mesh,length,width,color] of [[bank.outline,style.length*1.18,style.width*1.38,null],[bank.body,style.length,style.width,style.color],[bank.core,style.length*.65,style.width*.35,style.core]]){
        this.dummy.position.set(shot.x,shot.y,0);this.dummy.scale.set(length,width,shot.r*.3);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);if(color!==null)mesh.setColorAt(i,this.color.setHex(color));
      }
      if(shot.hostile){this.dummy.position.set(shot.x,shot.y,.075);this.dummy.scale.set(style.length*3,shot.r*3,1);this.dummy.updateMatrix();this.bulletHalos.setMatrixAt(i,this.dummy.matrix);this.bulletHalos.setColorAt(i,this.color.setHex(style.color));}
    }
    this.bullets.count=this.bulletCore.count=this.bulletHalos.count=this.bulletOutline.count=hostileIndex;
    for(const mesh of [this.bullets,this.bulletCore,this.bulletOutline,this.bulletHalos,...Object.values(this.friendlyBank)]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    this.sync(this.pickupObjects,game.pickups,item=>{const g=this.art.pickup(item.kind,colors[item.kind]);const label=this.textPanel(256,80,.72,.22);label.position.set(0,-.4,0);this.paintPanel(label,item.kind,c=>{c.fillStyle='#091320bb';c.fillRect(0,0,256,80);c.fillStyle='#edfbea';c.textAlign='center';c.font='bold 36px monospace';c.fillText(item.kind,128,54);});g.add(label);g.userData.label=label;this.root.add(g);return g;},(g,e)=>{g.position.set(e.x,e.y,0);g.getObjectByName('capsule').rotation.y=Math.sin(e.age*2)*.35;});
    this.sync(this.effectObjects,game.effects,e=>{const g=new THREE.Group();if(e.kind==='beam'){const energy=this.energy(0x66b7ff);energy.name='energy';g.add(energy);}else{const shock=this.shock(0x73dfff);shock.name='shock';g.add(shock);g.add(this.art.glow(0x46a7ff,1.5));}this.root.add(g);return g;},(g,e)=>{const f=1-e.age/e.life;if(e.kind==='beam'){g.position.set((e.x+8)/2,e.y,0);g.scale.set(8-e.x,(.9+e.strength)*f,1);g.getObjectByName('energy').material.uniforms.uTime.value=time;}else{g.position.set(e.x,e.y,e.age*.5);g.scale.setScalar(.1+e.age*21);g.getObjectByName('shock').material.uniforms.uFade.value=f;}});
    this.particles=this.particles.filter(p=>p.age<p.life).slice(-1800);this.particleMesh.count=this.emberMesh.count=this.particleKeyline.count=this.particles.length;
    this.particles.forEach((p,i)=>{p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;const size=p.size*Math.max(0,1-p.age/p.life);this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(0,0,Math.atan2(p.vy,p.vx));this.dummy.scale.set(size*4,size*.55,size);this.dummy.updateMatrix();this.dummy.position.z=p.z-.008;this.dummy.scale.set(size*4.6,size*.9,size*1.08);this.dummy.updateMatrix();this.particleKeyline.setMatrixAt(i,this.dummy.matrix);this.dummy.position.z=p.z;this.dummy.scale.set(size*4,size*.55,size);this.dummy.updateMatrix();this.particleMesh.setMatrixAt(i,this.dummy.matrix);this.particleMesh.setColorAt(i,this.color.setHex(p.color));this.dummy.scale.set(size*12,size*4,1);this.dummy.updateMatrix();this.emberMesh.setMatrixAt(i,this.dummy.matrix);this.emberMesh.setColorAt(i,this.color);});for(const mesh of [this.particleMesh,this.emberMesh,this.particleKeyline]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    this.blasts=this.blasts.filter(e=>{e.age+=dt;const f=e.age/e.life;e.obj.material.uniforms.age.value=f;e.obj.scale.setScalar(e.size*(.65+Math.sqrt(f)*1.8));if(f>=1)this.removeObject(e.obj);return f<1;});
    this.flashes=this.flashes.filter(e=>{e.age+=dt;const f=1-e.age/e.life;e.obj.scale.setScalar(e.size*Math.max(0,f));if(f<=0)this.root.remove(e.obj);return f>0;});
    this.shockwaves=this.shockwaves.filter(e=>{e.age+=dt;e.obj.scale.setScalar(.1+e.age*e.size*4);if(e.obj.material.uniforms?.uFade)e.obj.material.uniforms.uFade.value=Math.max(0,1-e.age/e.life);if(e.age>=e.life)this.removeObject(e.obj);return e.age<e.life;});
    this.fragments=this.fragments.filter(f=>f.age<f.life);this.fragmentMesh.count=this.fragments.length;this.fragments.forEach((f,i)=>{f.age+=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.z+=f.vz*dt;this.dummy.position.set(f.x,f.y,f.z);this.dummy.rotation.set(f.age*4,f.age*3,i);const size=f.size*Math.max(0,1-f.age/f.life);this.dummy.scale.set(size*2,size,.025);this.dummy.updateMatrix();this.fragmentMesh.setMatrixAt(i,this.dummy.matrix);});this.fragmentMesh.instanceMatrix.needsUpdate=true;
    for(const d of this.debris.children){d.position.x-=dt*d.userData.speed;if(d.position.x< -10)d.position.x=10;d.rotation.x+=dt*.2;d.rotation.z+=dt*.15;}
  }
  updateCinematics(dt,time){
    this.cinematics=this.cinematics.filter(e=>{
      e.age+=dt;
      if(e.kind==='flyby'){e.obj.position.x-=dt*e.speed;e.obj.position.y+=Math.sin(time*.4)*dt*.15;if(e.name==='LEVIATHAN'){e.obj.rotation.z=Math.sin(e.age*.27)*.055;e.obj.position.z=-4.5+Math.sin(e.age*.2)*.7;}else if(e.name==='THE PROCESSION'){for(const forge of e.obj.children.filter(c=>c.name==='forge')){forge.rotation.y=e.age*.18;forge.getObjectByName('cage').rotation.z=e.age*(forge.userData.index%2?-.4:.4);}}else{e.obj.rotation.x=e.age*.22;e.obj.rotation.z=Math.sin(e.age*.3)*.1;}}
      else if(e.kind==='armor'){e.obj.position.x+=e.vx*dt;e.obj.position.y+=e.vy*dt;e.obj.position.z+=e.vz*dt;e.obj.rotation.x+=dt*1.4;e.obj.rotation.z+=dt*e.spin;if(e.age>e.life*.6)e.obj.scale.multiplyScalar(Math.exp(-dt*3));}
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
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.NormalBlending,side:THREE.DoubleSide,uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(color)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vUv;uniform float uTime;uniform vec3 uColor;void main(){float warp=sin(vUv.x*55.0-uTime*35.0)*.024+sin(vUv.x*119.0+uTime*22.0)*.008;float y=abs(vUv.y-.5+warp);float core=exp(-y*95.0);float corona=exp(-y*12.0)*.45;float filament=exp(-abs(y-.085-sin(vUv.x*32.0-uTime*12.0)*.025)*90.0)*.4;float ends=smoothstep(0.0,.03,vUv.x)*smoothstep(0.0,.03,1.0-vUv.x);float band=1.0-smoothstep(.105,.145,y);float colorBand=1.0-smoothstep(.065,.105,y);vec3 body=mix(vec3(.015,.024,.045),uColor,colorBand);body=mix(body,vec3(.94,.96,.85),min(1.0,core+filament));gl_FragColor=vec4(body,max(band*.98,corona*.25)*ends);}'
    });const mesh=new THREE.Mesh(this.art.plane,material);mesh.renderOrder=26;return mesh;
  }
  animateEngines(ship,time,power=1){for(const side of [-1,1]){const jet=ship.getObjectByName(`jet${side}`),engine=ship.getObjectByName(`engine${side}`);if(jet)jet.scale.x=(.65+Math.sin(time*53+side)*.08)*power;if(engine)engine.scale.y=(.23+Math.sin(time*47)*.04)*power;}}
  controllerSample(frame,source){
    if(!frame?.getPose||!source?.targetRaySpace||source.targetRayMode!=='tracked-pointer')return null;
    const pose=frame.getPose(source.targetRaySpace,this.renderer.xr.getReferenceSpace());
    if(!pose||pose.emulatedPosition)return null;
    const p=pose.transform.position,q=pose.transform.orientation,origin=new THREE.Vector3(p.x,p.y,p.z);
    if(![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite))return null;
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
    this.root.updateMatrixWorld(true);const inverse=this.root.matrixWorld.clone().invert(),localOrigin=origin.clone().applyMatrix4(inverse),localDirection=direction.clone().transformDirection(inverse);
    const miss={tracked:true,origin,direction,end:origin.clone().addScaledVector(direction,2),point:null};
    if(localDirection.z>=-.12)return miss;
    const t=-localOrigin.z/localDirection.z;if(t<=0||t*this.root.scale.x>6)return miss;
    const point=localOrigin.addScaledVector(localDirection,t);return {tracked:true,origin,direction,end:origin.clone().addScaledVector(direction,t*this.root.scale.x),point:{x:point.x,y:point.y}};
  }
  updateTether(cue,player,active){
    this.tether.visible=!!(active&&cue?.end);this.pointerMark.visible=!!(this.tether.visible&&cue.point&&cue.point.x>=-7.7&&cue.point.x<=7.6&&cue.point.y>=-4.2&&cue.point.y<=4.2);if(!this.tether.visible)return;
    const end=cue.end,start=cue.origin.clone(),direction=end.clone().sub(start),length=direction.length();
    if(length<.05){this.tether.visible=false;return;}
    this.tether.position.copy(start).add(end).multiplyScalar(.5);this.tether.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());this.tether.scale.set(1,length,1);const color=cue.clutch?0xe6fff6:cue.valid?0x86e8ff:0xffb861;this.tetherCore.material.color.setHex(color);this.pointerColor.color.setHex(color);if(this.pointerMark.visible)this.pointerMark.position.set(cue.point.x,cue.point.y,0);
  }
  resize(){if(this.renderer.xr.isPresenting)return;this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.position.set(0,0,Math.max(13.8,9.2/this.camera.aspect/Math.tan(21*Math.PI/180)));this.camera.updateProjectionMatrix();}
  place(pose,settings){return placeArena(this.root,pose,settings);}
  desktop(){this.root.scale.setScalar(1);this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);this.resize();}
  render(time,playing){if(playing){this.renderer.setScissorTest(false);this.renderer.render(this.scene,this.camera);}else{
    this.renderer.setScissorTest(false);this.renderer.clear();const rect=document.querySelector('.preview-space').getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)return;
    this.renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);this.renderer.setScissor(rect.left,innerHeight-rect.bottom,rect.width,rect.height);this.renderer.setScissorTest(true);
    this.previewCamera.aspect=rect.width/rect.height;this.previewCamera.updateProjectionMatrix();this.previewShip.rotation.set(.4+Math.sin(time*.4)*.12,-.5, .15+Math.sin(time*.6)*.06);this.previewShip.position.y=Math.sin(time*.8)*.08;this.animateEngines(this.previewShip,time);this.previewRing.rotation.z=time*.06;this.renderer.render(this.previewScene,this.previewCamera);this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,innerWidth,innerHeight);
  }}
}

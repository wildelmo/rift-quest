import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Sculpted silhouettes, layered armor and shared merged geometry keep detail affordable in XR.
export class Art {
  constructor() {
    this.models = new Map(); this.materials = new Map();
    this.box = new RoundedBoxGeometry(1,1,1,2,.1);
    this.cylinder = new THREE.CylinderGeometry(1,1,1,16);
    this.sphere = new THREE.SphereGeometry(1,20,12);
    this.plane = new THREE.PlaneGeometry(1,1);
    const surface=document.createElement('canvas');surface.width=surface.height=256;const sc=surface.getContext('2d');sc.fillStyle='#aaa';sc.fillRect(0,0,256,256);
    for(let i=0;i<7000;i++){const v=145+Math.floor(Math.random()*40);sc.fillStyle=`rgb(${v},${v},${v})`;sc.fillRect(Math.random()*256,Math.random()*256,1,1);}
    sc.strokeStyle='#707070';sc.lineWidth=1;for(let i=0;i<4;i++){sc.strokeRect(5+i*63,5,54,246);sc.fillStyle='#505050';sc.fillRect(10+i*63,16,3,3);sc.fillRect(10+i*63,235,3,3);}
    this.surface=new THREE.CanvasTexture(surface);this.surface.wrapS=this.surface.wrapT=THREE.RepeatWrapping;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.12,'rgba(255,255,255,.8)');gradient.addColorStop(.32,'rgba(255,255,255,.22)');gradient.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);
    this.glowTexture=new THREE.CanvasTexture(canvas);
  }
  contour(group) {
    // Two cached inverted hulls per body, never a screen-sized backplate or bloom pass.
    const geos=[];group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
    group.traverse(m=>{if(!m.isMesh||m.material.transparent||m.material.isMeshBasicMaterial)return;
      const geometry=m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld));
      const plain=geometry.index?geometry.toNonIndexed():geometry;if(plain!==geometry)geometry.dispose();
      for(const name of Object.keys(plain.attributes))if(!['position','normal','uv'].includes(name))plain.deleteAttribute(name);geos.push(plain);
    });
    if(!geos.length)return;const geometry=mergeGeometries(geos);for(const g of geos)g.dispose();
    for(const [width,color] of [[.022,0x111827],[.010,0xe8eadb]]){
      const key='contour-'+color;let material=this.materials.get(key);
      if(!material){material=new THREE.MeshBasicMaterial({color,side:THREE.BackSide,toneMapped:false});
        material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed = position + normalize(normal) * '+width.toFixed(3)+';');};
        material.customProgramCacheKey=()=>key;this.materials.set(key,material);}
      const hull=new THREE.Mesh(geometry,material);hull.name='contrast-contour';group.add(hull);
    }
  }
  mat(color,glow=false,glass=false) {
    const key=`${color}/${glow}/${glass}`;
    if(!this.materials.has(key))this.materials.set(key,glow?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshPhysicalMaterial({color,metalness:glass?.65:.72,roughness:glass?.12:.32,roughnessMap:glass?null:this.surface,bumpMap:glass?null:this.surface,bumpScale:.008,clearcoat:1,clearcoatRoughness:.18}));
    return this.materials.get(key);
  }
  glow(color,size=1) {
    const key=`glow/${color}`;if(!this.materials.has(key))this.materials.set(key,new THREE.MeshBasicMaterial({map:this.glowTexture,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
    const mesh=new THREE.Mesh(this.plane,this.materials.get(key));mesh.scale.setScalar(size);mesh.renderOrder=2;return mesh;
  }
  part(g,geometry,color,pos=[0,0,0],scale=[1,1,1],rotation=[0,0,0],glow=false,glass=false) {
    const m=new THREE.Mesh(geometry,this.mat(color,glow,glass));m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rotation);g.add(m);return m;
  }
  plate(g,points,color,depth=.055,z=0) {
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:Math.min(.012,depth*.18),bevelThickness:Math.min(.012,depth*.18),curveSegments:4});
    return this.part(g,geo,color,[0,0,z-depth/2]);
  }
  ring(g,r,t,color,z=0,glow=false) {return this.part(g,new THREE.TorusGeometry(r,t,8,48),color,[0,0,z],[1,1,1],[0,0,0],glow);}
  merge(group) {
    const buckets=new Map();group.updateMatrixWorld(true);
    for(const m of [...group.children]){if(!m.isMesh)continue;m.updateMatrix();let geo=m.geometry.clone();if(geo.index){const old=geo;geo=geo.toNonIndexed();old.dispose();}geo.applyMatrix4(m.matrix);const list=buckets.get(m.material)||[];list.push(geo);buckets.set(m.material,list);group.remove(m);}
    for(const [mat,geos] of buckets){const merged=mergeGeometries(geos);for(const geo of geos)geo.dispose();group.add(new THREE.Mesh(merged,mat));}return group;
  }
  ship() {
    if(this.models.has('ship'))return this.models.get('ship').clone(true);
    const g=new THREE.Group(),hull=new THREE.Group();g.add(hull);
    this.plate(hull,[[-.42,-.1],[-.18,-.14],[.31,-.095],[.62,0],[.31,.095],[-.18,.14],[-.42,.1]],0xb8c9d1,.14);
    this.plate(hull,[[-.33,-.078],[.2,-.067],[.4,0],[.2,.067],[-.33,.078]],0x172b3b,.075,.10);
    this.plate(hull,[[-.12,-.053],[.17,-.037],[.28,0],[.17,.037],[-.12,.053]],0x2a94ae,.042,.15);
    this.part(hull,this.sphere,0x0c5778,[.018,0,.16],[.145,.049,.042],[0,0,0],false,true);
    for(const s of [-1,1]) {
      const wing=[[-.35,s*.1],[.18,s*.13],[.06,s*.21],[-.31,s*.38],[-.46,s*.36],[-.28,s*.19]];
      this.plate(hull,wing,0xc8d6da,.055,-.01);
      this.plate(hull,[[-.32,s*.17],[.04,s*.17],[-.23,s*.29],[-.37,s*.29]],0x24404f,.035,.025);
      this.plate(hull,[[-.40,s*.31],[-.25,s*.31],[-.3,s*.345],[-.43,s*.345]],0xf56b39,.023,.046);
      this.part(hull,this.cylinder,0x1d303c,[-.30,s*.2,.018],[.062,.34,.062],[0,0,Math.PI/2]);
      for(let j=0;j<3;j++)this.part(hull,this.cylinder,j===0?0xf59356:0x9dabb4,[-.45+j*.055,s*.2,.018],[.072,.018,.072],[0,0,Math.PI/2]);
      this.part(hull,this.cylinder,0x93f6ff,[-.467,s*.2,.018],[.049,.014,.049],[0,0,Math.PI/2],true);
      this.part(hull,this.box,0x263b49,[.19,s*.083,.01],[.43,.023,.034]);
      this.part(hull,this.box,0x8ceeff,[.13,s*.083,.04],[.26,.008,.01],[0,0,0],true);
      for(let j=0;j<5;j++)this.part(hull,this.box,0x07141d,[-.28+j*.033,s*.125,.081],[.014,.035,.008]);
      const jet=this.glow(0x56dfff,1);jet.position.set(-.70,s*.2,.018);jet.scale.set(.72,.17,1);jet.name=`jet${s}`;g.add(jet);
      const filament=this.part(g,this.cylinder,0xd8ffff,[-.60,s*.2,.018],[.018,.25,.018],[0,0,Math.PI/2],true);filament.name=`engine${s}`;
    }
    this.part(hull,this.box,0xf4a163,[-.23,0,.148],[.04,.07,.012]);
    this.part(hull,this.box,0xb3f9ff,[.35,0,.059],[.07,.017,.016],[0,0,0],true);
    this.merge(hull);this.models.set('ship',g);return g.clone(true);
  }
  enemy(type,r) {
    const key=`${type}/${r}`;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),hull=new THREE.Group();g.add(hull);
    const pale=type==='carrier'?0x9d9b91:0x7c929b,black=0x182632,copper=0xb6533d;
    if(type==='dart') {
      this.plate(hull,[[-.46,0],[-.05,-.17],[.28,-.10],[.35,0],[.28,.10],[-.05,.17]],pale,.14);
      for(const s of [-1,1]){this.plate(hull,[[.07,s*.11],[.35,s*.30],[.41,s*.27],[.29,s*.05]],copper,.06,.02);this.part(hull,this.box,0xff7551,[-.14,s*.065,.095],[.32,.015,.02],[0,0,s*.12],true);}
    } else if(type==='weaver') {
      this.plate(hull,[[-.28,0],[-.08,-.16],[.17,-.12],[.31,0],[.17,.12],[-.08,.16]],black,.18);
      for(const s of [-1,1])for(let i=0;i<3;i++){this.plate(hull,[[.02+i*.09,s*.08],[.20+i*.08,s*(.24+i*.04)],[.35+i*.06,s*(.21+i*.03)],[.21+i*.05,s*.08]],i===1?copper:pale,.04,-i*.05);}
    } else if(type==='sentinel'||type==='carrier') {
      this.plate(hull,[[-.26,-.19],[-.04,-.28],[.31,-.20],[.36,.20],[-.04,.28],[-.26,.19]],black,.23);
      for(const s of [-1,1]){this.plate(hull,[[-.26,s*.12],[.14,s*.13],[.26,s*.43],[-.1,s*.5],[-.33,s*.3]],pale,.13,.03);this.plate(hull,[[-.17,s*.20],[.10,s*.22],[.17,s*.37],[-.09,s*.40]],copper,.027,.116);for(let j=0;j<4;j++)this.part(hull,this.box,0x171e28,[-.13+j*.067,s*.32,.143],[.03,.12,.016]);this.part(hull,this.cylinder,black,[-.26,s*.27,-.01],[.09,.3,.09],[0,0,Math.PI/2]);}
    } else {
      this.plate(hull,[[-.25,0],[-.15,-.13],[.14,-.16],[.30,0],[.14,.16],[-.15,.13]],pale,.17);
      for(const s of [-1,1]){this.plate(hull,[[-.10,s*.13],[.14,s*.30],[.33,s*.26],[.23,s*.06]],black,.065);this.plate(hull,[[.03,s*.15],[.16,s*.24],[.25,s*.22],[.17,s*.10]],copper,.025,.05);}
    }
    this.ring(hull,.105,.025,0x0c1925,.13);this.ring(hull,.095,.011,0xff613b,.157,true);this.ring(hull,.24,.005,0xff683a,.03,true);
    this.merge(hull);
    const core=this.part(g,this.sphere,0xffe4b0,[0,0,.165],[.078,.078,.03],[0,0,0],true);core.name='core';
    const glow=this.glow(0xff5327,.47);glow.position.z=.18;g.add(glow);
    const engine=this.glow(0xff6341,.7);engine.position.set(.46,0,-.025);engine.scale.set(.55,.14,1);engine.name='jet';g.add(engine);
    g.scale.setScalar(r/.24);this.models.set(key,g);return g.clone(true);
  }
  gatekeeper(r) {
    const g=new THREE.Group(),hull=new THREE.Group(),machine=new THREE.Group();machine.name='machinery';g.add(hull,machine);
    this.plate(hull,[[-r*.9,-r*.35],[r*.25,-r*.72],[r*1.7,-r*.4],[r*2,0],[r*1.7,r*.4],[r*.25,r*.72],[-r*.9,r*.35]],0x273f4a,.35,-.10);
    for(const side of [-1,1]){
      this.plate(hull,[[r*.4,side*r*.25],[r*1.6,side*r*.28],[r*1.35,side*r*.57],[r*.12,side*r*.69],[-r*.4,side*r*.35]],0xa66a49,.10,.15);
      for(let i=0;i<7;i++)this.part(hull,this.box,0x152431,[r*(.15+i*.18),side*r*.46,.22],[.038,.18,.027],[0,0,side*.1]);
      this.part(hull,this.cylinder,0x9da6ac,[r*1.55,side*r*.57,-.04],[r*.21,r*.7,r*.21],[0,0,Math.PI/2]);
      this.part(hull,this.cylinder,0xf78f4d,[r*1.94,side*r*.57,-.04],[r*.16,.018,r*.16],[0,0,Math.PI/2],true);
      const jet=this.glow(0xff622e,1.3);jet.position.set(r*2.3,side*r*.57,-.04);jet.scale.set(1.5,.3,1);g.add(jet);
      const claw=new THREE.Group();claw.name='claw';claw.userData.side=side;
      this.plate(claw,[[r*.65,side*r*.48],[-r*.1,side*r*.85],[-r*1.3,side*r*1.22],[-r*1.75,side*r*.62],[-r*1.5,side*r*.51],[-r*.78,side*r*.80],[r*.42,side*r*.35]],0x81939a,.18,-.12);
      this.plate(claw,[[-r*.05,side*r*.73],[-r*1.15,side*r*1.03],[-r*1.4,side*r*.69],[-r*1.04,side*r*.86]],0xe6a568,.034,.005);
      this.part(claw,this.cylinder,0x273745,[-r*1.30,side*r*.66,-.03],[.09,r*.65,.09],[0,0,Math.PI/2]);
      this.part(claw,this.cylinder,0xffd2a1,[-r*1.65,side*r*.66,-.03],[.055,.025,.055],[0,0,Math.PI/2],true);
      this.ring(claw,.10,.025,0xb8c5c7,.1);this.merge(claw);machine.add(claw);
    }
    this.ring(hull,r*.78,.07,0x172936,.04);this.ring(hull,r*.97,.018,0xff8144,.08,true);this.merge(hull);
    const core=this.part(g,this.sphere,0xffd18d,[0,0,.1],[r*.46,r*.46,r*.24],[0,0,0],true);core.name='core';const glow=this.glow(0xff6729,r*2.1);glow.position.z=.22;g.add(glow);return g;
  }
  boss(type,r) {
    const key=`${type}/${r}`;if(this.models.has(key))return this.models.get(key).clone(true);
    if(type==='gatekeeper'){const model=this.gatekeeper(r);this.models.set(key,model);return model.clone(true);}
    const g=new THREE.Group(),hull=new THREE.Group(),machine=new THREE.Group();machine.name='machinery';g.add(hull,machine);
    this.ring(hull,r*.76,r*.17,0x233747,-.09);this.ring(hull,r*.61,r*.055,0xbb9b77,.12);
    this.ring(hull,r*.97,.017,0xff8652,.07,true);
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2,plate=new THREE.Group();plate.rotation.z=a;this.plate(plate,[[r*.42,-.12],[r*.81,-.15],[r*.95,.06],[r*.55,.16]],i%2?0x617783:0x8999a0,.16,.06);this.part(plate,this.box,0xff7537,[r*.8,0,.16],[.12,.028,.025],[0,0,0],true);this.part(plate,this.sphere,0xe8c59a,[r*.66,.078,.17],[.025,.025,.018]);hull.add(this.merge(plate));}
    // Segmented rear turbine and articulated armor petals extend behind the combat core.
    const count=type==='gatekeeper'?6:10;
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2,arm=new THREE.Group();arm.rotation.z=a;arm.name='petal';
      this.plate(arm,[[r*.9,-.18],[r*1.9,-.32],[r*2.35,-.08],[r*2.25,.13],[r*1.25,.2]],0x506673,.22,-.35);
      this.plate(arm,[[r*1.12,-.08],[r*1.84,-.18],[r*2.10,-.04],[r*1.72,.11],[r*1.12,.12]],0x9caaa9,.055,-.18);
      this.part(arm,this.box,0xff703c,[r*1.63,0,-.12],[r*.6,.035,.02],[0,0,0],true);
      this.part(arm,this.cylinder,0x253642,[r*1.62,0,-.8],[.1,.8,.1],[Math.PI/2,0,0]);
      for(let j=0;j<5;j++)this.part(arm,this.box,0x17232f,[r*(1.25+j*.14),-.09,-.13],[.04,.15,.02]);
      this.part(arm,this.cylinder,0xb4b9bb,[r*1.8,0,-.9],[.18,.06,.18],[Math.PI/2,0,0]);
      const pipe=new THREE.CatmullRomCurve3([new THREE.Vector3(r*.9,-.05,-.32),new THREE.Vector3(r*1.1,-.13,-.55),new THREE.Vector3(r*1.6,-.14,-.75),new THREE.Vector3(r*1.9,0,-.6)]);this.part(arm,new THREE.TubeGeometry(pipe,12,.028,5,false),0xe5b571);
      this.merge(arm);machine.add(arm);
    }
    const turbine=new THREE.Group();turbine.name='turbine';this.ring(turbine,r*1.65,.085,0x455a67,-.8);this.ring(turbine,r*1.63,.021,0xff5f39,-.7,true);for(let i=0;i<24;i++){const a=i/24*Math.PI*2;this.part(turbine,this.box,0x99a6b1,[Math.cos(a)*r*1.52,Math.sin(a)*r*1.52,-.78],[.16,.37,.1],[0,0,a+.4]);}machine.add(this.merge(turbine));
    const core=this.part(g,this.sphere,0xffe8ae,[0,0,.14],[r*.40,r*.40,r*.23],[0,0,0],true);core.name='core';
    const energy=this.glow(0xff5e25,r*2.4);energy.position.z=.4;g.add(energy);this.models.set(key,g);return g.clone(true);
  }
}

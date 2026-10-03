import * as THREE from 'three';
import { Art as BaseArt } from './art.js';
import { BOSS_PART_LAYOUTS, BOSS_CORE_RADIUS } from './boss-parts.js';
const C={white:0xbacbd0,edge:0x8eabb4,ink:0x111e28,steel:0x40596b,copper:0x885648,gold:0xbd9870,cyan:0x70e9ee,hot:0xff7149};
// Angular armored machines: etched alloy, recessed machinery, restrained energy channels.
export class Art extends BaseArt {
  constructor(){
    super();
    this.box=new THREE.BoxGeometry(1,1,1);
    // One shared deterministic surface atlas: etched panel joins, rivets and machining grain.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const c=canvas.getContext('2d');c.fillStyle='#c3c7c8';c.fillRect(0,0,512,512);
    let seed=7183;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<18000;i++){const v=130+Math.floor(rand()*80);c.fillStyle='rgba('+v+','+v+','+v+',.2)';c.fillRect(rand()*512,rand()*512,1+rand()*5,.7);}
    for(let y=0;y<512;y+=128)for(let x=0;x<512;x+=128){
      c.strokeStyle='#485963';c.lineWidth=3;c.strokeRect(x+4,y+4,120,120);
      c.strokeStyle='#e4e6e2';c.lineWidth=1;c.strokeRect(x+8,y+8,112,112);
      for(const [dx,dy]of [[15,15],[113,15],[15,113],[113,113]]){c.fillStyle='#344752';c.fillRect(x+dx,y+dy,3,3);}
      c.fillStyle='#65727a';for(let j=0;j<7;j++)c.fillRect(x+72+j*5,y+80,2,25);
      c.fillStyle='#d9ddd9';c.fillRect(x+19,y+31,32,3);c.fillRect(x+19,y+38,19,2);
      c.strokeStyle='#829299';c.beginPath();c.moveTo(x+19,y+91);c.lineTo(x+42,y+67);c.lineTo(x+63,y+67);c.stroke();
    }
    this.armorTexture=new THREE.CanvasTexture(canvas);this.armorTexture.wrapS=this.armorTexture.wrapT=THREE.RepeatWrapping;this.armorTexture.colorSpace=THREE.SRGBColorSpace;
    this.armorTexture.anisotropy=4;
  }
  finishMaterial(color){return this.mat(color);}
  mat(color,glow=false,glass=false){
    const key='alloy-'+color+'/'+glow+'/'+glass;
    if(!this.materials.has(key))this.materials.set(key,glow?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshStandardMaterial({color,metalness:glass?.64:.58,roughness:glass?.24:.66,map:glass?null:this.armorTexture,bumpMap:glass?null:this.armorTexture,bumpScale:.005,envMapIntensity:.52}));
    return this.materials.get(key);
  }
  contour(group){
    super.contour(group);
    for(const [i,hull]of group.children.filter(m=>m.name==='contrast-contour').entries()){
      const key='alloy-contour-'+i;let material=this.materials.get(key);
      if(!material){const width=i?.0025:.013;material=new THREE.MeshBasicMaterial({color:i?0xc5d0c9:0x111827,side:THREE.BackSide,toneMapped:false});material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed = position + normalize(normal) * '+width.toFixed(4)+';');};material.customProgramCacheKey=()=>key;this.materials.set(key,material);}
      hull.material=material;
    }
  }
  armor(g,points,color,depth=.08,z=0){
    const m=this.plate(g,points,color,depth,z);m.name='armor';return m;
  }
  facet(g,points,color,depth=.08,z=0){
    this.armor(g,points,color,depth,z);
    const cx=points.reduce((n,p)=>n+p[0],0)/points.length,cy=points.reduce((n,p)=>n+p[1],0)/points.length;
    const area=points.reduce((n,p,i)=>n+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0);
    const pos=[],uv=[];for(let i=0;i<points.length;i++){const a=points[area<0?(i+1)%points.length:i],b=points[area<0?i:(i+1)%points.length];for(const [x,y,zz] of [[a[0],a[1],z+depth*.51],[b[0],b[1],z+depth*.51],[cx,cy,z+depth*1.35]]){pos.push(x,y,zz);uv.push(x,y);}}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return this.part(g,geometry,color);
  }
  rail(g,points,color,width=.012,z=.12,glow=false){
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];this.part(g,this.box,color,[(a[0]+b[0])/2,(a[1]+b[1])/2,z],[Math.hypot(dx,dy),width,width],[0,0,Math.atan2(dy,dx)],glow);}
  }
  vents(g,x,y,count=5,size=.06,z=.14,rotation=0){
    const h=new THREE.Group();h.position.set(x,y,z);h.rotation.z=rotation;
    this.part(h,this.box,C.ink,[0,0,0],[count*.032+.025,size+.025,.025]);
    for(let i=0;i<count;i++)this.part(h,this.box,C.edge,[(i-(count-1)/2)*.032,0,.017],[.012,size,.012],[0,.15,0]);
    this.merge(h);for(const m of [...h.children]){m.applyMatrix4(h.matrix.makeRotationZ(rotation));m.position.add(new THREE.Vector3(x,y,z));g.add(m);}
  }
  socket(g,x,y,r,id){
    const node=new THREE.Group();node.name='weakpoint-'+id;node.position.set(x,y,.18);
    const body=new THREE.Group();body.name='module-armor';node.add(body);
    const points=[[-.78,-.65],[.35,-.83],[.85,-.35],[.85,.35],[.35,.83],[-.78,.65],[-1,0]].map(([a,b])=>[a*r,b*r]);
    this.armor(body,points,C.ink,r*.55,0);
    for(const side of [-1,1]){
      this.armor(body,[[-r*.82,side*r*.29],[-r*.6,side*r*.65],[r*.43,side*r*.65],[r*.76,side*r*.30]],C.edge,r*.18,r*.3);
      this.rail(body,[[-r*.6,side*r*.5],[r*.36,side*r*.5]],C.hot,r*.06,r*.43,true);
    }
    for(let j=0;j<3;j++)this.part(body,this.box,C.gold,[r*.54,-r*.3+j*r*.3,r*.36],[r*.15,r*.10,r*.15]);
    this.part(body,this.box,C.ink,[-r*.13,0,r*.43],[r*1.08,r*.43,r*.045]);
    // Recessed energy cell behind a dark slotted mechanical grille, never a flat lamp panel.
    for(let i=0;i<4;i++)this.part(body,this.box,C.steel,[-r*.5+i*r*.25,0,r*.55],[r*.08,r*.43,r*.10],[0,.2,0]);
    for(const side of [-1,1])this.part(body,this.box,C.ink,[-r*.13,side*r*.18,r*.53],[r*1.05,r*.075,r*.065]);
    this.part(body,this.box,0xffeee0,[-r*.12,-r*.12,r*.57],[r*.66,r*.036,r*.025],[0,0,0],true);
    this.merge(body);
    const core=this.part(node,this.box,0xff9a50,[-r*.13,0,r*.49],[r*.93,r*.30,r*.06],[0,0,0],true);core.name='weak-core';
    const marker=new THREE.Group();marker.name='target-marker';
    for(let i=0;i<4;i++){const a=i*Math.PI/2;this.part(marker,new THREE.TorusGeometry(r*1.12,r*.045,3,12,Math.PI*.30),0x8efce2,[0,0,r*.62],[1,1,1],[0,0,a+.14],true);}
    node.add(marker);
    for(let i=0;i<4;i++){const tick=this.part(node,this.box,0x8efce2,[(i-1.5)*r*.38,-r*1.3,r*.62],[r*.27,r*.10,r*.06],[0,0,0],true);tick.name='integrity-'+i;}
    const wreck=new THREE.Group();wreck.name='socket-'+id;wreck.position.set(x,y,.12);wreck.visible=false;
    this.armor(wreck,points,C.ink,r*.30,0);
    this.part(wreck,new THREE.CircleGeometry(r*.78,12),0x070b10,[0,0,r*.19],[1,1,1],[0,0,0],true);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;this.part(wreck,this.box,C.steel,[Math.cos(a)*r*.86,Math.sin(a)*r*.86,r*.21],[r*.26,r*.35,r*.14],[.2,-.25,a],false);this.part(wreck,this.box,0xb94e27,[Math.cos(a)*r*.65,Math.sin(a)*r*.65,r*.22],[r*.08,r*.22,r*.03],[0,0,a],true);}
    this.merge(wreck);g.add(wreck,node);return node;
  }
  tube(g,points,r,color,glow=false){return this.part(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.min(192,Math.max(24,points.length*2)),r,8,false),color,[0,0,0],[1,1,1],[0,0,0],glow);}
  shell(g,sections,color,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0],glow=false,glass=false){
    const curve=new THREE.CatmullRomCurve3(sections.map(([x,y,z])=>new THREE.Vector3(x,y,z))),positions=[],uvs=[],indices=[],radial=20,longitudinal=sections.length*5;
    for(let i=0;i<=longitudinal;i++){const q=curve.getPoint(i/longitudinal);for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2;positions.push(q.x,Math.cos(a)*Math.max(.002,q.y),Math.sin(a)*Math.max(.002,q.z));uvs.push(i/longitudinal,j/radial);}}
    for(let i=0;i<longitudinal;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();const mesh=this.part(g,geo,color,pos,scale,rot,glow,glass);if(!glow&&!glass)mesh.material=this.finishMaterial(color);return mesh;
  }
  ship(){
    if(this.models.has('sculpt-ship'))return this.models.get('sculpt-ship').clone(true);
    const g=new THREE.Group(),h=new THREE.Group();g.add(h);
    this.armor(h,[[-.49,-.13],[.23,-.1],[.72,0],[.23,.1],[-.49,.13],[-.35,0]],C.ink,.16,0);
    this.facet(h,[[-.32,-.084],[.24,-.065],[.62,0],[.24,.065],[-.32,.084],[-.42,0]],C.white,.065,.105);
    this.armor(h,[[-.14,-.047],[.19,-.036],[.32,0],[.19,.036],[-.14,.047]],0x265968,.045,.213);
    this.rail(h,[[-.12,0],[.22,0]],C.cyan,.012,.243,true);
    for(const side of [-1,1]){
      this.armor(h,[[-.42,side*.09],[.18,side*.12],[.02,side*.24],[-.44,side*.45],[-.59,side*.39],[-.24,side*.19]],C.edge,.075,-.04);
      this.armor(h,[[-.39,side*.17],[-.03,side*.17],[-.37,side*.34],[-.49,side*.33]],C.ink,.035,.02);
      this.armor(h,[[-.46,side*.32],[-.29,side*.28],[-.39,side*.39],[-.53,side*.37]],C.white,.04,.055);
      this.rail(h,[[-.44,side*.3],[-.16,side*.18],[.15,side*.13]],C.cyan,.011,.075,true);
      this.armor(h,[[-.57,side*.15],[-.18,side*.15],[.20,side*.21],[-.18,side*.27],[-.57,side*.27]],C.steel,.13,-.02);
      this.vents(h,-.34,side*.21,5,.065,.055);
      this.part(h,this.box,C.ink,[-.58,side*.21,0],[.09,.15,.12]);
      this.part(h,this.box,C.cyan,[-.629,side*.21,0],[.009,.092,.066],[0,0,0],true);
      this.part(h,this.box,C.gold,[.18,side*.105,.04],[.23,.029,.03]);
      this.part(h,this.box,C.cyan,[.31,side*.105,.045],[.048,.014,.014],[0,0,0],true);
      this.vents(h,-.25,side*.092,4,.035,.209);
      const jet=this.glow(C.cyan);jet.position.set(-.8,side*.21,0);jet.scale.set(.56,.12,1);jet.name='jet'+side;g.add(jet);
      const engine=this.part(g,this.box,0xe0ffff,[-.70,side*.21,0],[.16,.025,.025],[0,0,0],true);engine.name='engine'+side;
    }
    this.merge(h);this.contour(h);this.models.set('sculpt-ship',g);return g.clone(true);
  }
  enemy(type,r){
    const key='sculpt-'+type+'/'+r;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),h=new THREE.Group(),limbs=new THREE.Group();limbs.name='limbs';g.add(h,limbs);
    const color={drone:0x78908c,dart:0xaa5b48,weaver:0x807798,sentinel:0x698393,carrier:0xa28a63}[type]||C.edge;
    const energy=type==='weaver'?0xdb8aca:C.hot;
    // Combat silhouettes read as five distinct machines even without their color accents.
    if(type==='carrier'){
      this.armor(h,[[-.39,-.17],[-.22,-.30],[.30,-.30],[.49,-.17],[.49,.17],[.30,.30],[-.22,.30],[-.39,.17]],C.ink,.25,0);
      for(const side of [-1,1]){
        this.facet(h,[[-.32,side*.12],[.25,side*.12],[.42,side*.25],[.22,side*.37],[-.21,side*.37],[-.42,side*.26]],color,.08,.15);
        this.vents(h,.04,side*.26,8,.095,.279);
        this.rail(h,[[-.30,side*.18],[.18,side*.18],[.3,side*.25]],C.hot,.012,.28,true);
        for(let j=0;j<3;j++)this.part(h,this.box,C.ink,[-.28+j*.19,side*.39,.02],[.13,.10,.18]);
      }
      this.armor(h,[[-.45,-.09],[.28,-.09],[.40,0],[.28,.09],[-.45,.09]],C.steel,.055,.185);
    }else if(type==='sentinel'){
      this.armor(h,[[-.34,-.18],[.24,-.22],[.4,0],[.24,.22],[-.34,.18],[-.45,0]],C.ink,.22,0);
      for(const side of [-1,1]){
        this.facet(h,[[-.41,side*.13],[-.17,side*.18],[.12,side*.14],[.32,side*.34],[.12,side*.48],[-.33,side*.4]],color,.16,.02);
        this.armor(h,[[-.32,side*.21],[-.06,side*.24],[.11,side*.38],[-.25,side*.34]],C.ink,.03,.252);
        this.vents(h,-.12,side*.295,5,.065,.286,side*.18);
        this.part(h,this.box,C.steel,[-.31,side*.12,.14],[.40,.08,.10]);
        this.part(h,this.box,energy,[-.52,side*.12,.15],[.015,.055,.04],[0,0,0],true);
        this.rail(h,[[.20,side*.21],[.26,side*.34],[.13,side*.41]],energy,.012,.277,true);
      }
    }else if(type==='weaver'){
      this.armor(h,[[-.40,0],[-.17,-.15],[.15,-.12],[.28,0],[.15,.12],[-.17,.15]],C.ink,.19,0);
      this.facet(h,[[-.30,0],[-.10,-.095],[.12,-.07],[.19,0],[.12,.07],[-.10,.095]],color,.075,.125);
      for(const side of [-1,1])for(let i=0;i<3;i++){
        const limb=new THREE.Group();limb.name='fin';limb.userData.side=side;limb.userData.phase=i;
        const x=.02+i*.075,y=side*(.12+i*.07);
        this.armor(limb,[[x-.09,y],[x+.13,y+side*.04],[x+.36,y+side*.19],[x+.21,y+side*.22],[x-.04,y+side*.09]],i===1?color:C.steel,.05,-i*.04);
        this.rail(limb,[[x+.02,y+side*.05],[x+.25,y+side*.16]],energy,.011,.034-i*.04,true);
        this.part(limb,this.box,C.gold,[x+.10,y+side*.06,.02-i*.04],[.032,.06,.028]);
        limbs.add(this.merge(limb));
      }
    }else{
      const dart=type==='dart';
      this.armor(h,dart?[[-.88,0],[-.12,-.095],[.30,-.07],[.39,0],[.30,.07],[-.12,.095]]:[[-.55,0],[-.17,-.16],[.21,-.13],[.35,0],[.21,.13],[-.17,.16]],C.ink,.16,0);
      if(dart)for(const side of [-1,1]){
        this.part(h,this.box,C.ink,[-.49,side*.083,.02],[.63,.038,.065]);
        this.part(h,this.box,C.gold,[-.75,side*.083,.02],[.15,.046,.05]);
        this.rail(h,[[-.66,side*.083],[-.21,side*.083]],C.hot,.009,.062,true);
        this.part(h,this.box,C.steel,[.36,side*.15,-.04],[.33,.075,.10]);
        this.part(h,this.box,C.hot,[.535,side*.15,-.04],[.009,.048,.055],[0,0,0],true);
      }
      this.facet(h,dart?[[-.76,0],[-.10,-.062],[.27,-.04],[.34,0],[.27,.04],[-.10,.062]]:[[-.49,0],[-.10,-.10],[.23,-.06],[.29,0],[.23,.06],[-.10,.10]],color,.065,.105);
      for(const side of [-1,1]){
        this.armor(h,dart?[[.02,side*.08],[.34,side*.1],[.60,side*.24],[.44,side*.22],[-.12,side*.12]]:[[-.28,side*.12],[.12,side*.16],[.35,side*.32],[.2,side*.36],[-.19,side*.23]],dart?C.steel:color,.07,-.025);
        this.armor(h,[[.02,side*.18],[.18,side*.2],[.28,side*.3],[.16,side*.28]],C.ink,.023,.024);
        this.rail(h,[[-.31,side*.055],[-.04,side*.082],[.15,side*.05]],energy,.013,.215,true);
        this.vents(h,.14,side*.17,3,.045,.08,side*.2);
      }
    }
    this.part(h,this.box,C.ink,[-.07,0,.245],[.19,.13,.035]);
    this.part(h,this.box,C.edge,[-.06,0,.262],[.15,.085,.015]);
    for(const x of [-.105,-.07,-.035])this.part(h,this.box,C.ink,[x,0,.295],[.009,.04,.018]);
    this.part(h,this.box,0xffe8d5,[-.08,-.014,.294],[.065,.005,.012],[0,0,0],true);
    this.merge(h);this.contour(h);
    const core=this.part(g,this.box,energy,[-.08,0,.278],[.10,.033,.022],[0,0,0],true);core.name='core';
    const jet=this.glow(energy);jet.name='jet';jet.position.set(.48,0,-.03);jet.scale.set(.35,.09,1);g.add(jet);
    g.scale.setScalar(r/.24);this.models.set(key,g);return g.clone(true);
  }
  boss(type,r){
    const key='sculpt-'+type+'/'+r;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),h=new THREE.Group(),machine=new THREE.Group();machine.name='machinery';g.add(h,machine);
    if(type==='gatekeeper'){
      this.armor(h,[[-r*.85,-r*.30],[r*.05,-r*.69],[r*1.6,-r*.49],[r*2.2,-r*.18],[r*2.2,r*.18],[r*1.6,r*.49],[r*.05,r*.69],[-r*.85,r*.30]],C.ink,.38,-.12);
      for(const side of [-1,1]){
        this.facet(h,[[0,side*r*.32],[r*.55,side*r*.26],[r*1.8,side*r*.32],[r*1.5,side*r*.56],[r*.22,side*r*.61]],C.edge,.12,.12);
        this.armor(h,[[r*.22,side*r*.39],[r*1.4,side*r*.34],[r*1.15,side*r*.49],[r*.3,side*r*.51]],C.steel,.04,.3);
        this.vents(h,r*.85,side*r*.43,11,.11,.341,side*-.06);
        this.rail(h,[[r*.10,side*r*.28],[r*1.1,side*r*.24],[r*1.8,side*r*.31]],C.hot,.017,.328,true);
        const claw=new THREE.Group();claw.name='claw';claw.userData.side=side;
        this.armor(claw,[[r*.6,side*r*.40],[-r*.1,side*r*.85],[-r*1.45,side*r*1.1],[-r*1.84,side*r*.55],[-r*1.54,side*r*.45],[-r*1.13,side*r*.72],[r*.3,side*r*.35]],C.steel,.17,-.14);
        this.armor(claw,[[-r*.2,side*r*.74],[-r*1.35,side*r*.98],[-r*1.6,side*r*.62],[-r*1.15,side*r*.81]],C.edge,.05,-.019);
        this.rail(claw,[[-r*.23,side*r*.63],[-r*1.07,side*r*.84],[-r*1.52,side*r*.58]],C.hot,.012,.04,true);
        for(let j=0;j<4;j++)this.part(claw,this.box,C.ink,[-r*(.24+j*.26),side*r*(.65+j*.05),.055],[.055,.12,.04],[0,0,side*.18]);
        this.part(claw,this.box,C.ink,[-r*1.6,side*r*.6,-.07],[.32,.12,.11]);this.part(claw,this.box,0xffc19a,[-r*1.85,side*r*.6,-.07],[.035,.075,.05],[0,0,0],true);
        machine.add(this.merge(claw));
        this.armor(h,[[r*1.18,side*r*.55],[r*1.65,side*r*.55],[r*2.05,side*r*.7],[r*1.35,side*r*.76]],C.ink,.21,-.15);
        const jet=this.glow(C.hot);jet.position.set(r*2.22,side*r*.64,-.13);jet.scale.set(.85,.2,1);g.add(jet);
      }

    }else{
      // Cathedral: a vertical siege bastion with four segmented outriggers and a deep rear reactor.
      this.armor(h,[[-r*.57,-r*.92],[r*.16,-r*1.18],[r*.78,-r*.7],[r*1.1,0],[r*.78,r*.7],[r*.16,r*1.18],[-r*.57,r*.92],[-r*.85,0]],C.ink,.54,-.3);
      for(const side of [-1,1]){
        this.facet(h,[[-r*.40,side*r*.35],[r*.31,side*r*.3],[r*.66,side*r*.76],[r*.12,side*r*1.25],[-r*.33,side*r*1.07]],C.edge,.14,.035);
        this.armor(h,[[-r*.24,side*r*.5],[r*.21,side*r*.45],[r*.40,side*r*.76],[r*.10,side*r*1.04],[-r*.21,side*r*.96]],C.steel,.06,.245);
        this.vents(h,r*.06,side*r*.75,8,.21,.303);
        this.rail(h,[[-r*.35,side*r*.39],[-r*.30,side*r*.92],[r*.06,side*r*1.15]],C.hot,.018,.291,true);
        this.armor(h,[[r*.32,side*r*.32],[r*.8,side*r*.43],[r*1.0,side*r*1.45],[r*.73,side*r*1.8],[r*.51,side*r*1.27]],C.steel,.22,-.39);
        for(let j=0;j<3;j++)this.armor(h,[[r*.60,side*r*(.63+j*.26)],[r*.87,side*r*(.76+j*.26)],[r*.91,side*r*(.94+j*.26)],[r*.67,side*r*(.83+j*.26)]],C.edge,.08,-.23);
      }
      for(let i=0;i<4;i++){
        const side=i<2?1:-1,outer=i%2,arm=new THREE.Group();arm.name='petal';arm.userData.phase=i;arm.rotation.z=side*(outer?.16:-.12);
        const x=outer?.33:-.34;
        this.armor(arm,[[x,side*r*.65],[x+.26,side*r*.94],[x+.39,side*r*1.98],[x+.15,side*r*2.36],[x-.11,side*r*1.72],[x-.16,side*r*.84]],C.ink,.20,-.57);
        this.facet(arm,[[x+.02,side*r*.96],[x+.23,side*r*1.08],[x+.29,side*r*1.95],[x+.15,side*r*2.18],[x,side*r*1.65]],outer?C.copper:C.edge,.10,-.42);
        this.rail(arm,[[x+.10,side*r*1.02],[x+.14,side*r*1.71],[x+.20,side*r*2.02]],C.hot,.013,-.269,true);
        for(let j=0;j<5;j++)this.part(arm,this.box,C.ink,[x+.13,side*r*(1.1+j*.16),-.26],[.16,.024,.021]);
        machine.add(this.merge(arm));
      }
      // Faceted reactor tunnel gives real parallax through the open armored front.
      for(let j=0;j<5;j++){
        const ring=new THREE.Group();ring.rotation.z=Math.PI/8;
        this.part(ring,new THREE.TorusGeometry(r*(.5-j*.045),.05,4,8),j%2?C.edge:C.ink,[0,0,-.5-j*.3]);
        this.merge(ring);h.add(ring);
      }
      const turbine=new THREE.Group();turbine.name='turbine';
      for(let i=0;i<16;i++){const a=i/16*Math.PI*2;this.part(turbine,this.box,i%2?C.steel:C.gold,[Math.cos(a)*r*.49,Math.sin(a)*r*.49,-.4],[.055,.19,.055],[0,0,a+.4]);}machine.add(this.merge(turbine));
      const iris=new THREE.Group();iris.name='iris';for(let i=0;i<6;i++){const a=i/6*Math.PI*2,leaf=new THREE.Group();leaf.rotation.z=a;this.armor(leaf,[[r*.18,-.06],[r*.42,-.11],[r*.53,.07],[r*.28,.11]],C.edge,.065,.08);iris.add(this.merge(leaf));}machine.add(iris);

    }
    for(const part of BOSS_PART_LAYOUTS[type]||[]){
      const side=Math.sign(part.y),x=part.x,y=part.y;
      // Each target is physically bolted into a reinforced spine; no floating UI-like nodes.
      this.facet(h,[[x+.03,y-side*.06],[x+.31,y+side*.05],[x+.48,y-side*.22],[r*.42,y*.53],[r*.22,y*.51],[x+.25,y-side*.17]],C.steel,.14,-.17);
      this.rail(h,[[r*.30,y*.53],[x+.35,y-side*.25],[x+.17,y-side*.02]],C.ink,.065,-.01);
      this.rail(h,[[r*.30,y*.53],[x+.35,y-side*.25],[x+.17,y-side*.02]],C.gold,.016,.035);
      for(const [bx,by] of [[x+.27,y-side*.14],[r*.30,y*.56]]){
        this.part(h,this.box,C.ink,[bx,by,.055],[.072,.072,.036],[0,0,Math.PI/4]);
        this.part(h,this.box,C.edge,[bx,by,.078],[.037,.037,.02],[0,0,Math.PI/4]);
      }
      this.socket(g,x,y,part.r,part.id);
    }
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const x=r*(.2+i*.18),y=side*r*(type==='gatekeeper'?.48:.54+i*.18);
      this.part(h,this.box,C.ink,[x,y,.24],[.042,.042,.02],[0,0,Math.PI/4]);
      this.part(h,this.box,C.edge,[x,y,.255],[.018,.018,.015],[0,0,Math.PI/4]);
    }
    const frame=[[-r*.46,-r*.20],[-r*.23,-r*.41],[r*.24,-r*.41],[r*.47,-r*.2],[r*.47,r*.2],[r*.24,r*.41],[-r*.23,r*.41],[-r*.46,r*.2]];
    this.armor(h,frame,C.ink,.20,.13);
    for(const side of [-1,1])this.rail(h,[[-r*.37,side*r*.17],[-r*.19,side*r*.31],[r*.22,side*r*.31],[r*.37,side*r*.17]],C.gold,.023,.26);
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2,x=Math.cos(a)*r*.30,y=Math.sin(a)*r*.30;
      this.part(h,this.box,C.steel,[x,y,.3],[r*.15,r*.13,.12],[0,.22,a]);
      this.part(h,this.box,C.edge,[x*1.12,y*1.12,.35],[r*.10,r*.07,.07],[0,0,a]);
      this.part(h,this.box,C.hot,[x*.88,y*.88,.37],[r*.075,r*.024,.018],[0,0,a],true);
    }
    for(const side of [-1,1]){
      this.part(h,this.box,C.ink,[side*r*.14,0,.42],[r*.05,r*.37,.06]);
      this.part(h,this.box,C.gold,[side*r*.20,0,.41],[r*.035,r*.31,.025]);
    }
    this.part(h,this.box,0xffead6,[0,-r*.085,.45],[r*.18,r*.024,.019],[0,0,0],true);
    this.merge(h);
    const cr=BOSS_CORE_RADIUS[type],core=this.part(g,new THREE.CylinderGeometry(1,1,1,12),0xffb782,[0,0,.49],[cr,.08,cr],[Math.PI/2,0,0],true);core.name='core';
    const shutter=new THREE.Group();shutter.name='core-shutter';
    for(const side of [-1,1]){const leaf=new THREE.Group();leaf.userData.side=side;leaf.position.y=side*cr*.52;this.armor(leaf,[[-cr*1.16,-cr*.52],[cr*1.16,-cr*.52],[cr*1.16,cr*.52],[-cr*1.16,cr*.52]],C.steel,.08,.58);this.part(leaf,this.box,C.ink,[0,0,.68],[cr*1.9,cr*.15,.025]);this.part(leaf,this.box,0xffa355,[0,0,.70],[cr*.62,cr*.12,.02],[0,0,0],true);shutter.add(this.merge(leaf));}
    g.add(shutter);
    const aim=new THREE.Group();aim.name='core-target';for(let i=0;i<4;i++)this.part(aim,new THREE.TorusGeometry(cr*1.18,.014,3,12,Math.PI*.32),0x8efce2,[0,0,.73],[1,1,1],[0,0,i*Math.PI/2],true);g.add(aim);
    this.models.set(key,g);return g.clone(true);
  }
  setpiece(name){
    const key='setpiece-'+name;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),h=new THREE.Group();g.add(h);
    if(name==='LEVIATHAN'){
      this.shell(h,[[-4.8,.01,.01],[-3.1,.54,.40],[-.6,.48,.35],[2.1,.32,.26],[4.4,.01,.01]],C.ink);
      for(let i=0;i<10;i++){const x=-3+i*.65,rr=.62-Math.abs(x)*.06;const rib=this.part(h,new THREE.TorusGeometry(rr,.06,7,24,Math.PI*1.7),i%3?C.steel:C.copper,[x,0,0],[1,1,1],[0,Math.PI/2,i*.13]);}
      for(const side of [-1,1]){this.tube(h,[[-4,side*.15,0],[-2.5,side*.53,.18],[.7,side*.43,.15],[3.8,side*.13,0]],.033,C.gold);for(let i=0;i<4;i++){this.shell(h,[[-.5,.001,.001],[-.1,.20,.10],[.55,.12,.09],[.9,.001,.001]],C.copper,[-2.2+i*1.25,side*.41,.26],[1,1,1],[0,side*.12,side*-.16]);this.part(h,this.box,0xffb268,[-2.8+i*1.3,side*.32,.32],[.035,.055,.025],[0,0,0],true);}}
      this.merge(h);
    }else if(name==='THE PROCESSION'){
      for(let i=0;i<3;i++){const forge=new THREE.Group();forge.name='forge';forge.userData.index=i;forge.position.set((i-1)*2.8,Math.sin(i*1.6)*1.6,-i*.3);
        this.part(forge,this.sphere,C.ink,[0,0,0],[.65,.65,.65]);this.ring(forge,.82,.10,C.copper);this.ring(forge,.86,.015,0xffc474,.06,true);
        const cage=new THREE.Group();cage.name='cage';cage.rotation.x=.65;this.ring(cage,1.13,.047,C.steel);this.ring(cage,1.04,.023,C.gold);for(let j=0;j<8;j++){const a=j/8*Math.PI*2;this.part(cage,this.box,C.copper,[Math.cos(a),Math.sin(a),0],[.13,.29,.18],[0,0,a]);this.part(cage,this.box,0xff9b4c,[Math.cos(a)*1.02,Math.sin(a)*1.02,.12],[.06,.14,.015],[0,0,a],true);}this.merge(cage);forge.add(cage);
        const furnace=this.glow(0xff8a40,2.2);furnace.position.z=.67;forge.add(furnace);g.add(forge);
      }
    }else{
      for(const side of [-1,1]){const points=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*6;points.push([(i/100-.5)*8,Math.sin(a)*1.1*side,Math.cos(a)*1.1*side]);}this.tube(h,points,.07,0x374760);this.tube(h,points.map(([x,y,z])=>[x,y,z+.07]),.022,side<0?0xcc6ee8:0x67bdff,true);
        for(let i=0;i<20;i++){const a=i/20*Math.PI*6,x=(i/20-.5)*8;this.part(h,this.sphere,C.steel,[x,Math.sin(a)*1.1*side,Math.cos(a)*1.1*side],[.11,.11,.11]);if(side===1)this.tube(h,[[x,Math.sin(a)*1.1,Math.cos(a)*1.1],[x,-Math.sin(a)*1.1,-Math.cos(a)*1.1]],.022,C.copper);}
      }this.merge(h);
    }
    this.models.set(key,g);return g.clone(true);
  }
  pickup(kind,color){
    const key='pickup-'+kind;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),body=new THREE.Group();g.add(body);
    this.part(body,this.sphere,C.ink,[0,0,0],[.19,.19,.1]);this.ring(body,.21,.025,C.edge);this.ring(body,.245,.007,color,.02,true);
    const icons={SPREAD:[[0,0],[.075,.07],[.075,-.07]],LANCE:[[-.07,0],[0,0],[.07,0]],ECHO:[[-.05,-.05],[.05,.05]],SHIELD:[[0,.07],[-.06,0],[.06,0],[0,-.07]],BOMB:[[0,0]]};
    for(const [x,y]of (icons[kind]||[]))this.part(body,kind==='LANCE'?this.box:this.sphere,color,[x,y,.105],kind==='LANCE'?[.065,.025,.015]:[.027,.027,.015],[0,0,0],true);
    if(kind==='RING'){this.ring(body,.105,.015,color,.12,true);this.ring(body,.065,.007,C.white,.13,true);}
    if(kind==='VECTOR')for(const side of [-1,1]){this.part(body,this.box,color,[.018,side*.045,.12],[.15,.025,.02],[0,0,side*.62],true);this.part(body,this.sphere,color,[.09,side*.1,.12],[.032,.028,.02],[0,0,0],true);}
    if(kind==='MISSILE')for(const side of [-1,1]){this.part(body,this.box,color,[0,side*.053,.12],[.15,.034,.02],[0,0,0],true);this.part(body,this.sphere,C.white,[.08,side*.053,.12],[.032,.023,.02],[0,0,0],true);}
    this.merge(body);body.name='capsule';const halo=this.glow(color,.75);halo.position.z=-.05;g.add(halo);this.models.set(key,g);return g.clone(true);
  }
}

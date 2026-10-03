import * as THREE from 'three';
import { Art as BaseArt } from './art.js';
const C={white:0xc9d7df,edge:0x849cae,ink:0x101c2b,steel:0x354b63,copper:0x9e5439,gold:0xc99050,cyan:0x50dcff,hot:0xff7642};
// Smooth compound surfaces and a restrained ceramic/graphite/copper material language.
export class Art extends BaseArt {
  finishMaterial(color){
    const key='finish-'+color;if(this.materials.has(key))return this.materials.get(key);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#9a9a9a';c.fillRect(0,0,512,256);
    c.strokeStyle='#656565';c.lineWidth=1;for(const x of [70,188,320,434]){c.beginPath();c.moveTo(x,0);c.lineTo(x,256);c.stroke();for(const y of [18,122,240]){c.fillStyle='#434343';c.fillRect(x+5,y,3,3);}}
    c.fillStyle='#b0b0b0';for(let i=0;i<40;i++)c.fillRect(230+i*2,48,1,9);
    const roughness=new THREE.CanvasTexture(canvas);roughness.wrapS=roughness.wrapT=THREE.RepeatWrapping;
    const m=this.mat(color).clone();m.roughness=Math.max(m.roughness,.35);m.roughnessMap=roughness;m.bumpMap=roughness;m.bumpScale=.002;this.materials.set(key,m);return m;
  }
  mat(color,glow=false,glass=false){
    const key=`${color}/${glow}/${glass}`;
    if(!this.materials.has(key))this.materials.set(key,glow?new THREE.MeshBasicMaterial({color,toneMapped:false}):new THREE.MeshPhysicalMaterial({color,metalness:glass?.7:.48,roughness:glass?.1:color===C.ink?.48:.29,clearcoat:color===C.ink?.25:1,clearcoatRoughness:.18,envMapIntensity:color===C.ink?.32:.65}));return this.materials.get(key);
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
    this.shell(h,[[-.53,.002,.002],[-.38,.14,.1],[-.1,.12,.1],[.22,.085,.06],[.65,.002,.002]],C.ink,[0,0,-.01]);
    this.shell(h,[[-.4,.003,.003],[-.28,.086,.085],[.02,.09,.085],[.32,.06,.035],[.68,.002,.002]],C.white,[0,0,.025]);
    this.shell(h,[[-.12,.003,.003],[-.07,.055,.04],[.08,.055,.045],[.25,.002,.002]],0x164864,[0,0,.107],[1,1,1],[0,0,0],false,true);
    for(const side of [-1,1]){
      this.plate(h,[[-.36,side*.1],[.26,side*.105],[.12,side*.20],[-.38,side*.43],[-.53,side*.35],[-.17,side*.19]],C.white,.075,-.035);
      this.plate(h,[[-.32,side*.17],[.05,side*.17],[-.33,side*.36],[-.44,side*.32]],C.ink,.035,.01);
      this.plate(h,[[-.41,side*.3],[-.29,side*.26],[-.35,side*.36],[-.47,side*.35]],C.hot,.016,.044);
      this.shell(h,[[-.57,.003,.003],[-.49,.064,.064],[-.15,.05,.05],[.16,.028,.028],[.29,.002,.002]],C.steel,[0,side*.21,-.03]);
      for(let j=0;j<4;j++)this.part(h,this.cylinder,j===0?C.gold:C.ink,[-.51+j*.043,side*.21,-.03],[.073,.018,.073],[0,0,Math.PI/2]);
      this.part(h,this.cylinder,C.cyan,[-.529,side*.21,-.03],[.048,.01,.048],[0,0,Math.PI/2],true);
      this.tube(h,[[-.25,side*.135,.075],[.1,side*.115,.07],[.44,side*.055,.028]],.008,C.cyan,true);
      for(let j=0;j<4;j++)this.part(h,this.box,C.ink,[-.29+j*.036,side*.106,.089],[.018,.032,.008]);
      this.part(h,this.box,C.gold,[-.1,side*.19,.042],[.04,.018,.018]);
      const jet=this.glow(C.cyan);jet.position.set(-.8,side*.21,-.03);jet.scale.set(.7,.17,1);jet.name=`jet${side}`;g.add(jet);
      const engine=this.part(g,this.cylinder,0xdbfbff,[-.64,side*.21,-.03],[.018,.23,.018],[0,0,Math.PI/2],true);engine.name=`engine${side}`;
    }
    this.part(h,this.box,C.gold,[-.25,0,.106],[.026,.055,.01]);
    this.merge(h);this.contour(h);this.models.set('sculpt-ship',g);return g.clone(true);
  }
  enemy(type,r){
    const key=`sculpt-${type}/${r}`;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),h=new THREE.Group(),limbs=new THREE.Group();limbs.name='limbs';g.add(h,limbs);
    const palette={drone:0x39505f,dart:0x823b31,weaver:0x483557,sentinel:0x395566,carrier:0x775332};
    if(type==='carrier'){
      this.shell(h,[[-.35,.01,.01],[-.24,.24,.16],[.16,.28,.18],[.42,.07,.1],[.5,.01,.01]],palette[type]);
      for(const side of [-1,1])for(let i=0;i<3;i++){this.shell(h,[[-.25,.01,.01],[-.1,.09,.07],[.21,.07,.06],[.4,.01,.01]],i===1?C.gold:C.ink,[i*.03,side*(.23+i*.045),i*.025]);this.part(h,this.sphere,C.hot,[-.06+i*.13,side*.21,.18],[.027,.027,.027],[0,0,0],true);}
      this.ring(h,.18,.025,C.ink,.19);this.ring(h,.165,.01,C.gold,.21);
    }else if(type==='sentinel'){
      this.shell(h,[[-.4,.01,.01],[-.18,.16,.12],[.25,.19,.15],[.44,.02,.02]],palette[type]);
      for(const side of [-1,1]){this.shell(h,[[-.4,.01,.01],[-.26,.09,.07],[.22,.09,.08],[.4,.01,.01]],C.ink,[0,side*.31,-.02]);this.plate(h,[[-.23,side*.13],[.22,side*.19],[.28,side*.35],[-.10,side*.42],[-.34,side*.27]],C.copper,.07,.035);for(let i=0;i<4;i++)this.part(h,this.box,C.gold,[.03+i*.055,side*.29,.09],[.019,.11,.014]);}
    }else if(type==='weaver'){
      this.shell(h,[[-.36,.002,.002],[-.17,.125,.1],[.05,.13,.13],[.23,.035,.05],[.29,.002,.002]],palette[type]);
      for(const side of [-1,1])for(let i=0;i<3;i++){const limb=new THREE.Group();limb.name='fin';limb.userData.side=side;limb.userData.phase=i;this.tube(limb,[[.05,side*.08,-.03],[.19,side*(.24+i*.05),-.08-i*.04],[.42+i*.05,side*(.26+i*.06),-.15]],.035-i*.007,C.steel);this.shell(limb,[[-.19,.002,.002],[-.10,.052,.025],[.12,.036,.022],[.28,.002,.002]],i===1?0xa2658e:C.copper,[.27+i*.055,side*(.21+i*.045),-.07-i*.025],[1,1,1],[0,0,side*.35]);limbs.add(this.merge(limb));}
    }else{
      this.shell(h,[[-.5,.002,.002],[-.21,.115,.09],[.08,.15,.12],[.26,.07,.09],[.34,.002,.002]],palette[type]);
      for(const side of [-1,1]){this.shell(h,[[-.18,.002,.002],[-.06,.045,.035],[.12,.06,.025],[.32,.002,.002]],type==='dart'?C.copper:C.steel,[.09,side*(type==='dart'?.19:.22),-.02],[1,1,1],[0,0,side*.55]);this.tube(h,[[-.30,side*.06,.085],[-.06,side*.10,.115],[.14,side*.07,.10]],.009,type==='dart'?C.hot:0xffb65a,true);}
    }
    this.ring(h,.09,.02,C.ink,.15);this.ring(h,.075,.008,type==='weaver'?0xdb75da:C.hot,.17,true);this.merge(h);this.contour(h);
    const core=this.part(g,this.sphere,C.hot,[-.045,0,.175],[.055,.055,.025],[0,0,0],true);core.name='core';
    const glow=this.glow(type==='weaver'?0xc55ad6:C.hot,.3);glow.position.set(-.045,0,.18);g.add(glow);
    const jet=this.glow(C.hot);jet.name='jet';jet.position.set(.5,0,-.03);jet.scale.set(.45,.12,1);g.add(jet);
    g.scale.setScalar(r/.24);this.models.set(key,g);return g.clone(true);
  }
  boss(type,r){
    const key=`sculpt-${type}/${r}`;if(this.models.has(key))return this.models.get(key).clone(true);
    const g=new THREE.Group(),h=new THREE.Group(),machine=new THREE.Group();machine.name='machinery';g.add(h,machine);
    if(type==='gatekeeper'){
      this.shell(h,[[-r*.8,.005,.005],[-r*.25,r*.56,r*.30],[r*.95,r*.48,r*.25],[r*1.9,r*.2,r*.12],[r*2.2,.005,.005]],C.ink,[0,0,-.18]);
      for(const side of [-1,1]){
        this.shell(h,[[-.3,.002,.002],[.1,.16,.1],[.8,.13,.11],[1.3,.002,.002]],C.copper,[.1,side*r*.4,.04],[1,1,1],[0,0,side*-.18]);
        this.tube(h,[[r*.25,side*r*.30,.14],[r*.8,side*r*.35,.13],[r*1.5,side*r*.25,.02]],.018,C.gold);
        this.shell(h,[[0,.002,.002],[.15,.12,.12],[.55,.1,.1],[.78,.002,.002]],C.steel,[r*.85,side*r*.60,-.16]);
        const jet=this.glow(C.hot);jet.position.set(r*2.35,side*r*.6,-.16);jet.scale.set(1.3,.32,1);g.add(jet);
        const claw=new THREE.Group();claw.name='claw';claw.userData.side=side;
        this.tube(claw,[[r*.4,side*r*.4,-.2],[-r*.3,side*r*.85,-.1],[-r*1.25,side*r*1.05,.05],[-r*1.75,side*r*.62,.07]],.11,C.ink);
        for(let i=0;i<6;i++){const a=i/5;this.shell(claw,[[-.13,.003,.003],[-.06,.095,.085],[.05,.095,.085],[.16,.003,.003]],i%2?C.copper:C.steel,[-r*(.05+a*1.32),side*r*(.62+Math.sin(a*2.4)*.42),.02],[1,1,1],[0,0,side*-.30]);}
        this.tube(claw,[[r*.1,side*r*.60,.14],[-r*.8,side*r*.95,.18],[-r*1.5,side*r*.66,.18]],.012,C.hot,true);
        this.part(claw,this.cylinder,C.gold,[-r*1.63,side*r*.64,.04],[.085,.32,.085],[0,0,Math.PI/2]);this.merge(claw);machine.add(claw);
      }
      this.ring(h,r*.60,.07,C.steel,.04);this.ring(h,r*.52,.021,C.gold,.09);
    }else{
      for(let i=0;i<6;i++){const z=-.55-i*.31,rr=r*(.6-i*.065);this.ring(h,rr,.065,i%2?C.ink:C.steel,z);this.ring(h,rr+.01,.008,C.hot,z+.03,true);}
      for(let i=0;i<6;i++){const a=i/6*Math.PI*2;this.tube(h,[[Math.cos(a)*r*.5,Math.sin(a)*r*.5,-.4],[Math.cos(a+.25)*r*.47,Math.sin(a+.25)*r*.47,-1.15],[Math.cos(a+.5)*r*.25,Math.sin(a+.5)*r*.25,-2.2]],.028,C.copper);}
      this.part(h,new THREE.TorusGeometry(r*.68,r*.25,16,64),C.ink,[0,0,-.25]);
      this.ring(h,r*.72,.032,C.gold,.1);this.ring(h,r*.62,.04,C.steel,.15);
      for(let i=0;i<10;i++){
        const a=i/10*Math.PI*2,arm=new THREE.Group();arm.name='petal';arm.rotation.z=a;arm.userData.phase=a;
        this.tube(arm,[[r*.65,0,-.35],[r*1.15,-.2,-.7],[r*1.75,-.08,-.52],[r*2.1,.17,-.20]],.11,C.ink);
        this.shell(arm,[[-r*.1,.002,.002],[r*.2,.21,.12],[r*.66,.28,.17],[r*1.16,.15,.1],[r*1.4,.002,.002]],i%2?C.steel:C.copper,[r*.78,0,-.28],[1,1,1],[0,-.1,.06]);
        this.shell(arm,[[0,.002,.002],[.15,.1,.09],[.6,.12,.1],[.9,.002,.002]],C.ink,[r*1.1,.01,-.1],[1,1,1],[0,0,.05]);
        this.tube(arm,[[r*.88,-.06,.05],[r*1.32,-.1,.09],[r*1.87,.04,-.03]],.014,i%2?0xffae6b:0xff693f,true);
        for(let j=0;j<4;j++)this.part(arm,this.box,C.gold,[r*(1.04+j*.13),-.095,-.015],[.025,.1,.018],[0,0,.08]);
        this.tube(arm,[[r*.67,.05,-.4],[r*.97,.2,-.83],[r*1.51,.16,-.83],[r*1.83,.1,-.5]],.037,C.copper);
        this.merge(arm);machine.add(arm);
      }
      const turbine=new THREE.Group();turbine.name='turbine';this.ring(turbine,r*1.54,.09,C.steel,-.85);this.ring(turbine,r*1.55,.014,C.hot,-.73,true);
      for(let i=0;i<32;i++){const a=i/32*Math.PI*2;this.part(turbine,this.box,i%2?C.ink:C.gold,[Math.cos(a)*r*1.48,Math.sin(a)*r*1.48,-.84],[.08,.27,.13],[.2,0,a+.35]);}machine.add(this.merge(turbine));
      const iris=new THREE.Group();iris.name='iris';for(let i=0;i<12;i++){const a=i/12*Math.PI*2,leaf=new THREE.Group();leaf.rotation.z=a;this.plate(leaf,[[r*.22,-.02],[r*.51,-.13],[r*.67,.07],[r*.39,.16]],i%2?C.steel:C.gold,.1,.2);iris.add(this.merge(leaf));}machine.add(iris);
    }
    this.part(h,this.sphere,0x94352c,[0,0,.13],[r*.46,r*.46,r*.2]);this.ring(h,r*.43,.016,C.hot,.26,true);this.merge(h);
    const core=this.part(g,this.sphere,0xffb77b,[0,0,.27],[r*.23,r*.23,r*.1],[0,0,0],true);core.name='core';const energy=this.glow(C.hot,r*1.7);energy.position.z=.33;g.add(energy);
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
    const g=new THREE.Group(),body=new THREE.Group();g.add(body);
    this.part(body,this.sphere,C.ink,[0,0,0],[.19,.19,.1]);this.ring(body,.21,.025,C.edge);this.ring(body,.245,.007,color,.02,true);
    const icons={SPREAD:[[0,0],[.075,.07],[.075,-.07]],LANCE:[[-.07,0],[0,0],[.07,0]],ECHO:[[-.05,-.05],[.05,.05]],SHIELD:[[0,.07],[-.06,0],[.06,0],[0,-.07]],BOMB:[[0,0]]};
    for(const [x,y]of icons[kind])this.part(body,kind==='LANCE'?this.box:this.sphere,color,[x,y,.105],kind==='LANCE'?[.065,.025,.015]:[.027,.027,.015],[0,0,0],true);
    this.merge(body);body.name='capsule';const halo=this.glow(color,.75);halo.position.z=-.05;g.add(halo);return g;
  }
}

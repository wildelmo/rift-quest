import * as THREE from 'three';

// Each target owns its damage uniforms/materials. Hits must never flash an entire formation.
export function prepareDamageMaterials(object){
  const copies=new Map();object.traverse(mesh=>{if(!mesh.isMesh)return;if(mesh.material?.userData.reactor){const source=mesh.material;mesh.material=createReactorMaterial(source.userData.axis);mesh.material.userData.reactorUniforms.time.value=source.userData.reactorUniforms.time.value;return;}if(!mesh.material?.isMeshStandardMaterial)return;const source=mesh.material;if(!copies.has(source)){const material=source.clone();material.userData={damageOwned:true,baseColor:source.color.toArray()};copies.set(source,material);}mesh.material=copies.get(source);});
  object.userData.damageMaterials=[...copies.values()];
}
export function updateDamageMaterials(object,enemy){
  const damage=1-Math.max(0,enemy.hp/(enemy.maxHp||enemy.initialHp||enemy.hp));
  for(const material of object.userData.damageMaterials||[]){material.color.fromArray(material.userData.baseColor).multiplyScalar(1-damage*.24);material.emissive.setRGB(1,.72,.40);const base=material.userData.baseColor,recess=Math.max(...base)<.055?.16:1;material.emissiveIntensity=enemy.flash>0?Math.pow(Math.min(1,enemy.flash/.11),3)*(enemy.maxHp?.23:.65)*recess:0;}
}
export function createBlast(plane){
  return new THREE.Mesh(plane,new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,uniforms:{age:{value:0}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
    varying vec2 uv0;uniform float age;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 p=(uv0-.5)*2.0;float r=length(p),a=atan(p.y,p.x);float n=noise(p*7.0-age*2.0)*.62+noise(p*17.0+age*3.0)*.26+noise(p*35.0)*.12;
      float edge=.70+.10*sin(a*7.0+1.0)+.10*(n-.5);float mask=1.0-smoothstep(edge-.10,edge,r);
      float heat=clamp((1.0-r)*1.65+n*.55-age*1.55,0.0,1.0);vec3 color=mix(vec3(.035,.055,.075),vec3(.66,.12,.018),smoothstep(.15,.40,heat));color=mix(color,vec3(1.0,.55,.08),smoothstep(.4,.72,heat));color=mix(color,vec3(1.0,.97,.79),smoothstep(.72,.97,heat));
      float alpha=mask*(1.0-smoothstep(.55,1.0,age));if(alpha<.01)discard;gl_FragColor=vec4(color,alpha*.96);
    }` }));
}

export function createReactorMaterial(axis='xz'){
  const material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  const uniforms={time:{value:0},hit:{value:0}};
  material.userData={damageOwned:true,reactor:true,axis,reactorUniforms:uniforms};
  material.onBeforeCompile=shader=>{
    shader.uniforms.reactorTime=uniforms.time;shader.uniforms.reactorHit=uniforms.hit;
    shader.vertexShader='varying vec2 reactorP;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nreactorP=position.${axis}*${axis==='xz'?'1.0':'2.0'};`);
    shader.fragmentShader='varying vec2 reactorP;uniform float reactorTime;uniform float reactorHit;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=reactorP;float r=length(p);float angle=atan(p.y,p.x);float t=reactorTime;
      float wave=sin(angle*3.0+r*13.0-t*2.9)*.08+sin(angle*7.0-r*17.0+t*1.7)*.035;
      float filament=exp(-abs(r-.50-wave)*55.0)+exp(-abs(r-.24-sin(angle*4.0+t*3.0)*.05)*65.0)*.8;
      float heart=exp(-r*r*35.0)*(.75+.25*sin(t*7.0));float edge=1.0-smoothstep(.80,1.02,r);
      vec3 energy=mix(vec3(.018,.025,.032),vec3(.86,.18,.025),edge*(.17+filament*.6));
      energy=mix(energy,vec3(1.0,.93,.65),clamp(filament*.95+heart,0.0,1.0)*edge);
      diffuseColor.rgb=mix(energy,vec3(1.0,.97,.84),reactorHit*.65*edge);
    `);
  };
  material.customProgramCacheKey=()=> 'rift-reactor-'+axis;
  return material;
}

// One bounded plume per destroyed socket, behind hostile bullets in render order.
export function createSocketSmoke(plane,seed){
 return new THREE.Mesh(plane,new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,uniforms:{time:{value:0},seed:{value:seed}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
 varying vec2 uv0;uniform float time;uniform float seed;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){float y=uv0.y;float x=(uv0.x-.5)*2.0+sin(y*7.0-time*1.1+seed)*y*.22;float width=.12+y*.60;float n=noise(vec2(x*8.0,y*6.0-time*1.2)+seed);float silhouette=1.0-smoothstep(width*.38,width,abs(x)+(n-.5)*.22);float alpha=silhouette*(1.0-smoothstep(.35,1.0,y))*smoothstep(0.0,.08,y)*(.42+n*.35);vec3 color=mix(vec3(.055,.065,.073),vec3(.43,.46,.47),n*.5+smoothstep(width*.3,width,abs(x))*.5);color=mix(vec3(.55,.16,.035),color,smoothstep(.02,.20,y));if(alpha<.015)discard;gl_FragColor=vec4(color,alpha);}
 ` }));
}

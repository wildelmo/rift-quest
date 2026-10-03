// Combat remains on the same plane. Decorative depth never participates in targeting.
export const LOOT_ROUTE=['VECTOR','MISSILE','RING','SHIELD','ECHO','RING','LANCE','VECTOR','MISSILE','SPREAD','LANCE','BOMB'];
export const PICKUP_INFO={VECTOR:'Stackable side guns · diagonal coverage above and below.',MISSILE:'Stackable seekers · hold fire for a steady homing salvo.',RING:'Expanding annular waves · pierce formations through the rim.',LANCE:'Forward ion lance · piercing shots, twin rails, precise weak-point fire.',SPREAD:'Wide fan blaster · cover the approach.',ECHO:'Your flight path, delayed · a second firing position.',SHIELD:'Two shield charges · repair one hull point.',BOMB:'One pulse bomb · clear the tide.'};
export function firePrimary(g,x,y,echo=false){
 const p=g.player,l=p.level,scale=echo?.45:1;
 if(p.weapon==='RING'){
  const s=g.addShot(x,y,12,0,false,(2.0+l*.6)*scale,'ring',.12);
  if(s)Object.assign(s,{life:1.8,pierce:2+l,stroke:.034+l*.007,hits:[],age:0});
  p.cooldown=.24-l*.016;
 }else if(p.weapon==='LANCE'){
  const s=g.addShot(x,y,25,0,false,(1.9+l*.55)*scale,'lance',.045+l*.018);
  if(s)Object.assign(s,{pierce:l,hits:[],life:1.2});
  if(l>=2)for(const side of [-1,1])g.addShot(x-.09,y+side*(.10+l*.025),23,0,false,.4*scale,'rail',.03+l*.003);
  p.cooldown=.16-l*.009;
 }else if(p.weapon==='SPREAD'){
  const n=l===3?3:2;for(let i=-n;i<=n;i++){const a=i*(.12+l*.025);g.addShot(x,y,Math.cos(a)*18,Math.sin(a)*18,false,(.62+l*.21)*scale,'spread',.045+l*.006);}
  p.cooldown=.13-l*.008;
 }else{
  for(const side of [-1,1])g.addShot(x,y+side*.05,18,0,false,.8*scale,'pulse',.045);
  p.cooldown=.095;
 }
}
export function fireModules(g){
 const p=g.player;
 if(p.vector&&p.vectorCooldown<=0){
  const angles=p.vector===1?[-.64,.64]:p.vector===2?[-.80,-.40,.40,.80]:[-1.02,-.66,-.33,.33,.66,1.02];
  for(const a of angles)g.addShot(p.x+.12,p.y+Math.sign(a)*.13,Math.cos(a)*13,Math.sin(a)*13,false,.38+p.vector*.09,'vector',.043);
  p.vectorCooldown=.29-p.vector*.025;g.emit('vector',{x:p.x,y:p.y,level:p.vector});
 }
 if(p.missiles&&p.missileCooldown<=0){
  for(const side of [-1,1]){const angle=side*.50,s=g.addShot(p.x-.05,p.y+side*.18,Math.cos(angle)*6.2,Math.sin(angle)*6.2,false,.48+p.missiles*.12,'missile',.048);
   if(s)Object.assign(s,{age:0,life:3.4,turnRate:2.4+p.missiles*.2,trail:[],target:null});
  }
  p.missileCooldown=.68-p.missiles*.065;g.emit('missile',{x:p.x,y:p.y,level:p.missiles});
 }
}
export function steerMissile(g,s,dt){
 const eligible=e=>!e.dead&&e.entry<=0&&Math.abs(e.x)<9&&Math.abs(e.y)<5;
 let target=g.enemies.find(e=>e.id===s.target&&eligible(e));
 if(!target){target=g.enemies.filter(eligible).sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];s.target=target?.id||null;}
 let aimTarget=target;
 if(target?.maxHp){const points=g.projectileTargets(target).filter(t=>!t.armor);aimTarget=points.find(t=>t.hitId===s.targetPart)||points.sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];s.targetPart=aimTarget?.hitId??null;}
 else s.targetPart=null;
 if(aimTarget&&s.age>.14){const angle=Math.atan2(s.vy,s.vx),aim=Math.atan2(aimTarget.y-s.y,aimTarget.x-s.x);const delta=Math.atan2(Math.sin(aim-angle),Math.cos(aim-angle)),turn=Math.max(-s.turnRate*dt,Math.min(s.turnRate*dt,delta));s.vx=Math.cos(angle+turn)*6.2;s.vy=Math.sin(angle+turn)*6.2;}
 s.trail.push({x:s.x,y:s.y,life:.28});for(const point of s.trail)point.life-=dt;s.trail=s.trail.filter(p=>p.life>0).slice(-26);
}
export function ringHits(s,e){
 // The hollow center is safe. Test relative rim motion, including the middle of a swept pass.
 const dx=s.x-s.px,dy=s.y-s.py,rr=s.r-s.previousRadius;
 const f=t=>Math.hypot(s.px+dx*t-e.x,s.py+dy*t-e.y)-(s.previousRadius+rr*t);
 const edge=e.r+s.stroke,a=f(0),b=f(1);
 if(Math.abs(a)<=edge||Math.abs(b)<=edge||a*b<0)return true;
 const t=Math.max(0,Math.min(1,((e.x-s.px)*dx+(e.y-s.py)*dy)/(dx*dx+dy*dy||1))),mid=f(t);
 return Math.abs(mid)<=edge||a*mid<0||mid*b<0;
}

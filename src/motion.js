// A relative pointer lets the hand settle anywhere without snapping the ship there.
// Slow motion is filtered more strongly; deliberate fast movements remain responsive.
export class MotionPilot {
  constructor(){this.reset();}
  reset(){this.anchor=null;this.filtered=null;this.previous=null;this.focus=false;this.reach=1;this.speed=0;}
  update(point,ship,dt,{focus=false,clutch=false,reach=1}={}){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
    reach=Math.max(.6,Math.min(1.6,reach));dt=Math.max(0,Math.min(.05,dt));
    if(!this.anchor||clutch||focus!==this.focus||reach!==this.reach){
      this.anchor={hand:{...point},ship:{x:ship.x,y:ship.y}};this.filtered={x:ship.x,y:ship.y};this.previous={...point};this.speed=0;
    }
    this.focus=focus;this.reach=reach;
    const gain=reach*(focus?.35:1),target={x:this.anchor.ship.x+(point.x-this.anchor.hand.x)*gain,y:this.anchor.ship.y+(point.y-this.anchor.hand.y)*gain};
    // Bound the raw target before filtering, so overshooting a wall does not build hidden lag.
    target.x=Math.max(-7.7,Math.min(7.6,target.x));target.y=Math.max(-4.2,Math.min(4.2,target.y));
    if(dt>0){const velocity=Math.hypot(point.x-this.previous.x,point.y-this.previous.y)*gain/dt;this.speed+=(velocity-this.speed)*(1-Math.exp(-dt*18));const cutoff=3+Math.min(35,this.speed*1.3),alpha=1-Math.exp(-2*Math.PI*cutoff*dt);this.filtered.x+=(target.x-this.filtered.x)*alpha;this.filtered.y+=(target.y-this.filtered.y)*alpha;}
    this.previous={...point};return {...this.filtered};
  }
}
export function stickAxis(value){const v=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;const magnitude=Math.max(0,(Math.abs(v)-.12)/.88);return Math.sign(v)*magnitude*magnitude;}

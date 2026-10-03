// Absolute ray destinations: smoothing can delay arrival, never change the final location.
export class MotionPilot {
  constructor(){this.reset();}
  reset(){this.filtered=null;this.previous=null;this.speed=0;}
  update(point,ship,dt,{focus=false,clutch=false,steadiness=1}={}){
    const inside=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=-7.7&&point.x<=7.6&&point.y>=-4.2&&point.y<=4.2;
    if(!inside||clutch){this.reset();return null;}
    dt=Math.max(0,Math.min(.05,dt));steadiness=Math.max(.6,Math.min(1.6,steadiness));
    if(!this.filtered){this.filtered={x:ship.x,y:ship.y};this.previous={...point};}
    if(dt>0){
      const velocity=Math.hypot(point.x-this.previous.x,point.y-this.previous.y)/dt;
      this.speed+=(velocity-this.speed)*(1-Math.exp(-dt*18));
      const cutoff=((focus?3:5)+Math.min(40,this.speed*1.4))/steadiness,alpha=1-Math.exp(-2*Math.PI*cutoff*dt);
      this.filtered.x+=(point.x-this.filtered.x)*alpha;this.filtered.y+=(point.y-this.filtered.y)*alpha;
    }
    this.previous={...point};return {...this.filtered};
  }
}
export function stickAxis(value){const v=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;const magnitude=Math.max(0,(Math.abs(v)-.12)/.88);return Math.sign(v)*magnitude*magnitude;}

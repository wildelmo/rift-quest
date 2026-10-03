import * as THREE from 'three';

export function placeArena(root,pose,settings){
  const p=pose?.transform?.position,q=pose?.transform?.orientation;
  if(!p||!q||pose.emulatedPosition||![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite))return false;
  const orientation=new THREE.Quaternion(q.x,q.y,q.z,q.w);
  if(orientation.lengthSq()<.0001)return false;orientation.normalize();
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(orientation);forward.y=0;
  if(forward.lengthSq()<.0001)return false;forward.normalize();
  root.scale.setScalar(settings.width/16);
  root.position.set(p.x+forward.x*settings.distance,Math.max(settings.width*9/32+.15,p.y),p.z+forward.z*settings.distance);
  root.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);root.updateMatrixWorld(true);return true;
}

// Placement is immutable between explicit placements. In particular, a native
// anchor's evolving orientation must never steer the whole playfield each frame.
export class RoomLock {
  constructor(root,{onLost=()=>{},onChange=()=>{}}={}){
    this.root=root;this.onLost=onLost;this.onChange=onChange;
    this.position=new THREE.Vector3();this.orientation=new THREE.Quaternion();this.scale=new THREE.Vector3();
    this.referenceSpace=null;this.hasPlacement=false;this.lost=false;this.requiresRecenter=false;this.mode='unplaced';
    this.onReset=()=>this.invalidate();
  }
  connect(space){
    if(space===this.referenceSpace)return;
    const changed=!!this.referenceSpace;
    this.referenceSpace?.removeEventListener?.('reset',this.onReset);
    this.referenceSpace=space;space?.addEventListener?.('reset',this.onReset);
    if(changed&&this.hasPlacement)this.invalidate();
  }
  placed(deployed=true){
    this.position.copy(this.root.position);this.orientation.copy(this.root.quaternion);this.scale.copy(this.root.scale);
    this.hasPlacement=true;this.lost=false;this.requiresRecenter=false;this.mode=deployed?'fixed':'preview';
  }
  invalidate(){
    if(!this.hasPlacement)return;
    // System recenter means establish a NEW straight-ahead placement. Applying
    // the inverse reset transform would cancel the player's recenter request.
    this.requiresRecenter=true;
    if(!this.lost){this.lost=true;this.onLost();}
    this.onChange();
  }
  update(_frame,space=this.referenceSpace){
    if(space!==this.referenceSpace)this.connect(space);
    if(this.requiresRecenter)return false;
    if(this.hasPlacement){
      this.root.position.copy(this.position);this.root.quaternion.copy(this.orientation);this.root.scale.copy(this.scale);
      this.root.updateMatrixWorld(true);
    }
    return true;
  }
  dispose(){
    this.referenceSpace?.removeEventListener?.('reset',this.onReset);this.referenceSpace=null;
    this.hasPlacement=false;this.lost=false;this.requiresRecenter=false;this.mode='unplaced';
  }
}

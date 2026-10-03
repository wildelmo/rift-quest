import * as THREE from 'three';

export function placeArena(root,pose,settings){
  const p=pose?.transform?.position,q=pose?.transform?.orientation;
  if(!p||!q||pose.emulatedPosition||![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite))return false;
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));forward.y=0;
  if(forward.lengthSq()<.0001)return false;forward.normalize();
  root.scale.setScalar(settings.width/16);
  root.position.set(p.x+forward.x*settings.distance,Math.max(settings.width*9/32+.15,p.y),p.z+forward.z*settings.distance);
  root.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);root.updateMatrixWorld(true);return true;
}

// An XR anchor tracks the room as the headset's estimate of its origin changes.
// The fallback compensates known reference-space resets instead of moving with the head.
export class RoomLock {
  constructor(root,{onLost=()=>{},onChange=()=>{},makeTransform}={}){
    this.root=root;this.onLost=onLost;this.onChange=onChange;this.makeTransform=makeTransform||((p,q)=>new globalThis.XRRigidTransform(p,q));
    this.canCreateTransform=!!makeTransform||typeof globalThis.XRRigidTransform==='function';
    this.revision=0;this.referenceSpace=null;this.anchor=null;this.pending=null;this.needsAnchor=false;this.hasPlacement=false;this.lost=false;this.requiresRecenter=false;this.mode='unplaced';
    this.onReset=event=>this.handleReset(event);
  }
  connect(space){
    if(space===this.referenceSpace)return;
    const changed=!!this.referenceSpace;this.referenceSpace?.removeEventListener?.('reset',this.onReset);this.referenceSpace=space;space?.addEventListener?.('reset',this.onReset);
    if(changed&&this.hasPlacement){if(!this.anchor){this.releaseAnchor();this.requiresRecenter=true;}this.markLost();this.onChange();}
  }
  releaseAnchor(){
    this.revision++;this.needsAnchor=false;this.pending=null;
    try{this.anchor?.delete();}catch{}this.anchor=null;
  }
  placed(wantAnchor=true){
    this.releaseAnchor();this.hasPlacement=true;this.lost=false;this.requiresRecenter=false;this.needsAnchor=wantAnchor;this.mode=wantAnchor?'reference':'preview';
  }
  markLost(){if(!this.lost){this.lost=true;this.onLost();}}
  handleReset(event){
    if(!this.hasPlacement)return;
    const values=event.transform?.matrix;
    if(values?.length===16&&Array.from(values).every(Number.isFinite)){
      // The event gives the NEW origin in OLD coordinates. Content needs its inverse.
      const delta=new THREE.Matrix4().fromArray(values);
      if(Math.abs(delta.determinant())>1e-8){this.root.updateMatrix();this.root.matrix.premultiply(delta.invert()).decompose(this.root.position,this.root.quaternion,this.root.scale);this.root.updateMatrixWorld(true);this.onChange();return;}
    }
    if(!this.anchor){this.releaseAnchor();this.requiresRecenter=true;}
    this.markLost();this.onChange();
  }
  update(frame,space=this.referenceSpace){
    if(space!==this.referenceSpace)this.connect(space);
    if(!this.hasPlacement||this.requiresRecenter)return !this.requiresRecenter;
    if(this.anchor){
      let pose;try{pose=frame?.getPose?.(this.anchor.anchorSpace,this.referenceSpace);}catch{}
      const m=pose?.transform?.matrix;
      if(!pose||pose.emulatedPosition||m?.length!==16||!Array.from(m).every(Number.isFinite)){this.markLost();return false;}
      new THREE.Matrix4().fromArray(m).decompose(this.root.position,this.root.quaternion,new THREE.Vector3());this.root.updateMatrixWorld(true);
      this.lost=false;this.mode='anchor';return true;
    }
    if(this.needsAnchor){
      this.needsAnchor=false;
      if(!frame?.createAnchor||!this.referenceSpace||!this.canCreateTransform){this.mode='reference';return true;}
      const revision=this.revision,p=this.root.position,q=this.root.quaternion;
      try{
        const transform=this.makeTransform({x:p.x,y:p.y,z:p.z},{x:q.x,y:q.y,z:q.z,w:q.w});
        // Call while the frame is active; only promise completion happens asynchronously.
        const request=frame.createAnchor(transform,this.referenceSpace);this.mode='creating';
        this.pending=Promise.resolve(request).then(anchor=>{if(revision!==this.revision){try{anchor.delete();}catch{}return;}this.anchor=anchor;this.pending=null;}).catch(()=>{if(revision===this.revision){this.pending=null;this.mode='reference';}});
      }catch{this.mode='reference';}
    }
    return !this.lost;
  }
  dispose(){this.releaseAnchor();this.referenceSpace?.removeEventListener?.('reset',this.onReset);this.referenceSpace=null;this.hasPlacement=false;this.lost=false;this.requiresRecenter=false;this.mode='unplaced';}
}

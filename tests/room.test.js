import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {placeArena,RoomLock} from '../src/room.js';
const fit={width:3.8,distance:2.1};
const pose=(yaw=0)=>({transform:{position:{x:1,y:1.7,z:2},orientation:new T.Quaternion().setFromEuler(new T.Euler(.2,yaw,.12,'YXZ'))}});
const close=(a,b)=>assert.ok(a.elements.every((v,i)=>Math.abs(v-b.elements[i])<1e-10));
const create=()=>{const root=new T.Group();placeArena(root,pose(.26),fit);let lost=0,changed=0;const space=new EventTarget(),lock=new RoomLock(root,{onLost:()=>lost++,onChange:()=>changed++});lock.connect(space);lock.placed();return{root,lock,space,get lost(){return lost;},get changed(){return changed;}};};
test('fresh placement is square to horizontal gaze at arbitrary yaw, pitch, and roll',()=>{for(const yaw of [-2.9,-1.1,0,.26,1.6,3.1]){const root=new T.Group(),p=pose(yaw);assert.equal(placeArena(root,p,fit),true);const head=new T.Vector3(1,1.7,2),a=root.localToWorld(new T.Vector3(-8,0,0)),b=root.localToWorld(new T.Vector3(8,0,0));assert.ok(Math.abs(a.distanceTo(head)-b.distanceTo(head))<1e-10);const normal=new T.Vector3(0,0,1).applyQuaternion(root.quaternion),towardHead=head.sub(root.position).normalize();assert.ok(normal.distanceTo(towardHead)<1e-10);assert.equal(root.rotation.x,0);assert.equal(root.rotation.z,0);}});
test('bad, emulated, zero-quaternion, and vertical gaze cannot overwrite a valid placement',()=>{const t=create(),before=t.root.matrix.clone();for(const p of [null,{...pose(),emulatedPosition:true},{transform:{position:{x:NaN},orientation:{}}},{transform:{position:{x:1,y:1.7,z:2},orientation:{x:0,y:0,z:0,w:0}}},{transform:{position:{x:1,y:1.7,z:2},orientation:new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2)}}])assert.equal(placeArena(t.root,p,fit),false);close(t.root.matrix,before);});
test('ten minutes of frames cannot apply anchor yaw or accumulate left rotation',()=>{const t=create(),before=t.root.matrix.clone();let queries=0;const frame={createAnchor:()=>{queries++;throw Error('must never anchor');},getPose:()=>{queries++;throw Error('must never apply anchor pose');}};for(let i=0;i<54000;i++){assert.equal(t.lock.update(frame),true);close(t.root.matrix,before);}assert.equal(queries,0);assert.equal(t.lock.mode,'fixed');});
test('incidental writes cannot steer the immutable field between placements',()=>{const t=create(),before=t.root.matrix.clone();for(let i=0;i<100;i++){t.root.rotation.y-=.02;t.root.position.x-=.01;t.lock.update({});close(t.root.matrix,before);}});
test('repeated origin adjustments preserve physical placement without following head direction',()=>{
  const t=create(),physical=t.root.matrix.clone(),origin=new T.Matrix4();
  for(let i=0;i<60;i++){
    const delta=new T.Matrix4().compose(new T.Vector3(.002,0,-.001),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/180),new T.Vector3(1,1,1));
    origin.multiply(delta);const event=new Event('reset');event.transform={matrix:delta.elements};t.space.dispatchEvent(event);
    for(let frame=0;frame<900;frame++)t.lock.update({});
    close(origin.clone().multiply(t.root.matrix),physical);assert.equal(t.lock.requiresRecenter,false);
  }
  assert.equal(t.lost,0);assert.equal(t.changed,60);
});
test('unknown and invalid resets block play until explicit placement, without changing angle',()=>{
  for(const transform of [null,{matrix:new Array(16).fill(0)},{matrix:new Array(16).fill(NaN)}]){
    const t=create(),before=t.root.matrix.clone(),event=new Event('reset');event.transform=transform;t.space.dispatchEvent(event);
    assert.equal(t.lost,1);assert.equal(t.changed,1);assert.equal(t.lock.requiresRecenter,true);
    for(let i=0;i<900;i++)assert.equal(t.lock.update({}),false);close(t.root.matrix,before);
    // Even a later known reset cannot recover an unknown physical mapping.
    const known=new Event('reset');known.transform={matrix:new T.Matrix4().elements};t.space.dispatchEvent(known);assert.equal(t.lock.requiresRecenter,true);
    placeArena(t.root,pose(-.8),fit);t.lock.placed();assert.equal(t.lock.update({}),true);assert.equal(t.lock.lost,false);assert.ok(Math.abs(t.root.rotation.y+.8)<1e-10);
  }
});
test('recenter replaces the saved angle; old placement can never snap back',()=>{const t=create();for(const yaw of [-.7,.5,-1.6,0]){placeArena(t.root,pose(yaw),fit);t.lock.placed();for(let i=0;i<100;i++)t.lock.update({});assert.ok(t.root.quaternion.angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw))<1e-7);}});
test('reference-space replacement pauses and disposal removes reset listeners',()=>{const t=create(),next=new EventTarget();t.lock.connect(next);assert.equal(t.lost,1);assert.equal(t.lock.requiresRecenter,true);t.lock.dispose();next.dispatchEvent(new Event('reset'));t.space.dispatchEvent(new Event('reset'));assert.equal(t.changed,1);assert.equal(t.lock.mode,'unplaced');assert.equal(t.lock.hasPlacement,false);});

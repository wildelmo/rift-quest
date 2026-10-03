// Exercise Three.js's real WebXRManager, stereo cameras, session and animation
// loop. Only the browser's native XR transport is simulated; no renderer stubs.
const{chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader']});try{
const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.XRWebGLBinding=undefined;
  WebGL2RenderingContext.prototype.makeXRCompatible=async()=>{};
  window.XRWebGLLayer=class{constructor(session,gl){this.framebuffer=null;this.framebufferWidth=1200;this.framebufferHeight=800;this.fixedFoveation=0;}getViewport(view){return{x:view.eye==='left'?0:600,y:0,width:600,height:800};}};
  class Session extends EventTarget{
    constructor(){super();this.visibilityState='visible';this.environmentBlendMode='alpha-blend';this.renderState={};this.enabledFeatures=['local-floor'];this.space=new EventTarget();this.frames=new Map();this.next=1;this.inputSources=['left','right'].map(handedness=>({handedness,targetRayMode:'tracked-pointer',targetRaySpace:{handedness},gamepad:{axes:[0,0,0,0],buttons:Array.from({length:6},()=>({pressed:false}))}}));}
    updateRenderState(state){Object.assign(this.renderState,state);}async requestReferenceSpace(){return this.space;}
    requestAnimationFrame(callback){const id=this.next++;this.frames.set(id,callback);return id;}cancelAnimationFrame(id){this.frames.delete(id);}
    tick(time,frame){const callbacks=[...this.frames.values()];this.frames.clear();for(const cb of callbacks)cb(time,frame);}
    async end(){this.dispatchEvent(new Event('end'));}
  }
  Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true,requestSession:async(mode,options)=>{window.requestOptions=options;return window.session=new Session();}}});
});
await page.goto('http://localhost:5173/');await page.waitForFunction(()=>!!window.__rift);await page.click('#enter-xr');await page.waitForFunction(()=>window.__rift.view.renderer.xr.isPresenting);
const report=await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js'),r=__rift,v=r.view,g=r.game;
 let yaw=.26,head=new T.Vector3(.3,1.7,.2),missing=false,anchorCalls=0;
 const q=()=>new T.Quaternion().setFromEuler(new T.Euler(.12,yaw,.06,'YXZ'));
 const transform=(p,o)=>({position:p,orientation:o,matrix:new T.Matrix4().compose(p,o,new T.Vector3(1,1,1)).elements});
 const projection=new T.PerspectiveCamera(88,.75,.01,100).projectionMatrix.elements;
 const frame={getViewerPose:()=>missing?null:{emulatedPosition:false,transform:transform(head,q()),views:['left','right'].map(eye=>({eye,projectionMatrix:projection,transform:transform(head.clone().add(new T.Vector3(eye==='left'?-.032:.032,0,0).applyQuaternion(q())),q())}))},getPose:source=>transform(head.clone().add(new T.Vector3(.2,-.4,-.1)),q()),createAnchor:()=>{anchorCalls++;throw Error('native anchor must not be requested');}};
 r.settings.controls='stick';let time=1000;const tick=()=>session.tick(time+=1000/90,frame);
 tick();const preview=v.root.matrix.clone();yaw=-.31;tick();session.inputSources[1].gamepad.buttons[0].pressed=true;tick();session.inputSources[1].gamepad.buttons[0].pressed=false;tick();
 const saved=v.root.matrix.clone(),normal=new T.Vector3(0,0,1).applyQuaternion(v.root.quaternion),toHead=head.clone().sub(v.root.position).setY(0).normalize();
 const squareError=normal.distanceTo(toHead),camera=v.renderer.xr.getCamera(),cameraMatches=camera.cameras.every((c,i)=>new T.Vector3().setFromMatrixPosition(c.matrixWorld).distanceTo(head.clone().add(new T.Vector3(i? .032:-.032,0,0).applyQuaternion(q())))<1e-8);
 // Use the real XR camera update on every frame, render at regular checkpoints.
 const draw=v.render.bind(v);let frames=0;v.render=(t,p)=>{frames++;if(frames%900===0)draw(t,p);else v.renderer.xr.updateCamera(v.camera);};
 g.nextWave=g.nextPickup=999999;g.miniSpawned=g.bossSpawned=true;g.setpieces=new Set([30,108,150]);g.player.invincible=999;let maxError=0;
 for(let i=0;i<27000;i++){yaw=-.31+Math.sin(i*.002)*.5;head.x=.3+Math.sin(i*.001)*.12;tick();maxError=Math.max(maxError,...v.root.matrix.elements.map((x,n)=>Math.abs(x-saved.elements[n])));}
 const elapsed=g.time;
 // Headset recenter, both event varieties, must yield fresh placement while paused.
 const resetResults=[];for(const known of [true,false]){yaw=known?.5:-.7;const e=new Event('reset');e.transform=known?{matrix:new T.Matrix4().makeRotationY(.26).elements}:null;session.space.dispatchEvent(e);tick();const n=new T.Vector3(0,0,1).applyQuaternion(v.root.quaternion),toward=head.clone().sub(v.root.position).setY(0).normalize();resetResults.push({paused:r.paused,error:n.distanceTo(toward),needs:r.roomLock.requiresRecenter});document.getElementById('resume').click();tick();}
 // In-game X, then level restart, must not retain an old yaw.
 yaw=.9;session.inputSources[0].gamepad.buttons[4].pressed=true;tick();session.inputSources[0].gamepad.buttons[4].pressed=false;tick();const xError=new T.Vector3(0,0,1).applyQuaternion(v.root.quaternion).distanceTo(head.clone().sub(v.root.position).setY(0).normalize());
 document.getElementById('resume').click();tick();yaw=-1.1;document.getElementById('restart').click();tick();const restartPending=r.deploymentPending,restartPaused=r.paused;document.getElementById('resume').click();tick();const restartError=new T.Vector3(0,0,1).applyQuaternion(v.root.quaternion).distanceTo(head.clone().sub(v.root.position).setY(0).normalize());
 missing=true;tick();document.getElementById('resume').click();const lossBlocked=r.paused;missing=false;tick();document.getElementById('resume').click();tick();
 draw(time/1000,true);const result={xr:v.renderer.xr.isPresenting,eyeCount:camera.cameras.length,previewChanged:!preview.equals(saved),squareError,cameraMatches,maxError,elapsed,anchorCalls,requestedAnchors:requestOptions.optionalFeatures?.includes('anchors')||false,resetResults,xError,restartPending,restartPaused,restartError,lossBlocked,alpha:v.renderer.getClearAlpha()};await r.exitGame({navigate:false,closeWindow:false});result.closed=!v.renderer.xr.isPresenting&&document.querySelectorAll('#viewport canvas').length===0;return result;
});
assert.equal(report.xr,true);assert.equal(report.eyeCount,2);assert.equal(report.previewChanged,true);assert.equal(report.cameraMatches,true);assert.ok(report.squareError<1e-8);assert.ok(report.maxError<1e-8);assert.ok(report.elapsed>299);assert.equal(report.anchorCalls,0);assert.equal(report.requestedAnchors,false);for(const reset of report.resetResults){assert.equal(reset.paused,true);assert.ok(reset.error<1e-8);assert.equal(reset.needs,false);}assert.ok(report.xError<1e-8);assert.equal(report.restartPending,true);assert.equal(report.restartPaused,true);assert.ok(report.restartError<1e-8);assert.equal(report.lossBlocked,true);assert.equal(report.alpha,0);assert.equal(report.closed,true);assert.deepEqual(errors,[]);console.log(JSON.stringify({report,errors},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

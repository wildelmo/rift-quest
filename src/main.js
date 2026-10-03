import './style.css';
import { Game, clamp } from './game.js';
import { View } from './view.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const game = new Game(), sound = new Sound();
let view;
try { view = new View($('viewport')); }
catch (error) { $('xr-status').textContent = `3D graphics could not start: ${error.message}. Enable hardware acceleration and reload.`; $('enter-xr').disabled = true; $('practice').disabled = true; throw error; }
const settings = { distance: 1.98, width: 3.8 };
let playing = false, paused = false, xrSession = null, needsPlacement = false, lastPose = null;
let pendingResult=null;let message = null, messageUntil = 0, lastTime = 0, uiClock = 0, endTime = 0, fixedAccumulator = 0;
const keys = new Set(), previousButtons = new Map();
function resetGame() { pendingResult=null;sound.reset?.();game.reset(); view.clear(); message = null; fixedAccumulator = 0; }
function startDesktop() { resetGame(); playing = true; paused = false; document.body.classList.add('playing'); $('shell').hidden = true; $('game-ui').hidden = false; $('overlay').hidden = true; view.desktop(); sound.start().catch(() => {}); }
function setPaused(value) { paused = value; keys.clear(); fixedAccumulator = 0; if (!xrSession) { $('overlay').hidden = !paused; if(paused) { $('overlay-label').textContent='FLIGHT SYSTEMS';$('overlay-title').textContent='Paused';$('overlay-copy').textContent='Take a breath. The invasion can wait.';$('resume').hidden=false; } } }
function returnHome() { if(xrSession) { xrSession.end(); return; } sound.update(false,0,0);playing=false; paused=false;keys.clear();$('shell').hidden=false;$('game-ui').hidden=true;$('overlay').hidden=true;document.body.classList.remove('playing');view.desktop(); }
$('practice').addEventListener('click', startDesktop);
$('pause').addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', () => setPaused(false));
$('restart').addEventListener('click', startDesktop);
$('hangar').addEventListener('click', returnHome);
$('audio').addEventListener('change', e => sound.enabled=e.target.checked);
for(const [id,key,output] of [['distance','distance','distance-value'],['arena-width','width','width-value']]) $(id).addEventListener('input',e=>{settings[key]=Number(e.target.value);$(output).value=`${(settings[key]*3.28084).toFixed(1)} ft`;});
addEventListener('keydown',e=>{
  if(!playing||xrSession||e.target instanceof HTMLInputElement)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();
  if(!e.repeat){if(e.code==='KeyP'||e.code==='Escape'){if(game.state==='playing')setPaused(!paused);}if(e.code==='KeyR'){startDesktop();return;}if(e.code==='KeyE'&&!paused&&game.state==='playing')game.bomb();}
  keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(playing&&!xrSession&&game.state==='playing')setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&game.state==='playing')setPaused(true);});
async function checkXR(){
  if(!isSecureContext){$('enter-xr').disabled=true;$('xr-status').textContent='Mixed reality needs HTTPS. Open the published link in Quest Browser.';return;}
  try{const supported=await navigator.xr?.isSessionSupported('immersive-ar');$('enter-xr').disabled=!supported;$('xr-status').textContent=supported?'HEADSET READY · Enter, fit the arena, then pull the trigger.':'Open this page in Meta Quest Browser for passthrough. Desktop practice is ready.';}
  catch{$('enter-xr').disabled=true;$('xr-status').textContent='Headset access unavailable. Desktop practice is ready.';}
}
checkXR();
$('enter-xr').addEventListener('click',async()=>{
  $('enter-xr').disabled=true;
  let session;
  try{
    // Request only AR: never replace the user's real room with an opaque VR backdrop.
    session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local-floor']});
    xrSession=session;
    session.addEventListener('end',()=>{xrSession=null;needsPlacement=false;lastPose=null;previousButtons.clear();document.body.classList.remove('xr');returnHome();checkXR();});
    session.addEventListener('visibilitychange',()=>{if(session.visibilityState!=='visible')setPaused(true);});
    session.addEventListener('inputsourceschange',()=>{previousButtons.clear();if(playing)setPaused(true);});
    await view.renderer.xr.setSession(session);
    // Alpha-blended immersive AR exposes headset passthrough behind scene geometry.
    view.renderer.setClearColor(0x000000,0);view.scene.background=null;
    resetGame();playing=true;paused=true;needsPlacement=true;document.body.classList.add('xr');$('shell').hidden=true;$('game-ui').hidden=true;$('overlay').hidden=true;
    sound.start().catch(()=>{});
  }catch(error){if(session)await session.end().catch(()=>{});xrSession=null;document.body.classList.remove('xr');returnHome();$('xr-status').textContent=`Could not enter mixed reality: ${error.message}. Check headset permissions and try again.`;$('enter-xr').disabled=false;}
});
function rising(key,down){const before=previousButtons.get(key);previousButtons.set(key,down);return down&&!before;}
function readInput(dt,now){
  if(!xrSession)return{x:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),fire:keys.has('Space'),charge:keys.has('ShiftLeft')||keys.has('ShiftRight'),focus:keys.has('ControlLeft')||keys.has('ControlRight'),bomb:false};
  let left=null,right=null;for(const source of xrSession.inputSources){if(source.handedness==='left')left=source.gamepad;if(source.handedness==='right')right=source.gamepad;}
  const b=(pad,i)=>!!pad?.buttons[i]?.pressed;
  const axis=(pad,i)=>{const v=pad?.axes[i]||0;return Math.abs(v)<.15?0:Math.sign(v)*(Math.abs(v)-.15)/.85;};
  const input={x:axis(left,2),y:-axis(left,3),fire:b(right,0),charge:b(right,1),focus:b(left,1),bomb:b(right,4)};
  const trigger=rising('trigger',input.fire),pause=rising('pause',b(right,5)),recenter=rising('recenter',b(left,4));
  if(pause&&game.state==='playing')setPaused(!paused);
  if(recenter){setPaused(true);needsPlacement=true;}
  if(game.state!=='playing'){if(trigger&&now>endTime+(game.state==='won'?4.5:1.5)&&!view.cinematics.some(c=>c.kind==='death')){resetGame();paused=false;}return{};}
  if(paused){
    if(Math.abs(input.x)+Math.abs(input.y)>.1){settings.width=clamp(settings.width+input.x*dt,2.4,5.4);settings.distance=clamp(settings.distance+input.y*dt*.45,1.52,2.44);if(lastPose)view.place(lastPose,settings);}
    if(trigger&&!needsPlacement){paused=false;message={title:'DEFEND THIS REALITY',subtitle:'Your ship is the small mint light on the left.'};messageUntil=now+3;}
    return{};
  }
  // Losing either controller pauses instead of leaving the ship helpless or firing.
  if(!left||!right){setPaused(true);return{};}
  return input;
}
function haptic(strength,duration){if(!xrSession)return;for(const s of xrSession.inputSources){if(s.handedness==='right')s.gamepad?.hapticActuators?.[0]?.pulse(strength,duration)?.catch(()=>{});}}
function handleEvents(now){for(const e of game.drainEvents()){
  sound.event(e);
  view.event(e);
  if(e.type==='burst')view.burst(e);
  if(e.type==='announce'){message={title:e.title,subtitle:e.subtitle};messageUntil=now+3;}
  if(e.type==='hit')haptic(.7,160);
  if(e.type==='pickup')haptic(.25,65);
  if(e.type==='bomb'||e.type==='charge')haptic(.8,220);
  if(e.type==='end'){
    endTime=now;let best=game.score;try{best=Math.max(game.score,Number(localStorage.getItem('rift-best')||0));localStorage.setItem('rift-best',best);}catch{}
    if(!xrSession){pendingResult={won:e.won,best,at:now+(e.won?4.5:1.2)};}
  }
}}
function showResult(){const e=pendingResult,best=e.best;pendingResult=null;{ $('overlay').hidden=false;$('overlay-label').textContent=e.won?'ROOM SECURED / LEVEL COMPLETE':'INTERCEPTOR OFFLINE';$('overlay-title').textContent=e.won?'Cathedral down.':'Signal lost.';$('overlay-copy').textContent=`${game.score.toLocaleString()} points · ${game.kills} targets · Best ${best.toLocaleString()}. ${e.won?'Your living room is yours again.':'Try a charged lance or pulse bomb when the swarm closes in.'}`;$('resume').hidden=true;}
}
function updateDOM(now){const p=game.player;$('charge-meter').value=p.charge;$('chain').textContent='×'+game.combo.toFixed(1);$('score').textContent=String(game.score).padStart(6,'0');$('hull').textContent='▰ '.repeat(Math.max(0,p.hp))+'▱ '.repeat(Math.max(0,5-p.hp));$('weapon').textContent=`${p.weapon} / ${p.level}${p.echo?' + ECHO':''}${p.shield?` · SHIELD ${p.shield}`:''}`;$('bombs').textContent=String(game.bombs).padStart(2,'0');$('stage').textContent=game.boss?`${game.boss.type.toUpperCase()} / PHASE ${game.boss.phase}`:`${['','GLASS RAIN','COPPER FOUNDRY','HEART OF THE MACHINE'][game.act]} / ${Math.floor(game.time/60)}:${String(Math.floor(game.time%60)).padStart(2,'0')}`;$('toast').textContent=now<messageUntil?message?.title||'':'';}
view.renderer.setAnimationLoop((ms,frame)=>{
  const now=ms/1000,dt=Math.min(.05,lastTime?now-lastTime:0);lastTime=now;
  if(playing){
    if(xrSession&&frame){const pose=frame.getViewerPose(view.renderer.xr.getReferenceSpace());if(pose){lastPose=pose;if(needsPlacement){view.place(pose,settings);needsPlacement=false;}}else if(!paused)setPaused(true);}
    const input=readInput(dt,now);
    if(!paused&&game.state==='playing') {fixedAccumulator+=dt;while(fixedAccumulator>=1/90){game.update(1/90,input);fixedAccumulator-=1/90;}}else fixedAccumulator=0;
    handleEvents(now);if(pendingResult&&now>=pendingResult.at&&(!pendingResult.won||!view.cinematics.some(c=>c.kind==='death')))showResult();sound.update(!paused&&game.state==='playing',game.boss?.phase||0,game.player.charge,game.act);view.update(game,paused?0:dt,now);
    if(now-messageUntil>0)message=null;
    view.hudUpdate(game,!!xrSession,paused,message,settings);
    uiClock+=dt;if(uiClock>.1){updateDOM(now);uiClock=0;}
  }
  view.render(now,playing);
});
// Development-only observability for deterministic browser verification.
if(import.meta.env.DEV)window.__rift={game,view,sound,startDesktop,get paused(){return paused;},get playing(){return playing;}};

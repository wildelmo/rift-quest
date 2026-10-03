import './style.css';
import { Game } from './game.js';
import { View } from './view.js';
import { Sound } from './audio.js';
import { PauseMenu, normalizeSettings, DIFFICULTIES } from './menu.js';

const $ = id => document.getElementById(id);
const game = new Game(), sound = new Sound(), menu = new PauseMenu();
let view;
try { view = new View($('viewport')); }
catch (error) { $('xr-status').textContent = `3D graphics could not start: ${error.message}. Enable hardware acceleration and reload.`; $('enter-xr').disabled = true; $('practice').disabled = true; throw error; }
let storedSettings;
try { storedSettings = JSON.parse(localStorage.getItem('rift-settings')); } catch {}
const settings = normalizeSettings(storedSettings);
let playing = false, paused = false, xrSession = null, needsPlacement = false, lastPose = null;
let exiting = false, exitPromise = null, loopRunning = false, frameCount = 0;
let pendingResult = null, message = null, messageUntil = 0, lastTime = 0, uiClock = 0, endTime = 0, fixedAccumulator = 0;
const keys = new Set(), previousButtons = new Map();
function applySettings() {
  sound.setVolume(settings.volume, settings.musicVolume);
  game.setDifficulty(settings.difficulty);
  for (const prefix of ['', 'pause-']) {
    for (const [id, key] of [['volume', 'volume'], ['music-volume', 'musicVolume']]) {
      $(prefix + id).value = settings[key]; $(prefix + id + '-value').value = `${Math.round(settings[key] * 100)}%`;
    }
    $(prefix + 'difficulty').value = settings.difficulty;
  }
  for (const [id, key, output] of [['distance', 'distance', 'distance-value'], ['arena-width', 'width', 'width-value']]) {
    $(id).value = settings[key]; $(output).value = `${(settings[key] * 3.28084).toFixed(1)} ft`;
  }
  $('difficulty-hint').textContent = DIFFICULTIES[settings.difficulty].hint;
  try { localStorage.setItem('rift-settings', JSON.stringify(settings)); } catch {}
  if (xrSession && lastPose && paused) view.place(lastPose, settings);
}
applySettings();
function startLoop() { if (exiting || document.hidden || loopRunning) return; lastTime = 0; loopRunning = true; if(view.renderer.xr.isPresenting)view.renderer.xr.setAnimationLoop(animate);else view.renderer.setAnimationLoop(animate); }
function stopLoop() { loopRunning = false; lastTime = 0; view.renderer.setAnimationLoop(null); }
function resetGame() { pendingResult = null; sound.reset(); game.reset(); view.clear(); message = null; fixedAccumulator = 0; keys.clear(); }
function startDesktop() {
  if (exiting || xrSession) return;
  document.activeElement?.blur(); resetGame(); playing = true; paused = false; document.body.classList.add('playing');
  $('shell').hidden = true; $('game-ui').hidden = false; $('overlay').hidden = true;
  view.desktop(); startLoop(); sound.start().catch(() => {});
}
function setPaused(value) {
  if (exiting || !playing) return;
  paused = value; keys.clear(); fixedAccumulator = 0;
  if (paused) { menu.open(); sound.suspend(); }
  else if (!document.hidden) { document.activeElement?.blur(); sound.start().catch(() => {}); }
  if (!xrSession) {
    $('overlay').hidden = !paused;
    if (paused) { $('overlay-label').textContent = 'FLIGHT SYSTEMS'; $('overlay-title').textContent = 'Paused'; $('overlay-copy').textContent = 'Take a breath. Tune your flight.'; $('resume').hidden = game.state !== 'playing'; }
  }
}
function resumeGame() {
  if (exiting) return;
  if (game.state !== 'playing') resetGame();
  if (needsPlacement) return;
  setPaused(false);
}
function restartGame() {
  if (exiting) return;
  if (!xrSession) { startDesktop(); return; }
  resetGame(); setPaused(false);
}
function returnHome() {
  if (exiting) return;
  if (xrSession) { exitGame(); return; }
  playing = false; paused = false; pendingResult = null; keys.clear(); previousButtons.clear();
  sound.dispose().catch(() => {}); view.clear();
  $('shell').hidden = false; $('game-ui').hidden = true; $('overlay').hidden = true;
  document.body.classList.remove('playing'); view.desktop();
}
// Ending XR is only one part of shutdown. Close audio and stop both animation loops
// before attempting tab closure; the no-script fallback also works in Quest Browser.
function exitGame({ sessionEnded = false, navigate = true, closeWindow = true } = {}) {
  if (exitPromise) return exitPromise;
  exiting = true; playing = false; paused = true; pendingResult = null;
  keys.clear(); previousButtons.clear(); stopLoop();
  $('overlay').hidden = true; $('shell').hidden = true; $('game-ui').hidden = true;
  const session = xrSession; xrSession = null; lastPose = null; needsPlacement = false;
  const audioClosed = sound.dispose();
  exitPromise = (async () => {
    await Promise.allSettled([audioClosed, session && !sessionEnded ? Promise.resolve().then(()=>session.end()) : Promise.resolve()]);
    // Three.js restores its desktop animation after XR ends; stop it again.
    stopLoop(); view.dispose(); game.reset(); game.events = [];
    document.body.classList.remove('xr', 'playing');
    if (closeWindow) { try { window.close(); } catch {} }
    if (navigate) location.replace(new URL('closed.html', document.baseURI).href);
  })();
  return exitPromise;
}
$('practice').addEventListener('click', startDesktop);
$('pause').addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', resumeGame);
$('restart').addEventListener('click', restartGame);
$('hangar').addEventListener('click', returnHome);
$('exit').addEventListener('click', () => exitGame());
$('audio').addEventListener('change', e => { sound.enabled = e.target.checked; sound.setVolume(settings.volume, settings.musicVolume); });
for (const prefix of ['', 'pause-']) {
  for (const [id, key] of [['volume', 'volume'], ['music-volume', 'musicVolume'], ['difficulty', 'difficulty']]) {
    $(prefix + id).addEventListener(id === 'difficulty' ? 'change' : 'input', e => { settings[key] = key === 'difficulty' ? e.target.value : Number(e.target.value); applySettings(); });
  }
}
for (const [id, key] of [['distance', 'distance'], ['arena-width', 'width']]) $(id).addEventListener('input', e => { settings[key] = Number(e.target.value); applySettings(); });
addEventListener('keydown', e => {
  if (!playing || xrSession || exiting || e.target.closest('input,select,button,a')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    if (e.code === 'KeyR') { restartGame(); return; }
    if (e.code === 'KeyE' && !paused && game.state === 'playing') game.bomb();
  }
  if (!paused) keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (playing && !xrSession) setPaused(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (playing) setPaused(true); sound.suspend(); stopLoop(); }
  else startLoop(); // Returning to the tab keeps play and audio paused until Resume.
});
addEventListener('pagehide', () => { exitGame({ navigate: false, closeWindow: false }); });
addEventListener('pageshow', e => { if (e.persisted && exiting) location.reload(); });
async function checkXR() {
  if (exiting) return;
  if (!isSecureContext) { $('enter-xr').disabled = true; $('xr-status').textContent = 'Mixed reality needs HTTPS. Open the published link in Quest Browser.'; return; }
  try { const supported = await navigator.xr?.isSessionSupported('immersive-ar'); $('enter-xr').disabled = !supported; $('xr-status').textContent = supported ? 'HEADSET READY · Enter, fit the arena, then deploy your ship.' : 'Open this page in Meta Quest Browser for passthrough. Desktop practice is ready.'; }
  catch { $('enter-xr').disabled = true; $('xr-status').textContent = 'Headset access unavailable. Desktop practice is ready.'; }
}
checkXR();
$('enter-xr').addEventListener('click', async () => {
  if (exiting) return;
  $('enter-xr').disabled = true;
  let session;
  try {
    // Never replace the user's real room with an opaque VR backdrop.
    session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'] });
    if (exiting) { await session.end(); return; }
    xrSession = session;
    session.addEventListener('end', () => { if (xrSession === session && !exiting) exitGame({ sessionEnded: true }); });
    session.addEventListener('visibilitychange', () => {
      if (session.visibilityState !== 'visible') { setPaused(true); sound.suspend(); stopLoop(); }
      else startLoop();
    });
    session.addEventListener('inputsourceschange', () => { previousButtons.clear(); if (playing) setPaused(true); });
    await view.renderer.xr.setSession(session);
    if (exiting) return;
    view.renderer.setClearColor(0x000000, 0); view.scene.background = null;
    resetGame(); playing = true; paused = true; needsPlacement = true; menu.open();
    document.body.classList.add('xr'); $('shell').hidden = true; $('game-ui').hidden = true; $('overlay').hidden = true;
    sound.suspend(); startLoop();
  } catch (error) {
    // Entry failure is recoverable. Ignore the expected end event while unwinding.
    if (session && !exiting) { xrSession = null; await session.end().catch(() => {}); }
    if (exitPromise) return;
    xrSession = null; document.body.classList.remove('xr'); returnHome(); startLoop();
    $('xr-status').textContent = `Could not enter mixed reality: ${error.message}. Check headset permissions and try again.`; $('enter-xr').disabled = false;
  }
});
function rising(key, down) { const before = previousButtons.get(key); previousButtons.set(key, down); return down && !before; }
function readInput(dt, now) {
  if (!xrSession) return { x: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), y: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0), fire: keys.has('Space'), charge: keys.has('ShiftLeft') || keys.has('ShiftRight'), focus: keys.has('ControlLeft') || keys.has('ControlRight'), bomb: false };
  let left = null, right = null;
  for (const source of xrSession.inputSources) { if (source.handedness === 'left') left = source.gamepad; if (source.handedness === 'right') right = source.gamepad; }
  const b = (pad, i) => !!pad?.buttons[i]?.pressed;
  const axis = (pad, i) => { const v = pad?.axes[i] || 0; return Math.abs(v) < .15 ? 0 : Math.sign(v) * (Math.abs(v) - .15) / .85; };
  const input = { x: axis(left, 2), y: -axis(left, 3), fire: b(right, 0), charge: b(right, 1), focus: b(left, 1), bomb: b(right, 4) };
  const trigger = rising('trigger', input.fire), pause = rising('pause', b(right, 5)), recenter = rising('recenter', b(left, 4));
  if (pause) { if(paused)resumeGame();else setPaused(true); }
  if (recenter) { setPaused(true); needsPlacement = true; }
  if (paused) {
    const action = menu.input(input.x, input.y, trigger, now, settings);
    if (action === 'changed') applySettings();
    if (action === 'resume') resumeGame();
    if (action === 'restart') restartGame();
    if (action === 'recenter') { needsPlacement = true; menu.open(); }
    if (action === 'exit') exitGame();
    return {};
  }
  if (game.state !== 'playing') {
    if (trigger && now > endTime + (game.state === 'won' ? 4.5 : 1.5) && !view.cinematics.some(c => c.kind === 'death')) restartGame();
    return {};
  }
  if (!left || !right) { setPaused(true); return {}; }
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
function animate(ms,frame){
  if(exiting||!loopRunning)return;frameCount++;
  const now=ms/1000,dt=Math.min(.05,lastTime?now-lastTime:0);lastTime=now;
  if(playing){
    if(xrSession&&frame){const pose=frame.getViewerPose(view.renderer.xr.getReferenceSpace());if(pose){lastPose=pose;if(needsPlacement){view.place(pose,settings);needsPlacement=false;}}else if(!paused)setPaused(true);}
    const input=readInput(dt,now);
    if(exiting)return;
    if(!paused&&game.state==='playing'){fixedAccumulator+=dt;while(fixedAccumulator>=1/90){game.update(1/90,input);fixedAccumulator-=1/90;}}else fixedAccumulator=0;
    handleEvents(now);
    if(pendingResult&&now>=pendingResult.at&&(!pendingResult.won||!view.cinematics.some(c=>c.kind==='death')))showResult();
    sound.update(!paused&&game.state==='playing',game.boss?.phase||0,game.player.charge,game.act);view.update(game,paused?0:dt,now);
    if(now-messageUntil>0)message=null;
    view.hudUpdate(game,!!xrSession,paused,message,settings,{rows:menu.rows(settings,game.state!=='playing',needsPlacement),selected:menu.selected});
    uiClock+=dt;if(uiClock>.1){updateDOM(now);uiClock=0;}
  }
  view.render(now,playing);
}
startLoop();
// Development-only observability for isolated lifecycle verification.
if(import.meta.env.DEV)window.__rift={game,view,sound,settings,menu,startDesktop,setPaused,returnHome,exitGame,readInput,get paused(){return paused;},get playing(){return playing;},get loopRunning(){return loopRunning;},get frameCount(){return frameCount;},get exiting(){return exiting;}};

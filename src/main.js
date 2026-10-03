import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AudioEngine } from './audio/audio.js';
import { Room, buildFakeRoom } from './game/room.js';
import { Game } from './game/game.js';
import { XRInput, DesktopInput, BotInput } from './input/input.js';
import { seedRandom } from './engine/math.js';
import * as models from './game/models.js';
import './style.css';

const params = new URLSearchParams(location.search);
const options = {
  bot: params.has('bot'),
  god: params.has('god'),
  speed: Number(params.get('speed') || 1),
  wave: params.has('boss') ? 4 : Number(params.get('wave') || 1) - 1,
  autostart: params.has('autostart') || params.has('bot'),
  mute: params.has('mute'),
  substeps: Number(params.get('substeps') || 0),
};
if (params.has('seed')) seedRandom(Number(params.get('seed')));

// ------------------------------------------------------------------ renderer & scene

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.35);
renderer.setClearColor(0x000000, 0);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

scene.add(new THREE.HemisphereLight(0xe6efff, 0x3a3028, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-1.5, 3, 1.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff6ab0, 0.9);
rim.position.set(1.5, 1, -3);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.01, 60);
camera.position.set(0, 1.55, 0.3);
scene.add(camera);

const room = new Room(scene);
const audio = new AudioEngine();

// Where the game believes the player's eyes are when not in XR (the preview camera sits behind).
const nominalHead = { position: new THREE.Vector3(0, 1.5, 0), quaternion: new THREE.Quaternion() };
const xrInput = new XRInput(renderer);
const desktopInput = new DesktopInput(renderer.domElement, camera, () => room.arena);
let game = null;
const botInput = new BotInput(() => game, () => room.arena);
let input = desktopInput;

const inputProxy = {
  haptic: (hand, i, ms) => input.haptic(hand, i, ms),
  requestHold: () => input.requestHold && input.requestHold(),
};
room.placeFromHead(nominalHead.position, nominalHead.quaternion);
game = new Game({ scene, room, audio, input: inputProxy, options });
desktopInput.menuOpen = () => game.menu.visible && game.menu.hover >= 0; // clicks go to the menu only when over a button
game.onExit = () => exitGame();

// ------------------------------------------------------------------ audio lifecycle
// A WebXR page keeps running after you leave the headset view, so every way out of the game
// must silence it: the in-game Exit button, the Quest system menu ending the session, or the
// browser tab being hidden.
function silence() {
  audio.music.stop();
  if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend().catch(() => {});
}
async function wakeAudio() {
  if (options.mute) return;
  await audio.start().catch(() => {});
  game.applyMute();
  audio.music.play('stage', 'title');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) silence();
  else if (mode !== 'menu' && audio.ctx) audio.ctx.resume().catch(() => {});
});
window.addEventListener('pagehide', silence);

async function exitGame() {
  silence();
  const session = renderer.xr.getSession();
  if (session) {
    try { await session.end(); } catch { /* already ending */ }
  } else {
    // desktop preview: back to the start screen
    backToMenu();
  }
}

function backToMenu(message) {
  silence();
  mode = 'menu';
  input = desktopInput;
  desktopInput.holding = false;
  ui.overlay.classList.remove('hidden');
  ui.hudHelp.classList.add('hidden');
  if (message) ui.status.textContent = message;
  game.heldHand = null;
  game.ship.held = false;
  room.placeFromHead(nominalHead.position, nominalHead.quaternion);
  if (fakeRoom) {
    fakeRoom.group.visible = true;
    room.setPlanes(fakeRoom.planes);
    room.layoutRifts();
  }
  game.hud.retilt();
  game.toTitle();
}

// The stand-in room renders as its own background pass, then depth is cleared, so virtual
// content always draws over it - exactly how passthrough behaves on the headset.
const roomScene = new THREE.Scene();
roomScene.add(new THREE.HemisphereLight(0xe6efff, 0x3a3028, 1.3));
const roomKey = new THREE.DirectionalLight(0xfff4e0, 1.6);
roomKey.position.set(-1.5, 3, 1.5);
roomScene.add(roomKey);
let fakeRoom = null;
function ensureFakeRoom() {
  if (fakeRoom) return;
  fakeRoom = buildFakeRoom(roomScene);
  room.setPlanes(fakeRoom.planes);
  room.layoutRifts();
}

function placeDesktopCamera() {
  if (params.has('eyecam')) {
    // approximate what the headset sees: eyes at the nominal head, wide FOV
    camera.fov = 90;
    camera.updateProjectionMatrix();
    camera.position.copy(nominalHead.position);
    camera.lookAt(0, nominalHead.position.y - 0.3, -1.0);
    return;
  }
  // Pull the preview camera back and up so the whole fight is in view.
  camera.position.set(0, nominalHead.position.y + 0.12, nominalHead.position.z + 0.42);
  camera.lookAt(0, nominalHead.position.y - 0.22, -1.0);
}

// ------------------------------------------------------------------ modes

const ui = {
  overlay: document.getElementById('overlay'),
  ar: document.getElementById('btn-ar'),
  vr: document.getElementById('btn-vr'),
  desk: document.getElementById('btn-desktop'),
  status: document.getElementById('xr-status'),
  hudHelp: document.getElementById('desktop-help'),
};

let mode = 'menu';
let xrPlaced = false;

async function startDesktop() {
  await wakeAudio();
  ensureFakeRoom();
  placeDesktopCamera();
  ui.overlay.classList.add('hidden');
  ui.hudHelp.classList.remove('hidden');
  mode = 'desktop';
  input = options.bot ? botInput : desktopInput;
  game.toTitle();
  if (options.autostart) {
    desktopInput.holding = true;
    game.heldHand = 'right';
    game.ship.held = true;
    game.startGame(Math.max(0, options.wave));
  }
}

async function startXR(kind) {
  const sessionMode = kind === 'ar' ? 'immersive-ar' : 'immersive-vr';
  await wakeAudio();
  const init = {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['plane-detection'],
  };
  let session;
  try {
    session = await navigator.xr.requestSession(sessionMode, init);
  } catch (e) {
    ui.status.textContent = `Could not start ${sessionMode}: ${e.message}`;
    return;
  }
  if (kind === 'vr') {
    ensureFakeRoom();
    fakeRoom.group.visible = true;
    room.setPlanes(fakeRoom.planes);
  } else {
    // real room: forget the stand-in walls until plane detection reports the real ones
    if (fakeRoom) fakeRoom.group.visible = false;
    room.setPlanes([]);
    planeStamp = '';
  }
  input = xrInput;
  mode = kind;
  xrPlaced = false;
  ui.overlay.classList.add('hidden');
  await renderer.xr.setSession(session);
  game.toTitle();
  // The system recentre gesture resets the reference space: re-place the arena in front of the player.
  const refSpace = renderer.xr.getReferenceSpace();
  if (refSpace && refSpace.addEventListener) refSpace.addEventListener('reset', () => { xrPlaced = false; });
  session.addEventListener('end', () => backToMenu('Game closed. Tap Enter Mixed Reality to play again.'));
}

async function detectXR() {
  if (!('xr' in navigator)) {
    ui.status.textContent = 'WebXR is not available in this browser. Open this page in the Meta Quest Browser to play in mixed reality.';
    return;
  }
  const [ar, vr] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
  ]);
  if (ar) {
    ui.ar.disabled = false;
    ui.status.textContent = 'Mixed reality ready. Stand or sit with some clear space around your arms.';
  } else {
    ui.status.textContent = vr ? 'Passthrough AR is not available here - VR mode uses a virtual room.' : 'No headset detected. Use the browser preview, or open this page on a Meta Quest.';
  }
  if (vr) ui.vr.disabled = false;
}

ui.ar.addEventListener('click', () => startXR('ar'));
ui.vr.addEventListener('click', () => startXR('vr'));
ui.desk.addEventListener('click', () => startDesktop());
detectXR();

// ------------------------------------------------------------------ XR planes

let planeStamp = '';
function pollPlanes(frame) {
  const planes = frame.detectedPlanes;
  if (!planes || !planes.size) return;
  let stamp = `${planes.size}`;
  for (const p of planes) stamp += `|${p.lastChangedTime}`;
  if (stamp === planeStamp) return;
  planeStamp = stamp;
  const ref = renderer.xr.getReferenceSpace();
  const out = [];
  for (const p of planes) {
    const pose = frame.getPose(p.planeSpace, ref);
    if (!pose) continue;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    out.push({ matrix: m, poly: p.polygon.map((pt) => [pt.x, pt.z]), orientation: p.orientation, label: p.semanticLabel || '' });
  }
  room.setPlanes(out);
  // Only move rifts while nothing is coming out of them.
  if (game.state === 'title' || game.state === 'paused') room.layoutRifts();
}

// ------------------------------------------------------------------ loop

const clock = new THREE.Clock();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  let frameInput;
  if (renderer.xr.isPresenting && frame) {
    frameInput = xrInput.poll(frame);
    if (!xrPlaced && xrInput.headValid) {
      room.placeFromHead(xrInput.head.position, xrInput.head.quaternion);
      game.hud.retilt();
      xrPlaced = true;
    }
    pollPlanes(frame);
  } else if (mode === 'desktop') {
    if (options.substeps) {
      // fixed-step fast-forward for automated play-throughs (software GL renders slowly)
      for (let i = 0; i < options.substeps - 1; i++) game.update(1 / 60, input.poll(nominalHead, 1 / 60));
      frameInput = input.poll(nominalHead, 1 / 60);
      game.update(1 / 60, frameInput);
      renderFrame();
      return;
    }
    frameInput = input.poll(nominalHead, dt);
  } else {
    // menu: idle attract view
    placeDesktopCamera();
    frameInput = { head: nominalHead, hands: {} };
  }
  game.update(dt, frameInput);
  renderFrame();
});

function renderFrame() {
  const showRoom = fakeRoom && fakeRoom.group.visible && mode !== 'ar';
  if (!showRoom) {
    renderer.autoClear = true;
    renderer.render(scene, camera);
    return;
  }
  if (renderer.xr.isPresenting) {
    // VR fallback: one pass, the room is part of the world
    if (fakeRoom.group.parent !== scene) scene.add(fakeRoom.group);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    return;
  }
  if (fakeRoom.group.parent !== roomScene) roomScene.add(fakeRoom.group);
  renderer.autoClear = false;
  renderer.clear();
  renderer.render(roomScene, camera);
  renderer.clearDepth();
  renderer.render(scene, camera);
}



// expose for automated tests and debugging
window.__rift = {
  game, room, renderer, scene, camera, options, startDesktop, models, THREE,
  // screen-space pixel position of a menu item, for automated UI tests
  menuItemScreen(i) {
    const p = game.menu.itemWorldPos(i).project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, labels: game.menu.items.map((it) => it.label) };
  },
  get overlayVisible() { return !ui.overlay.classList.contains('hidden'); },
};

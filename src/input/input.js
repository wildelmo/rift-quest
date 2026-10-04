import * as THREE from 'three';
import { clamp } from '../engine/math.js';
import { GRIP_OFFSET } from '../game/game.js';

// Unified per-frame input: { head: {position, quaternion}, hands: { left, right } } in world space.
// Sources: WebXR controllers (Quest Touch), a desktop mouse rig, or an autopilot used by tests.

function makeHand() {
  return {
    grip: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
    ray: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
    squeeze: 0, trigger: 0, a: false, b: false, stick: false,
    edges: { squeeze: false, trigger: false, a: false, b: false, stick: false },
    prev: { squeeze: false, trigger: false, a: false, b: false, stick: false },
    tracked: false,
  };
}

function setEdges(h) {
  const now = { squeeze: h.squeeze > 0.6, trigger: h.trigger > 0.6, a: h.a, b: h.b, stick: h.stick };
  for (const k of Object.keys(now)) {
    h.edges[k] = now[k] && !h.prev[k];
    h.prev[k] = now[k];
  }
}

export class XRInput {
  constructor(renderer) {
    this.renderer = renderer;
    this.hands = { left: makeHand(), right: makeHand() };
    this.sources = { left: null, right: null };
    this.head = { position: new THREE.Vector3(0, 1.6, 0), quaternion: new THREE.Quaternion() };
    this.headValid = false;
  }

  poll(frame) {
    const session = this.renderer.xr.getSession();
    const ref = this.renderer.xr.getReferenceSpace();
    const out = { head: null, hands: {} };
    if (!session || !frame || !ref) return out;
    const vp = frame.getViewerPose(ref);
    if (vp) {
      const t = vp.transform;
      this.head.position.set(t.position.x, t.position.y, t.position.z);
      this.head.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      this.headValid = true;
      out.head = this.head;
    }
    this.sources.left = this.sources.right = null;
    for (const src of session.inputSources) {
      if (!src.gamepad || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
      const h = this.hands[src.handedness];
      this.sources[src.handedness] = src;
      const gp = src.gamepad;
      const gpose = src.gripSpace && frame.getPose(src.gripSpace, ref);
      const rpose = frame.getPose(src.targetRaySpace, ref);
      if (gpose) {
        const t = gpose.transform;
        h.grip.position.set(t.position.x, t.position.y, t.position.z);
        h.grip.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
        h.tracked = true;
      } else h.tracked = false;
      if (rpose) {
        const o = rpose.transform.orientation, p = rpose.transform.position;
        h.ray.quaternion.set(o.x, o.y, o.z, o.w);
        h.ray.position.set(p.x, p.y, p.z);
      } else {
        h.ray.quaternion.copy(h.grip.quaternion);
        h.ray.position.copy(h.grip.position);
      }
      const b = gp.buttons;
      h.trigger = b[0] ? b[0].value : 0;
      h.squeeze = b[1] ? b[1].value : 0;
      h.stick = !!(b[3] && b[3].pressed);
      h.a = !!(b[4] && b[4].pressed);
      h.b = !!(b[5] && b[5].pressed);
      setEdges(h);
      out.hands[src.handedness] = h.tracked ? h : { ...h, grip: null };
    }
    return out;
  }

  haptic(hand, intensity, ms) {
    const list = hand === 'both' ? ['left', 'right'] : hand ? [hand] : [];
    for (const k of list) {
      const src = this.sources[k];
      const gp = src && src.gamepad;
      if (!gp) continue;
      const act = gp.hapticActuators && gp.hapticActuators[0];
      try {
        if (act && act.pulse) act.pulse(clamp(intensity, 0, 1), ms);
        else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
          gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(intensity, 0, 1), weakMagnitude: clamp(intensity, 0, 1) });
        }
      } catch { /* haptics unsupported */ }
    }
  }
}

/**
 * Desktop preview rig: the mouse moves the ship on a plane in front of the camera,
 * the wheel changes depth, holding the left button fires, space / right button bombs.
 */
export class DesktopInput {
  constructor(dom, camera, getArena) {
    this.dom = dom;
    this.camera = camera;
    this.getArena = getArena;
    this.hand = makeHand();
    this.ndc = new THREE.Vector2(0, -0.1);
    this.depth = 0;
    this.holding = false;
    this.trigger = false;
    this.bombKey = false;
    this.stickKey = false;
    this.bKey = false;
    this.head = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this.raycaster = new THREE.Raycaster();
    this.pointer = { hand: 'mouse', origin: new THREE.Vector3(), quaternion: new THREE.Quaternion(), select: false, hold: false };
    this.menuDown = false; // left button went down while the menu was open and is still held
    this.menuOpen = null;
    dom.addEventListener('pointermove', (e) => {
      const r = dom.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        if (this.menuOpen && this.menuOpen()) { this.menuClick = true; this.menuDown = true; }
        else if (!this.holding) this.holding = true;
        else { this.trigger = true; this.triggerLatch = true; }
      }
      if (e.button === 2) { this.bombKey = true; this.bombLatch = true; }
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button === 0) { this.trigger = false; this.menuDown = false; }
      if (e.button === 2) this.bombKey = false;
    });
    // releasing outside the canvas must not leave a menu slider stuck to the cursor
    window.addEventListener('pointerup', (e) => { if (e.button === 0) this.menuDown = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      this.depth = clamp(this.depth + Math.sign(e.deltaY) * 0.03, -0.35, 0.18);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { this.bombKey = true; this.bombLatch = true; e.preventDefault(); }
      if (e.code === 'Escape' || e.code === 'KeyP') this.holding = !this.holding;
      if (e.code === 'KeyB') this.bKey = true;
      if (e.code === 'KeyR') this.stickKey = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.bombKey = false;
      if (e.code === 'KeyR') this.stickKey = false;
      if (e.code === 'KeyB') this.bKey = false;
    });
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._plane = new THREE.Plane();
  }

  /** nominalHead: where the game believes the player's eyes are (camera is pulled back for the preview). */
  poll(nominalHead) {
    const arena = this.getArena();
    const h = this.hand;
    this.head.position.copy(nominalHead.position);
    this.head.quaternion.copy(nominalHead.quaternion);
    // ray from camera through cursor, intersect plane of constant arena-z
    this.raycaster.setFromCamera(this.ndc, this.camera);
    arena.updateMatrixWorld();
    const n = this._n.set(0, 0, 1).transformDirection(arena.matrixWorld);
    const p = this._p.set(0, 0, this.depth).applyMatrix4(arena.matrixWorld);
    this._plane.setFromNormalAndCoplanarPoint(n, p);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this._plane, hit)) hit.copy(p);
    // clamp to a sensible arm's-reach box (arena-local)
    arena.worldToLocal(hit);
    hit.x = clamp(hit.x, -0.5, 0.5);
    hit.y = clamp(hit.y, -0.3, 0.38);
    // nose points along the camera ray, toward a far point
    const far = this.raycaster.ray.at(2.2, new THREE.Vector3());
    arena.localToWorld(hit);
    const m = new THREE.Matrix4().lookAt(hit, far, new THREE.Vector3(0, 1, 0));
    h.ray.quaternion.setFromRotationMatrix(m);
    h.grip.quaternion.copy(h.ray.quaternion);
    // grip position = ship position minus the in-hand offset
    h.grip.position.copy(hit).sub(GRIP_OFFSET.clone().applyQuaternion(h.ray.quaternion));
    h.squeeze = this.holding ? 1 : 0;
    // latches make sure a press shorter than one frame still registers
    h.trigger = this.trigger || this.triggerLatch ? 1 : 0;
    h.a = this.bombKey || this.bombLatch;
    this.triggerLatch = false;
    this.bombLatch = false;
    // a mouse pointer for the in-game menu
    this.pointer.origin.copy(this.raycaster.ray.origin);
    this.pointer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.raycaster.ray.direction);
    this.pointer.select = this.menuClick;
    this.pointer.hold = this.menuDown && !!(this.menuOpen && this.menuOpen());
    this.menuClick = false;
    h.b = this.bKey;
    h.stick = this.stickKey;
    h.tracked = true;
    setEdges(h);
    return { head: this.head, hands: { right: h }, pointer: this.pointer };
  }

  requestHold() {
    this.holding = true;
  }

  haptic() {}
}

/**
 * Autopilot used by automated play-throughs and attract screenshots: dodges nearby bullets,
 * lines up on targets, flies into the boss's eye, fires and bombs.
 */
export class BotInput {
  constructor(getGame, getArena) {
    this.getGame = getGame;
    this.getArena = getArena;
    this.hand = makeHand();
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.head = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  }

  poll(nominalHead, dt) {
    const g = this.getGame();
    const arena = this.getArena();
    this.t += dt;
    this.head.position.copy(nominalHead.position);
    this.head.quaternion.copy(nominalHead.quaternion);
    const h = this.hand;
    const ship = g.ship;
    // choose a target
    let target = null;
    let best = Infinity;
    for (const t of g.targets) {
      if (!t.alive) continue;
      const pri = t.kind === 'core' ? -10 : t.kind === 'pod' || t.kind === 'emitter' ? -5 : 0;
      const d = t.pos.distanceTo(ship.pos) + pri;
      if (d < best) { best = d; target = t; }
    }
    const want = new THREE.Vector3(Math.sin(this.t * 0.6) * 0.15, Math.sin(this.t * 0.9) * 0.08, 0);
    if (target) {
      if (target.kind === 'core' && g.boss) {
        want.copy(g.boss.eyeTarget).lerp(g.boss.root.position, 0.0);
        want.z = 0;
      } else {
        want.set(clamp(target.pos.x, -0.4, 0.4), clamp(target.pos.y, -0.28, 0.32), 0.02);
      }
    }
    // keep strafing like a person would: aimed fire never finds a stationary target
    want.x += Math.sin(this.t * 1.7) * 0.07;
    want.y += Math.cos(this.t * 1.1) * 0.05;
    for (const p of g.pickups) {
      if (p.pos.distanceTo(ship.pos) < 0.25) { want.copy(p.pos); break; }
    }
    // dodge: repulsion from bullets that are close and approaching
    const rep = new THREE.Vector3();
    let near = 0;
    for (const b of g.bullets.live) {
      const dx = ship.pos.x - b.x, dy = ship.pos.y - b.y, dz = ship.pos.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 0.01) continue;
      near++;
      const approach = -(dx * b.vx + dy * b.vy + dz * b.vz);
      if (approach < 0) continue;
      const w = 0.0006 / (d2 + 0.0004);
      // move perpendicular to the bullet's velocity
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const along = (dx * b.vx + dy * b.vy + dz * b.vz) / sp;
      rep.x += (dx - (b.vx / sp) * along) * w;
      rep.y += (dy - (b.vy / sp) * along) * w;
    }
    // lasers: step away from the closest point of any beam that is (or is about to be) live
    for (const l of g.lasers.items) {
      if (l.state === 'fade') continue;
      const ax = l.origin.x, ay = l.origin.y, az = l.origin.z;
      const dx = l.dir.x * l.length, dy = l.dir.y * l.length, dz = l.dir.z * l.length;
      const px = ship.pos.x - ax, py = ship.pos.y - ay, pz = ship.pos.z - az;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1)));
      const cx = ship.pos.x - (ax + dx * t), cy = ship.pos.y - (ay + dy * t), cz = ship.pos.z - (az + dz * t);
      const d = Math.hypot(cx, cy, cz);
      if (d < 0.09) {
        const w = (0.09 - d) / 0.09 * 0.25 / (d || 1);
        rep.x += cx * w; rep.y += cy * w;
      }
    }
    want.add(rep.clampLength(0, 0.25));
    want.x = clamp(want.x, -0.42, 0.42);
    want.y = clamp(want.y, -0.26, 0.34);
    want.z = clamp(want.z, -0.25, 0.12);
    // critically damped follow (hand-like)
    const k = 18;
    const acc = want.clone().sub(this.pos).multiplyScalar(k * k).addScaledVector(this.vel, -2 * k);
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // aim
    const aimAt = target ? target.pos.clone() : new THREE.Vector3(0, 0, -1.5);
    const world = this.pos.clone();
    arena.localToWorld(world);
    const aimWorld = aimAt.clone();
    arena.localToWorld(aimWorld);
    const m = new THREE.Matrix4().lookAt(world, aimWorld, new THREE.Vector3(0, 1, 0));
    h.ray.quaternion.setFromRotationMatrix(m);
    h.grip.quaternion.copy(h.ray.quaternion);
    h.grip.position.copy(world).sub(GRIP_OFFSET.clone().applyQuaternion(h.ray.quaternion));
    h.squeeze = 1;
    h.trigger = target ? 1 : 0;
    h.a = near > 14 && ship.bombs > 0 && Math.floor(this.t * 2) % 2 === 0;
    h.b = false;
    h.stick = false;
    h.tracked = true;
    setEdges(h);
    return { head: this.head, hands: { right: h } };
  }

  haptic() {}
}

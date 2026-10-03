import * as THREE from 'three';
import { clamp } from '../engine/math.js';

// The real room: arena placement, detected walls/tables, rifts torn into the walls,
// a holographic deck under the action, and a dimmer for the boss's arrival.

const riftVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const riftFrag = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform float uPulse;
uniform vec3 uColor;
uniform vec3 uColor2;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise1(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float open = uOpen;
  // ragged, breathing edge
  float edgeN = noise1(ang * 3.0 + uTime * 0.7) * 0.5 + noise1(ang * 9.0 - uTime * 1.3) * 0.3 + noise1(ang * 23.0 + uTime * 3.0) * 0.2;
  float R = open * (0.55 + 0.18 * edgeN) * (1.0 + uPulse * 0.08);
  // cracks radiating into the wall
  float crackA = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float ca = hash(fi * 7.31) * 6.2831;
    float da = abs(mod(ang - ca + 3.14159 + sin(r * 9.0 + fi) * 0.06, 6.28318) - 3.14159);
    float len = R + (0.15 + 0.3 * hash(fi * 3.7)) * open;
    crackA += smoothstep(0.03, 0.0, da * r) * step(r, len) * step(R, r) * (1.0 - (r - R) / max(len - R, 0.001));
  }
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (r < R) {
    // the void: deep, swirling, with faint stars
    float sw = sin(ang * 3.0 + r * 18.0 - uTime * 2.5) * 0.5 + 0.5;
    float sw2 = sin(ang * 5.0 - r * 26.0 + uTime * 1.7) * 0.5 + 0.5;
    float depth = r / max(R, 0.001);
    col = mix(vec3(0.0), uColor2 * 0.35, sw * depth * depth);
    col += uColor * 0.25 * sw2 * depth * depth * depth;
    float st = step(0.985, hash(floor(p.x * 60.0) * 13.1 + floor(p.y * 60.0) * 71.7 + floor(uTime * 2.0)));
    col += vec3(st) * (1.0 - depth) * 0.8;
    a = 0.96;
    float rim = smoothstep(R - 0.09, R, r);
    col = mix(col, uColor * 1.4 + vec3(0.3), rim);
  } else {
    float glow = exp(-(r - R) * 28.0) * open;
    col = (uColor * 1.2 + vec3(0.2)) * glow;
    a = glow * 0.85;
  }
  col += mix(uColor, vec3(1.0), 0.4) * crackA;
  a = max(a, crackA * 0.9);
  gl_FragColor = vec4(col * a, a);
}
`;

export class Rift {
  constructor(parent, radius, color = [1, 0.2, 0.6], color2 = [0.3, 0.6, 1]) {
    this.radius = radius;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: riftVert, fragmentShader: riftFrag, transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: Math.random() * 10 }, uOpen: { value: 0 }, uPulse: { value: 0 },
        uColor: { value: new THREE.Color(...color) }, uColor2: { value: new THREE.Color(...color2) },
      },
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.position = this.mesh.position;
    this.normal = new THREE.Vector3(0, 0, 1);
    this.target = 0;
    this.open = 0;
    this.pulse = 0;
    this.onWall = false;
  }

  place(pos, normal, onWall) {
    this.mesh.position.copy(pos);
    this.normal.copy(normal).normalize();
    // orient in arena-local space: the plane's +Z faces into the room
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
    this.onWall = onWall;
  }

  /** Point just in front of the rift mouth where enemies emerge. */
  mouth(out, depth = 0.06) {
    return out.copy(this.mesh.position).addScaledVector(this.normal, depth);
  }

  setOpen(v) {
    this.target = v;
  }

  kick() {
    this.pulse = 1;
  }

  update(dt) {
    this.open += (this.target - this.open) * (1 - Math.exp(-(this.target > this.open ? 3.2 : 4.5) * dt));
    if (Math.abs(this.open - this.target) < 0.002) this.open = this.target;
    this.pulse *= Math.exp(-6 * dt);
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uOpen.value = this.open;
    this.mat.uniforms.uPulse.value = this.pulse;
    this.mesh.visible = this.open > 0.003;
  }
}

// Directions (arena-local) where rifts are torn open, and their fallback distances.
export const RIFT_SLOTS = {
  front: { dir: [0, 0.22, -1], dist: 2.8, radius: 0.32 },
  frontL: { dir: [-0.7, 0.18, -1], dist: 2.6, radius: 0.26 },
  frontR: { dir: [0.7, 0.18, -1], dist: 2.6, radius: 0.26 },
  left: { dir: [-1, 0.12, -0.15], dist: 2.0, radius: 0.26 },
  right: { dir: [1, 0.12, -0.15], dist: 2.0, radius: 0.26 },
  ceiling: { dir: [0, 1, -0.45], dist: 1.5, radius: 0.28 },
  boss: { dir: [0, 0.06, -1], dist: 3.1, radius: 0.95 },
};

function pointInPolygon2D(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class Room {
  constructor(scene) {
    this.scene = scene;
    this.arena = new THREE.Group();
    this.arena.name = 'arena';
    scene.add(this.arena);
    this.floorY = -1.1;
    this.surfaces = []; // horizontal (tables etc.), arena-local
    this.walls = []; // { point, normal, matrixInv, poly } in arena local
    this.planeSource = []; // raw planes in world space: { matrix, poly, orientation, label }
    this.planesVersion = 0;
    this.rifts = {};
    for (const [name, s] of Object.entries(RIFT_SLOTS)) {
      const boss = name === 'boss';
      this.rifts[name] = new Rift(this.arena, s.radius * 1.6, boss ? [1, 0.12, 0.35] : [1, 0.2, 0.62], boss ? [1, 0.45, 0.1] : [0.3, 0.6, 1]);
    }
    this._buildDeck();
    this._buildDimmer();
    this.dim = 0;
    this.dimTarget = 0;
    this.flash = 0;
    this.headLocal = new THREE.Vector3(0, 0.28, 0.4);
  }

  /** Place the arena: origin at the comfortable hand position in front of the player. */
  placeFromHead(headPos, headQuat) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const origin = headPos.clone().addScaledVector(fwd, 0.4);
    origin.y = headPos.y - 0.27;
    this.arena.position.copy(origin);
    this.arena.rotation.set(0, yaw, 0);
    this.arena.updateMatrixWorld(true);
    this.floorY = -origin.y;
    this._rebuildLocalPlanes();
    this.layoutRifts();
  }

  /** Called with raw detected planes in world space (from XR plane detection or the fake room). */
  setPlanes(planes) {
    this.planeSource = planes;
    this.planesVersion++;
    this._rebuildLocalPlanes();
  }

  _rebuildLocalPlanes() {
    this.arena.updateMatrixWorld(true);
    const inv = this.arena.matrixWorld.clone().invert();
    this.walls = [];
    this.surfaces = [];
    const p = new THREE.Vector3();
    for (const pl of this.planeSource) {
      // plane local: polygon in XZ, normal +Y
      const local = inv.clone().multiply(pl.matrix);
      const normal = new THREE.Vector3(0, 1, 0).transformDirection(local);
      const center = new THREE.Vector3().setFromMatrixPosition(local);
      const poly = pl.poly; // [[x,z], ...] in plane space
      const isCeiling = pl.label === 'ceiling' || normal.y < -0.7;
      if (pl.orientation === 'vertical' || Math.abs(normal.y) < 0.4 || isCeiling) {
        // make the normal face the arena origin
        if (normal.dot(center) > 0) normal.negate();
        this.walls.push({ center, normal, toPlane: local.clone().invert(), poly, label: pl.label });
      } else if (normal.y > 0.7) {
        const y = center.y;
        if (pl.label === 'floor') { this.floorY = y; continue; }
        if (y < this.floorY + 0.25) continue; // effectively the floor
        const toPlane = local.clone().invert();
        this.surfaces.push({
          y, label: pl.label,
          contains: (x, z) => {
            p.set(x, y, z).applyMatrix4(toPlane);
            return pointInPolygon2D(p.x, p.z, poly);
          },
        });
      }
    }
  }

  /** Raycast from the arena origin; returns {point, normal} on a real wall, or null. */
  raycastWalls(dir, maxDist) {
    let best = null;
    const o = new THREE.Vector3(0, 0, 0);
    const pt = new THREE.Vector3();
    const lp = new THREE.Vector3();
    for (const w of this.walls) {
      const denom = dir.dot(w.normal);
      if (denom > -0.15) continue;
      const t = w.center.clone().sub(o).dot(w.normal) / denom;
      if (t < 0.6 || t > maxDist) continue;
      pt.copy(o).addScaledVector(dir, t);
      lp.copy(pt).applyMatrix4(w.toPlane);
      if (!pointInPolygon2D(lp.x, lp.z, w.poly)) continue;
      if (!best || t < best.t) best = { t, point: pt.clone(), normal: w.normal.clone() };
    }
    return best;
  }

  layoutRifts() {
    for (const [name, s] of Object.entries(RIFT_SLOTS)) {
      const dir = new THREE.Vector3(...s.dir).normalize();
      const rift = this.rifts[name];
      const hit = this.raycastWalls(dir, s.dist + 1.6);
      if (hit) {
        rift.place(hit.point.addScaledVector(hit.normal, 0.01), hit.normal, true);
      } else {
        const pos = dir.clone().multiplyScalar(s.dist);
        // ceiling: also try to stay under the real ceiling height
        if (name === 'ceiling') pos.y = Math.min(pos.y, this.floorY + 2.3 - 0.05);
        const normal = pos.clone().negate().normalize();
        rift.place(pos, normal, false);
      }
      // Keep the boss rift from ending up absurdly close or far.
      if (name === 'boss') {
        const d = rift.position.length();
        if (d < 1.9) rift.place(rift.position.clone().setLength(1.9), rift.normal, rift.onWall);
      }
    }
    this.onLayout && this.onLayout();
  }

  _buildDeck() {
    // A faint holographic disc below the action zone: gives a depth reference and catches the
    // ship's drop-line, without hiding the real room.
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uShip: { value: new THREE.Vector2(0, 0) } },
      vertexShader: riftVert,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; uniform vec2 uShip;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          vec2 g = abs(fract(p * 7.0) - 0.5);
          float grid = smoothstep(0.035, 0.0, min(g.x, g.y));
          float ring = smoothstep(0.012, 0.0, abs(r - 0.98)) + smoothstep(0.008, 0.0, abs(r - 0.6)) * 0.5;
          float sweep = smoothstep(0.08, 0.0, abs(fract(r * 1.0 - uTime * 0.25) - 0.5) - 0.42);
          float fade = smoothstep(1.0, 0.55, r);
          float d = length(p - uShip);
          float spot = smoothstep(0.08, 0.0, d) + smoothstep(0.012, 0.0, abs(d - 0.1)) * 0.8;
          float a = (grid * 0.12 * fade + ring * 0.3 + sweep * 0.06 * fade + spot * 0.45) * uAlpha;
          vec3 col = mix(vec3(0.25, 0.85, 1.0), vec3(1.0), spot * 0.5);
          gl_FragColor = vec4(col * a, a * 0.6);
        }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.deck = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat);
    this.deck.rotation.x = -Math.PI / 2;
    this.deck.position.set(0, -0.32, -0.12);
    this.deck.renderOrder = 1;
    this.arena.add(this.deck);
    this.deckAlpha = 0;
    // vertical drop-line from ship to deck
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0)]);
    this.dropLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x66e6ff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.dropLine.renderOrder = 1;
    this.arena.add(this.dropLine);
  }

  _buildDimmer() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
    this.dimmer = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), mat);
    this.dimmer.renderOrder = -10;
    this.dimmer.visible = false;
    this.arena.add(this.dimmer);
    const fmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, depthTest: false });
    this.flasher = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), fmat);
    this.flasher.renderOrder = 100;
    this.flasher.visible = false;
    this.arena.add(this.flasher);
  }

  /** Brief full-view flash (for the boss kill, bombs). */
  flashView(amount, color = 0xffffff) {
    this.flash = Math.max(this.flash, amount);
    this.flasher.material.color.set(color);
  }

  update(dt, shipLocal, showDeck) {
    for (const r of Object.values(this.rifts)) r.update(dt);
    this.deckAlpha += ((showDeck ? 1 : 0) - this.deckAlpha) * (1 - Math.exp(-3 * dt));
    const u = this.deck.material.uniforms;
    u.uTime.value += dt;
    u.uAlpha.value = this.deckAlpha;
    this.deck.visible = this.deckAlpha > 0.01;
    if (shipLocal) {
      u.uShip.value.set((shipLocal.x - this.deck.position.x) / 0.65, -(shipLocal.z - this.deck.position.z) / 0.65);
      const h = shipLocal.y - this.deck.position.y;
      this.dropLine.visible = showDeck && h > 0.02;
      this.dropLine.position.copy(shipLocal);
      this.dropLine.scale.set(1, Math.max(h, 0.001), 1);
      this.dropLine.material.opacity = 0.3 * this.deckAlpha;
    } else this.dropLine.visible = false;

    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-1.5 * dt));
    this.dimmer.material.opacity = this.dim;
    this.dimmer.visible = this.dim > 0.005;
    this.dimmer.position.copy(this.headLocal);

    this.flash *= Math.exp(-5 * dt);
    this.flasher.material.opacity = clamp(this.flash, 0, 1) * 0.85;
    this.flasher.visible = this.flash > 0.01;
    this.flasher.position.copy(this.headLocal);
  }
}

/** A stand-in room for desktop preview / VR fallback: grid walls plus fake detected planes. */
export function buildFakeRoom(scene) {
  const group = new THREE.Group();
  const W = 4.4, D = 5.2, H = 2.6;
  const cz = -1.2; // room centre z (player stands near z=0 facing -Z)
  const mat = new THREE.MeshStandardMaterial({ color: 0x8e8778, roughness: 0.95, metalness: 0 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.85 });
  const add = (geo, m, pos, rot) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    group.add(mesh);
    return mesh;
  };
  add(new THREE.PlaneGeometry(W, D), floorMat, [0, 0, cz], [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xbdb7aa, roughness: 1 }), [0, H, cz], [Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(W, H), mat, [0, H / 2, cz - D / 2], [0, 0, 0]);
  add(new THREE.PlaneGeometry(D, H), mat, [-W / 2, H / 2, cz], [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(D, H), mat, [W / 2, H / 2, cz], [0, -Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(W, H), mat, [0, H / 2, cz + D / 2], [0, Math.PI, 0]);
  // furniture: a sofa-ish block, a table, a window, a lamp
  const sofa = new THREE.MeshStandardMaterial({ color: 0x3d5566, roughness: 0.9 });
  add(new THREE.BoxGeometry(1.9, 0.45, 0.8), sofa, [-0.6, 0.225, cz - D / 2 + 0.5]);
  add(new THREE.BoxGeometry(1.9, 0.5, 0.2), sofa, [-0.6, 0.65, cz - D / 2 + 0.15]);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6142, roughness: 0.6 });
  add(new THREE.BoxGeometry(1.0, 0.04, 0.55), wood, [0.9, 0.46, -1.0]);
  for (const [x, z] of [[0.45, -1.22], [1.35, -1.22], [0.45, -0.78], [1.35, -0.78]]) add(new THREE.BoxGeometry(0.04, 0.44, 0.04), wood, [x, 0.22, z]);
  add(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshBasicMaterial({ color: 0xcfe6ff }), [1.0, 1.5, cz - D / 2 + 0.01]);
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }), [-1.9, 0.75, -2.6]);
  add(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), [-1.9, 1.55, -2.6]);
  scene.add(group);

  // Fake detected planes (world space). Plane local: normal +Y, polygon in XZ.
  const planes = [];
  const mk = (pos, rotX, rotY, w, h, orientation, label) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    planes.push({ matrix: m, poly: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], orientation, label });
  };
  mk([0, H / 2, cz - D / 2], Math.PI / 2, 0, W, H, 'vertical', 'wall');
  mk([-W / 2, H / 2, cz], Math.PI / 2, Math.PI / 2, D, H, 'vertical', 'wall');
  mk([W / 2, H / 2, cz], Math.PI / 2, -Math.PI / 2, D, H, 'vertical', 'wall');
  mk([0, H, cz], Math.PI, 0, W, D, 'horizontal', 'ceiling');
  mk([0.9, 0.48, -1.0], 0, 0, 1.0, 0.55, 'horizontal', 'table');
  return { group, planes };
}

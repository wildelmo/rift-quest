import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural, low-poly but sculpted models. Every model merges its parts into two meshes:
// a lit "hull" (flat-shaded metal with vertex colours) and an unlit "glow" layer. That keeps
// each ship at two draw calls while still reading clearly against a real room.

export const PALETTE = {
  playerHull: 0xe9eef5,
  playerTrim: 0x2a6cff,
  playerDark: 0x1a2030,
  playerGlow: 0x38f3ff,
  enemyHull: 0x3b3f4c,
  enemyDark: 0x16161d,
  enemyTrim: 0xb3263e,
  enemyGlow: 0xff2d7a,
  enemyHot: 0xffa31a,
  bossMetal: 0x5c6273,
  bossDark: 0x1d1f27,
  bossGold: 0xc79a3a,
};

let envMap = null;
export function setEnvironment(map) {
  envMap = map;
}

const hullMaterials = new Map();
export function hullMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (hullMaterials.has(key) && !opts.unique) return hullMaterials.get(key);
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    metalness: opts.metalness ?? 0.55,
    roughness: opts.roughness ?? 0.32,
    envMap,
    envMapIntensity: opts.envIntensity ?? 1.1,
  });
  if (!opts.unique) hullMaterials.set(key, m);
  return m;
}

const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
export function getGlowMaterial() {
  return glowMaterial;
}

function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Accumulates coloured parts, then bakes into hull + glow meshes. */
export class ModelBuilder {
  constructor() {
    this.hull = [];
    this.glow = [];
  }

  add(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], glow = false, mirrorX = false } = {}) {
    const place = (mx) => {
      const g = colorize(geo.clone(), color);
      _p.set(pos[0] * mx, pos[1], pos[2]);
      _e.set(rot[0], rot[1] * mx, rot[2] * mx);
      _q.setFromEuler(_e);
      _s.set(scale[0], scale[1], scale[2]);
      _m.compose(_p, _q, _s);
      g.applyMatrix4(_m);
      (glow ? this.glow : this.hull).push(g);
    };
    place(1);
    if (mirrorX) place(-1);
    return this;
  }

  build(materialOpts = {}) {
    const group = new THREE.Group();
    let hullMesh = null, glowMesh = null;
    if (this.hull.length) {
      const g = mergeGeometries(this.hull, false);
      g.computeBoundingSphere();
      hullMesh = new THREE.Mesh(g, hullMaterial(materialOpts));
      group.add(hullMesh);
    }
    if (this.glow.length) {
      const g = mergeGeometries(this.glow, false);
      g.computeBoundingSphere();
      glowMesh = new THREE.Mesh(g, glowMaterial);
      group.add(glowMesh);
    }
    group.userData.hull = hullMesh;
    group.userData.glow = glowMesh;
    return group;
  }

  geometries() {
    return {
      hull: this.hull.length ? mergeGeometries(this.hull, false) : null,
      glow: this.glow.length ? mergeGeometries(this.glow, false) : null,
    };
  }
}

// ---------- primitives ----------

/** A tapered prism with N sides, from radius r0 at z0 to r1 at z1 (axis along Z). */
function taper(r0, r1, len, sides = 6, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, open);
  g.rotateX(-Math.PI / 2); // +Y -> -Z: top (r1) goes to -Z (forward)
  return g;
}

/** Flat wing: a polygon outline in the XZ plane, extruded thin along Y. */
function wing(points, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.4, bevelSize: thickness * 0.5, bevelSegments: 1 });
  g.translate(0, 0, -thickness / 2);
  g.rotateX(Math.PI / 2); // shape XY -> XZ
  return g;
}

// ---------- player ship: "LANCET" ----------
// Length ~7.5cm, nose along -Z. Hitbox core sits at the cockpit centre (origin).
export function buildPlayerShip() {
  const b = new ModelBuilder();
  const C = PALETTE;
  // fuselage: long hex nose, mid body, tail
  b.add(taper(0.0095, 0.0012, 0.04, 6), C.playerHull, { pos: [0, 0, -0.022], scale: [1, 0.7, 1] });
  b.add(taper(0.011, 0.0095, 0.022, 6), C.playerHull, { pos: [0, 0, 0.009], scale: [1, 0.72, 1] });
  b.add(taper(0.0085, 0.011, 0.012, 6), C.playerDark, { pos: [0, 0, 0.026], scale: [1, 0.72, 1] });
  // dorsal spine + canopy
  b.add(taper(0.0045, 0.002, 0.026, 4), C.playerTrim, { pos: [0, 0.0062, -0.004], scale: [1, 0.8, 1] });
  b.add(new THREE.SphereGeometry(0.0058, 8, 6), C.playerGlow, { pos: [0, 0.0058, -0.012], scale: [0.85, 0.55, 1.9], glow: true });
  // main wings, swept forward-swept hybrid
  const wingPts = [[0.006, 0.012], [0.032, 0.022], [0.036, 0.016], [0.026, 0.0], [0.009, -0.012]];
  b.add(wing(wingPts, 0.0016), C.playerHull, { pos: [0, -0.0015, 0] , mirrorX: true });
  // wing stripes
  b.add(wing([[0.015, 0.0145], [0.03, 0.0205], [0.031, 0.0175], [0.017, 0.0105]], 0.0005), C.playerTrim, { pos: [0, 0.0005, 0], mirrorX: true });
  // canards
  b.add(wing([[0.004, -0.024], [0.0135, -0.019], [0.0125, -0.016], [0.004, -0.018]], 0.0011), C.playerHull, { mirrorX: true });
  // wingtip cannons
  b.add(taper(0.0016, 0.0012, 0.03, 6), C.playerDark, { pos: [0.034, -0.0012, 0.004], mirrorX: true });
  b.add(new THREE.SphereGeometry(0.0013, 6, 4), C.playerGlow, { pos: [0.034, -0.0012, -0.011], glow: true, mirrorX: true });
  // engine pods
  b.add(taper(0.0042, 0.0034, 0.022, 8), C.playerTrim, { pos: [0.0105, -0.0012, 0.021], mirrorX: true });
  b.add(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0012, 10).rotateX(Math.PI / 2), C.playerGlow, { pos: [0.0105, -0.0012, 0.0325], glow: true, mirrorX: true });
  // tail fins
  b.add(wing([[0.0, 0.016], [0.0, 0.032], [0.0016, 0.032], [0.0016, 0.02]], 0.0012), C.playerHull, { pos: [0.009, 0.0035, 0], rot: [0, 0, -1.2], mirrorX: true });
  return b.build({ metalness: 0.35, roughness: 0.28, envIntensity: 1.25 });
}

/** Gradius-style "option" drone */
export function buildOption() {
  const b = new ModelBuilder();
  b.add(new THREE.IcosahedronGeometry(0.0085, 0), 0xffb02e, { glow: true });
  b.add(new THREE.TorusGeometry(0.0125, 0.0016, 4, 16), 0x6a3b00, {});
  b.add(new THREE.TorusGeometry(0.0125, 0.0016, 4, 16), 0x6a3b00, { rot: [Math.PI / 2, 0, 0] });
  return b.build({ metalness: 0.7, roughness: 0.25 });
}

// ---------- enemies ----------

/** Dart: fast scout. ~6cm. */
export function buildDart() {
  const b = new ModelBuilder();
  const C = PALETTE;
  b.add(taper(0.012, 0.0, 0.05, 3), C.enemyHull, { pos: [0, 0, -0.01], rot: [0, 0, Math.PI], scale: [1.2, 0.55, 1] });
  b.add(wing([[0.006, 0.02], [0.034, 0.03], [0.03, 0.02], [0.006, -0.012]], 0.0018), C.enemyTrim, { mirrorX: true });
  b.add(wing([[0.03, 0.03], [0.036, 0.034], [0.04, 0.012], [0.032, 0.018]], 0.0016), C.enemyDark, { mirrorX: true });
  b.add(taper(0.006, 0.008, 0.012, 6), C.enemyDark, { pos: [0, 0, 0.018] });
  b.add(new THREE.SphereGeometry(0.0052, 8, 6), C.enemyGlow, { pos: [0, 0.0035, -0.008], scale: [1, 0.6, 1.4], glow: true });
  b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.001, 8).rotateX(Math.PI / 2), C.enemyHot, { pos: [0, 0, 0.0245], glow: true });
  return b.build({ metalness: 0.6, roughness: 0.35, unique: true });
}

/** Bloom: spiral turret mine. Core + six petals (petals are a separate child to animate). */
export function buildBloom() {
  const C = PALETTE;
  const core = new ModelBuilder();
  core.add(new THREE.IcosahedronGeometry(0.03, 1), C.enemyDark, {});
  core.add(new THREE.SphereGeometry(0.018, 12, 8), C.enemyGlow, { pos: [0, 0, 0.018], glow: true, scale: [1, 1, 0.6] });
  core.add(new THREE.TorusGeometry(0.034, 0.0045, 6, 18), C.bossGold, {});
  const group = core.build({ metalness: 0.7, roughness: 0.3, unique: true });
  const petals = new ModelBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = taper(0.011, 0.0, 0.05, 4);
    petal.rotateX(Math.PI / 2);
    petal.translate(0, 0.056, 0);
    petal.rotateZ(a);
    petals.add(petal, i % 2 ? C.enemyTrim : C.enemyHull, { scale: [1, 1, 0.5] });
    const tip = new THREE.SphereGeometry(0.0042, 6, 4);
    tip.translate(0, 0.083, 0);
    tip.rotateZ(a);
    petals.add(tip, C.enemyHot, { glow: true });
  }
  const petalGroup = petals.build({ metalness: 0.5, roughness: 0.35 });
  group.add(petalGroup);
  group.userData.petals = petalGroup;
  return group;
}

/** Mite: tiny swarm drone, geometry only (rendered instanced). */
export function miteGeometries() {
  const b = new ModelBuilder();
  b.add(new THREE.TetrahedronGeometry(0.012, 0), PALETTE.enemyHull, { scale: [1, 0.6, 1.6] });
  b.add(wing([[0.003, 0.004], [0.02, 0.012], [0.004, -0.008]], 0.001), PALETTE.enemyTrim, { mirrorX: true });
  b.add(new THREE.OctahedronGeometry(0.0045, 0), PALETTE.enemyGlow, { pos: [0, 0.003, -0.006], glow: true });
  return b.geometries();
}

/** Lancer: laser frigate. ~16cm long, emitter at the nose. */
export function buildLancer() {
  const b = new ModelBuilder();
  const C = PALETTE;
  b.add(taper(0.018, 0.008, 0.11, 6), C.enemyHull, { pos: [0, 0, 0.0], scale: [1, 0.7, 1] });
  b.add(taper(0.02, 0.018, 0.03, 6), C.enemyDark, { pos: [0, 0, 0.07], scale: [1, 0.7, 1] });
  b.add(wing([[0.012, 0.05], [0.07, 0.085], [0.075, 0.07], [0.018, -0.02]], 0.003), C.enemyTrim, { mirrorX: true });
  b.add(wing([[0.06, 0.06], [0.075, 0.07], [0.08, 0.0], [0.07, 0.01]], 0.0025), C.enemyDark, { mirrorX: true });
  b.add(new THREE.OctahedronGeometry(0.014, 0), 0xff4060, { pos: [0, 0, -0.065], glow: true, scale: [1, 1, 1.6] });
  b.add(new THREE.TorusGeometry(0.016, 0.0028, 4, 12), C.bossGold, { pos: [0, 0, -0.052] });
  for (const x of [-1, 1]) b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 8).rotateX(Math.PI / 2), C.enemyHot, { pos: [0.012 * x, 0, 0.086], glow: true });
  return b.build({ metalness: 0.6, roughness: 0.35, unique: true });
}

/** Carrier: armoured hexagonal hull with bay doors. ~24cm. */
export function buildCarrier() {
  const b = new ModelBuilder();
  const C = PALETTE;
  b.add(taper(0.07, 0.05, 0.16, 6), C.enemyHull, { scale: [1, 0.55, 1] });
  b.add(taper(0.05, 0.02, 0.06, 6), C.enemyDark, { pos: [0, 0, -0.11], scale: [1, 0.55, 1] });
  b.add(new THREE.BoxGeometry(0.16, 0.012, 0.12), C.enemyTrim, { pos: [0, 0, 0.01] });
  for (const x of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.03, 0.045, 0.14), C.enemyDark, { pos: [0.085 * x, 0, 0.01] });
    b.add(new THREE.BoxGeometry(0.004, 0.03, 0.1), C.enemyHot, { pos: [0.1 * x, 0, 0.01], glow: true });
    b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 10).rotateX(Math.PI / 2), C.enemyHot, { pos: [0.085 * x, 0, 0.082], glow: true });
  }
  b.add(new THREE.SphereGeometry(0.022, 12, 8), C.enemyGlow, { pos: [0, 0.03, -0.03], scale: [1, 0.5, 1.3], glow: true });
  b.add(new THREE.BoxGeometry(0.05, 0.02, 0.05), C.bossGold, { pos: [0, -0.04, 0.02] });
  return b.build({ metalness: 0.65, roughness: 0.3, unique: true });
}

/** Power capsule (Gradius style): a glowing gem in a cage. */
export function buildCapsule(color) {
  const b = new ModelBuilder();
  b.add(new THREE.OctahedronGeometry(0.014, 0), color, { glow: true, scale: [1, 1.3, 1] });
  b.add(new THREE.TorusGeometry(0.02, 0.0018, 4, 20), 0xffffff, { glow: false });
  return b.build({ metalness: 0.9, roughness: 0.2 });
}

/** Debris chunk geometry for instancing */
export function debrisGeometry() {
  const g = new THREE.TetrahedronGeometry(1, 0);
  g.scale(1, 0.6, 1.4);
  return g;
}

// ---------- the boss: THE GYRE ----------
// Built as separate parts so phases can animate, break and expose them independently.

export function gyreCore() {
  const b = new ModelBuilder();
  b.add(new THREE.IcosahedronGeometry(0.1, 2), 0xffe2f6, { glow: true });
  return b.build();
}

/** Spherical armoured shell around the core with an aperture cut out around +Z. */
export function gyreShell(radius = 0.17, apertureHalfAngle = 0.55) {
  const C = PALETTE;
  const ico = new THREE.IcosahedronGeometry(radius, 2);
  const src = ico.index ? ico.toNonIndexed() : ico;
  const pos = src.getAttribute('position');
  const keepPlates = [], keepCap = [];
  const v = new THREE.Vector3();
  const cosA = Math.cos(apertureHalfAngle);
  for (let i = 0; i < pos.count; i += 3) {
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) v.x += pos.getX(i + k), v.y += pos.getY(i + k), v.z += pos.getZ(i + k);
    v.normalize();
    const tri = [];
    for (let k = 0; k < 3; k++) tri.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
    (v.z > cosA ? keepCap : keepPlates).push(tri);
  }
  const mk = (tris, scale) => {
    const arr = new Float32Array(tris.length * 9);
    tris.forEach((t, j) => {
      // shrink each triangle toward its centroid to read as separate armour plates
      const cx = (t[0] + t[3] + t[6]) / 3, cy = (t[1] + t[4] + t[7]) / 3, cz = (t[2] + t[5] + t[8]) / 3;
      for (let k = 0; k < 3; k++) {
        arr[j * 9 + k * 3] = cx + (t[k * 3] - cx) * scale;
        arr[j * 9 + k * 3 + 1] = cy + (t[k * 3 + 1] - cy) * scale;
        arr[j * 9 + k * 3 + 2] = cz + (t[k * 3 + 2] - cz) * scale;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  const shell = new ModelBuilder();
  shell.add(mk(keepPlates, 0.9), C.bossMetal);
  // dark inner layer so gaps between plates read as depth
  shell.add(new THREE.IcosahedronGeometry(radius * 0.93, 1), C.bossDark);
  // glowing seams around the aperture rim
  const rim = new THREE.TorusGeometry(radius * Math.sin(apertureHalfAngle) * 1.02, 0.007, 6, 28);
  rim.translate(0, 0, radius * Math.cos(apertureHalfAngle));
  shell.add(rim, PALETTE.enemyGlow, { glow: true });
  const shellGroup = shell.build({ metalness: 0.75, roughness: 0.28, unique: true });
  const cap = new ModelBuilder();
  cap.add(mk(keepCap, 0.92), C.bossGold);
  cap.add(new THREE.CylinderGeometry(0.02, 0.03, 0.03, 6).rotateX(Math.PI / 2), C.bossDark, { pos: [0, 0, radius + 0.005] });
  cap.add(new THREE.SphereGeometry(0.012, 8, 6), PALETTE.enemyHot, { pos: [0, 0, radius + 0.02], glow: true });
  const capGroup = cap.build({ metalness: 0.8, roughness: 0.25, unique: true });
  return { shell: shellGroup, cap: capGroup };
}

/** A segmented ring (torus in XY plane, axis Z) with greebles. */
export function gyreRing(radius, tube, segments, color, glowColor, spikes = 0) {
  const b = new ModelBuilder();
  const segArc = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const seg = new THREE.TorusGeometry(radius, tube, 6, 6, segArc * 0.86);
    seg.rotateZ(i * segArc + segArc * 0.07);
    b.add(seg, i % 2 ? color : PALETTE.bossDark);
    // glowing joint between segments
    const a = i * segArc;
    const joint = new THREE.BoxGeometry(tube * 0.9, tube * 0.9, tube * 2.6);
    joint.translate(radius, 0, 0);
    joint.rotateZ(a);
    b.add(joint, glowColor, { glow: true });
  }
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + 0.3;
    const sp = taper(tube * 0.9, 0.0, tube * 5, 4);
    sp.rotateX(Math.PI / 2); // along +Y
    sp.translate(0, radius + tube * 2.8, 0);
    sp.rotateZ(a);
    b.add(sp, PALETTE.bossGold);
  }
  return b.build({ metalness: 0.75, roughness: 0.3, unique: true });
}

/** Turret pod mounted on the outer ring (weak point). Faces +Z. */
export function gyrePod() {
  const b = new ModelBuilder();
  const C = PALETTE;
  b.add(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 8).rotateX(Math.PI / 2), C.bossDark, {});
  b.add(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 8).rotateX(Math.PI / 2), C.bossGold, { pos: [0, 0, -0.018] });
  b.add(new THREE.SphereGeometry(0.03, 12, 8), C.enemyHot, { pos: [0, 0, 0.026], glow: true, scale: [1, 1, 0.7] });
  for (const a of [0, 2.09, 4.19]) {
    const barrel = taper(0.006, 0.005, 0.045, 6);
    barrel.rotateX(Math.PI); // forward is +Z
    barrel.translate(0.022, 0, 0.04);
    barrel.rotateZ(a);
    b.add(barrel, C.bossMetal);
  }
  return b.build({ metalness: 0.7, roughness: 0.3, unique: true });
}

/** Laser prism emitter mounted on the middle ring (weak point). Points along +Z. */
export function gyreEmitter() {
  const b = new ModelBuilder();
  const C = PALETTE;
  b.add(new THREE.OctahedronGeometry(0.045, 0), 0xff3355, { glow: true, scale: [0.8, 0.8, 1.5] });
  b.add(new THREE.TorusGeometry(0.05, 0.007, 4, 12), C.bossGold, {});
  b.add(new THREE.TorusGeometry(0.05, 0.007, 4, 12), C.bossDark, { rot: [0, Math.PI / 2, 0] });
  b.add(new THREE.BoxGeometry(0.03, 0.03, 0.09), C.bossDark, { pos: [0, 0, -0.06] });
  return b.build({ metalness: 0.75, roughness: 0.3, unique: true });
}

/** Crown fins: big vertical blades above and below the boss for silhouette. */
export function gyreFins() {
  const b = new ModelBuilder();
  const C = PALETTE;
  for (const s of [1, -1]) {
    const fin = wing([[0, 0.0], [0.06, 0.05], [0.02, 0.42], [-0.02, 0.42], [-0.06, 0.05]], 0.012);
    fin.rotateX(-Math.PI / 2); // XZ -> XY with points going +Y
    b.add(fin, C.bossMetal, { pos: [0, 0.16 * s, -0.08], rot: [0, 0, s > 0 ? 0 : Math.PI] });
    b.add(new THREE.BoxGeometry(0.008, 0.3, 0.02), C.enemyGlow, { pos: [0, 0.34 * s, -0.08], glow: true });
  }
  for (const s of [1, -1]) {
    const fin = wing([[0, 0.0], [0.05, 0.04], [0.015, 0.3], [-0.015, 0.3], [-0.05, 0.04]], 0.01);
    fin.rotateX(-Math.PI / 2);
    b.add(fin, C.bossDark, { pos: [0.15 * s, 0, -0.1], rot: [0, 0, -s * Math.PI / 2] });
  }
  // rear thrusters
  b.add(taper(0.12, 0.08, 0.2, 8), C.bossDark, { pos: [0, 0, -0.26] });
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12).rotateX(Math.PI / 2), C.enemyHot, { pos: [0, 0, -0.365], glow: true });
  return b.build({ metalness: 0.7, roughness: 0.32, unique: true });
}

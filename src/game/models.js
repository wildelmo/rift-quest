import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  bossMetal: 0x3b404b,
  bossDark: 0x14161b,
  bossGold: 0x8a2a36,
  bossPlate: 0x231417,
  bossSeam: 0xff2244,
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

// ---------- player ship: "LANCET" drone fighter ----------
// A chunky gunmetal drone with twin ring turbines (Xortex-style), ~13 cm wide. Nose along -Z.
// The hitbox core sits at the origin, inside the cockpit.
export const SHIP_TURBINES = [[-0.047, -0.002, 0.012], [0.047, -0.002, 0.012]];

export function buildPlayerShip() {
  const b = new ModelBuilder();
  const gun = 0x2c313b, dark = 0x15181e, plate = 0x9a9ea8, maroon = 0x6a2430, cyan = 0x47f0ff;
  // fuselage: faceted wedge
  b.add(taper(0.019, 0.006, 0.075, 6), gun, { pos: [0, 0, -0.006], scale: [1.35, 0.55, 1] });
  b.add(taper(0.015, 0.019, 0.022, 6), dark, { pos: [0, 0, 0.041], scale: [1.35, 0.55, 1] });
  // armoured dorsal plates
  b.add(taper(0.012, 0.004, 0.05, 4), plate, { pos: [0, 0.0085, -0.004], scale: [1.4, 0.45, 1] });
  b.add(new THREE.BoxGeometry(0.03, 0.005, 0.022), plate, { pos: [0, 0.007, 0.03] });
  // cockpit
  b.add(new THREE.SphereGeometry(0.0075, 10, 8), cyan, { pos: [0, 0.009, -0.022], scale: [0.8, 0.5, 1.8], glow: true });
  // chin cannons
  b.add(taper(0.003, 0.0022, 0.03, 6), dark, { pos: [0.011, -0.007, -0.04], mirrorX: true });
  b.add(new THREE.SphereGeometry(0.0022, 6, 4), cyan, { pos: [0.011, -0.007, -0.056], glow: true, mirrorX: true });
  // pylons out to the turbines
  b.add(new THREE.BoxGeometry(0.03, 0.006, 0.018), gun, { pos: [0.028, -0.002, 0.01], rot: [0, 0, -0.08], mirrorX: true });
  b.add(wing([[0.012, 0.03], [0.05, 0.034], [0.058, 0.02], [0.02, -0.01]], 0.0022), dark, { pos: [0, -0.004, 0], mirrorX: true });
  // ring turbines: axis along Z, so you look straight into their glowing cores from behind
  for (const sx of [-1, 1]) {
    const [x, y, z] = [0.047 * sx, -0.002, 0.012];
    b.add(new THREE.TorusGeometry(0.021, 0.0062, 8, 24), maroon, { pos: [x, y, z] });
    b.add(new THREE.TorusGeometry(0.021, 0.0035, 6, 24), plate, { pos: [x, y, z - 0.006] });
    b.add(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 20).rotateX(Math.PI / 2), dark, { pos: [x, y, z - 0.002] });
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.BoxGeometry(0.0035, 0.015, 0.0015);
      blade.translate(0, 0.008, 0);
      blade.rotateZ((i / 6) * Math.PI * 2);
      blade.rotateY(0.4);
      b.add(blade, plate, { pos: [x, y, z - 0.004] });
    }
    b.add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.0012, 20).rotateX(Math.PI / 2), cyan, { pos: [x, y, z + 0.003], glow: true });
    b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.0016, 12).rotateX(Math.PI / 2), 0xffffff, { pos: [x, y, z + 0.0035], glow: true });
    // fin above each turbine
    b.add(wing([[0, -0.008], [0.013, 0.002], [0.013, 0.012], [0, 0.018]], 0.0018), plate, { pos: [x, y + 0.024, z], rot: [0, 0, Math.PI / 2] });
  }
  // tail fins
  b.add(wing([[0.0, 0.02], [0.0, 0.05], [0.0022, 0.05], [0.0022, 0.03]], 0.0016), gun, { pos: [0.012, 0.006, 0], rot: [0, 0, -1.05], mirrorX: true });
  return b.build({ metalness: 0.55, roughness: 0.32, envIntensity: 1.3 });
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
  b.add(new THREE.IcosahedronGeometry(0.12, 2), 0xe6fdff, { glow: true });
  return b.build();
}

/** Radial star-burst texture for blinding light sources. */
let flareTex = null;
export function flareTexture() {
  if (flareTex) return flareTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(220,255,255,0.95)');
  g.addColorStop(0.3, 'rgba(90,220,255,0.35)');
  g.addColorStop(1, 'rgba(40,120,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.13;
    const len = i % 3 === 0 ? 126 : 80;
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(a);
    const lg = ctx.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, 3);
    ctx.fill();
    ctx.restore();
  }
  flareTex = new THREE.CanvasTexture(c);
  flareTex.colorSpace = THREE.SRGBColorSpace;
  return flareTex;
}

/**
 * Hexagonal armour plates covering a sphere (the dual of a geodesic icosphere: hexagons plus
 * twelve pentagons). Each plate is a raised tile with a glowing red seam around it and a
 * raised, red-outlined centre boss. Plates within `apertureHalfAngle` of +Z become the cap.
 */
export function hexPlates(radius, { detail = 2, apertureHalfAngle = 0, thickness = 0.012, plateColor = PALETTE.bossPlate, seamColor = PALETTE.bossSeam } = {}) {
  let ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  ico = mergeVertices(ico, 1e-4);
  const pos = ico.getAttribute('position');
  const index = ico.index.array;
  const verts = [];
  for (let i = 0; i < pos.count; i++) verts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  const centroids = [];
  const around = verts.map(() => []);
  for (let f = 0; f < index.length / 3; f++) {
    const [a, b, c] = [index[f * 3], index[f * 3 + 1], index[f * 3 + 2]];
    centroids.push(new THREE.Vector3().add(verts[a]).add(verts[b]).add(verts[c]).normalize());
    around[a].push(f); around[b].push(f); around[c].push(f);
  }
  const shell = new ModelBuilder();
  const cap = new ModelBuilder();
  const cosA = Math.cos(apertureHalfAngle);
  const tmp = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const plates = [];
  verts.forEach((v, vi) => {
    // sort surrounding face centroids around the vertex normal
    t1.set(0, 1, 0);
    if (Math.abs(v.y) > 0.9) t1.set(1, 0, 0);
    t1.crossVectors(v, t1).normalize();
    t2.crossVectors(v, t1);
    const ring = around[vi].map((f) => centroids[f]).sort((p, q) => Math.atan2(p.dot(t2), p.dot(t1)) - Math.atan2(q.dot(t2), q.dot(t1)));
    plates.push({ v, ring });
  });
  const tri = (arr, a, b, c) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (const { v, ring } of plates) {
    const target = apertureHalfAngle > 0 && v.z > cosA ? cap : shell;
    const n = ring.length;
    const at = (p, inset, r) => tmp.copy(v).lerp(p, inset).normalize().multiplyScalar(r).clone();
    const R0 = radius * 0.985, R1 = radius + thickness, R2 = radius + thickness * 1.6;
    const top = [], seam = [], base = [], bossOut = [], bossIn = [], bossTop = [];
    for (const p of ring) {
      base.push(at(p, 0.9, R0));
      top.push(at(p, 0.86, R1));
      seam.push(at(p, 0.97, R0 * 1.004));
      bossOut.push(at(p, 0.56, R1 * 1.0005));
      bossIn.push(at(p, 0.48, R2));
      bossTop.push(at(p, 0.44, R2));
    }
    const cTop = v.clone().multiplyScalar(R2);
    const hull = [], plateTop = [], glow = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // plate sides
      tri(hull, base[i], base[j], top[j]); tri(hull, base[i], top[j], top[i]);
      // plate top ring (between outline and boss)
      tri(plateTop, top[i], top[j], bossOut[j]); tri(plateTop, top[i], bossOut[j], bossOut[i]);
      // boss bevel and top
      tri(hull, bossOut[i], bossOut[j], bossIn[j]); tri(hull, bossOut[i], bossIn[j], bossIn[i]);
      tri(plateTop, bossTop[i], bossTop[j], cTop);
      // glowing seam in the gap between plates, and a thin red outline on the boss
      tri(glow, seam[i], seam[j], base[j]); tri(glow, seam[i], base[j], base[i]);
      tri(glow, bossIn[i], bossIn[j], bossTop[j]); tri(glow, bossIn[i], bossTop[j], bossTop[i]);
    }
    const mk = (arr) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      return g;
    };
    target.add(mk(hull), PALETTE.bossDark);
    target.add(mk(plateTop), plateColor);
    target.add(mk(glow), seamColor, { glow: true });
  }
  return { shell, cap };
}

/** The Gyre's armoured shell: hex plates around a glowing inner layer, with a cap over +Z. */
export function gyreShell(radius = 0.2, apertureHalfAngle = 0.42) {
  const { shell, cap } = hexPlates(radius, { detail: 2, apertureHalfAngle, thickness: 0.011 });
  // hot inner layer that shows through the seams
  shell.add(new THREE.IcosahedronGeometry(radius * 0.97, 2), 0x5a0814, { glow: true });
  const rim = new THREE.TorusGeometry(radius * Math.sin(apertureHalfAngle) * 1.02, 0.008, 6, 32);
  rim.translate(0, 0, radius * Math.cos(apertureHalfAngle));
  shell.add(rim, 0x7af6ff, { glow: true });
  cap.add(new THREE.SphereGeometry(0.022, 12, 8), 0xff2244, { pos: [0, 0, radius + 0.02], glow: true });
  return {
    shell: shell.build({ metalness: 0.8, roughness: 0.3, unique: true, envIntensity: 1.4 }),
    cap: cap.build({ metalness: 0.8, roughness: 0.3, unique: true, envIntensity: 1.4 }),
  };
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

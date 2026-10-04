import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hullTextures, boxUVs } from './textures.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
/**
 * Textured hull material: vertex colours tint a shared procedural panel texture set
 * (albedo detail, normal, roughness/metalness, small emissive lights). Supports a white
 * hit-flash via setFlash().
 */
export function hullMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (hullMaterials.has(key) && !opts.unique) return hullMaterials.get(key);
  const tex = hullTextures();
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: opts.metalness ?? 0.55,
    roughness: opts.roughness ?? 0.32,
    envMap,
    envMapIntensity: opts.envIntensity ?? 1.1,
  });
  if (tex && opts.textured !== false) {
    m.map = tex.map;
    m.normalMap = tex.normalMap;
    m.normalScale.set(0.9, 0.9);
    m.roughnessMap = tex.roughnessMap;
    m.metalnessMap = tex.roughnessMap;
    m.emissiveMap = tex.emissiveMap;
    m.emissive.set(0xffffff);
    m.emissiveIntensity = 1.4;
    m.roughness = 1; // the map supplies the actual values
    m.metalness = 1;
  }
  m.userData.flash = { value: 0 };
  m.onBeforeCompile = function (shader) {
    shader.uniforms.uFlash = this.userData.flash;
    shader.fragmentShader = 'uniform float uFlash;\n' + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.95, 0.9), uFlash);',
    );
  };
  if (!opts.unique) hullMaterials.set(key, m);
  return m;
}

/** White hit-flash amount (0..1) on a hull material. */
export function setFlash(material, v) {
  if (material && material.userData.flash) material.userData.flash.value = v;
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

/** Swap the 2nd and 3rd vertex of every triangle (non-indexed geometry). */
function flipWinding(g) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    const n = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
  }
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

  add(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], glow = false, mirrorX = false, smooth = false } = {}) {
    const place = (mirror) => {
      const g = colorize(geo.clone(), color);
      if (!smooth) {
        // faceted: recompute per-face normals so armour plates read as crisp facets
        g.deleteAttribute('normal');
        g.computeVertexNormals();
      }
      _p.set(pos[0], pos[1], pos[2]);
      _e.set(rot[0], rot[1], rot[2]);
      _q.setFromEuler(_e);
      _s.set(scale[0], scale[1], scale[2]);
      _m.compose(_p, _q, _s);
      g.applyMatrix4(_m);
      if (mirror) {
        // true reflection across X (handles one-sided shapes like wings), then fix the winding
        g.applyMatrix4(_m.makeScale(-1, 1, 1));
        flipWinding(g);
      }
      (glow ? this.glow : this.hull).push(g);
    };
    place(false);
    if (mirrorX) place(true);
    return this;
  }

  build(materialOpts = {}) {
    const group = new THREE.Group();
    let hullMesh = null, glowMesh = null;
    if (this.hull.length) {
      const g = mergeGeometries(this.hull, false);
      boxUVs(g, materialOpts.uvDensity ?? 9);
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

  geometries(uvDensity = 9) {
    return {
      hull: this.hull.length ? boxUVs(mergeGeometries(this.hull, false), uvDensity) : null,
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

// ---------- the Rift drone fleet ----------
// One design language for every enemy: black gunmetal hard-surface armour with bevelled
// edges, layered plates and greebles, red energy seams, and a single glowing cyclops lens.

const DR = {
  gun: 0x30343d, dark: 0x1a1c22, mid: 0x4d525e, light: 0x7b808c, accent: 0x5c1a24,
  red: 0xff2a40, hot: 0xff6a2a, white: 0xfff0f0,
};

/** Bevelled box: the bevel catches a specular edge highlight, which is what reads as "machined". */
function rbox(w, h, d, r = Math.min(w, h, d) * 0.2) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.49));
}

/** Blade fin extruded from an outline in the XZ plane (span along +X), chamfered edges. */
function blade(points, t) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: t * 0.45, bevelSize: t * 0.6, bevelSegments: 2 });
  g.translate(0, 0, -t / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Cyclops eye: armoured housing, metal ring and a hot lens, facing -Z at z. */
function eye(b, z, r, color = DR.red) {
  b.add(new THREE.CylinderGeometry(r * 1.25, r * 1.5, r * 1.1, 16).rotateX(Math.PI / 2), DR.dark, { pos: [0, 0, z + r * 0.4], smooth: true });
  b.add(new THREE.TorusGeometry(r * 1.2, r * 0.18, 8, 24), DR.light, { pos: [0, 0, z], smooth: true });
  b.add(new THREE.SphereGeometry(r, 16, 12), color, { pos: [0, 0, z], scale: [1, 1, 0.55], glow: true });
  b.add(new THREE.SphereGeometry(r * 0.38, 10, 8), DR.white, { pos: [0, 0, z - r * 0.4], glow: true });
}

/** Thruster nozzle facing +Z at z with a hot core. */
function nozzle(b, x, y, z, r) {
  b.add(new THREE.CylinderGeometry(r, r * 1.25, r * 1.6, 14, 1, true).rotateX(Math.PI / 2), DR.mid, { pos: [x, y, z], smooth: true });
  b.add(new THREE.TorusGeometry(r * 1.2, r * 0.16, 6, 18), DR.dark, { pos: [x, y, z + r * 0.8], smooth: true });
  b.add(new THREE.CylinderGeometry(r * 0.9, r * 0.9, r * 0.2, 14).rotateX(Math.PI / 2), DR.hot, { pos: [x, y, z + r * 0.3], glow: true });
}

/** Stinger: X-fin interceptor drone. ~9 cm. */
export function buildDart() {
  const b = new ModelBuilder();
  // armoured core pod with collars
  b.add(rbox(0.024, 0.02, 0.054, 0.006), DR.gun);
  b.add(rbox(0.029, 0.025, 0.011, 0.003), DR.dark, { pos: [0, 0, -0.013] });
  b.add(rbox(0.029, 0.025, 0.011, 0.003), DR.dark, { pos: [0, 0, 0.013] });
  b.add(rbox(0.016, 0.006, 0.03, 0.002), DR.mid, { pos: [0, 0.012, 0.0] });
  b.add(rbox(0.006, 0.004, 0.022, 0.0015), DR.accent, { pos: [0, 0.0158, 0.0] });
  // seams of red energy in the collars
  for (const z of [-0.0075, 0.0075]) b.add(rbox(0.0262, 0.0222, 0.0012, 0.0005), DR.red, { pos: [0, 0, z], glow: true });
  eye(b, -0.03, 0.0072);
  // X-configured blade fins with lit leading edges
  const finPts = [[0, -0.016], [0.026, 0.0], [0.04, 0.016], [0.036, 0.024], [0.016, 0.02], [0, 0.018]];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const fin = blade(finPts, 0.0016);
    fin.translate(0.01, 0, 0);
    fin.rotateZ(a);
    b.add(fin, k % 2 ? DR.mid : DR.gun);
    const edge = new THREE.BoxGeometry(0.03, 0.0011, 0.0013);
    edge.rotateY(-Math.atan2(0.016, 0.026) * 0.9);
    edge.translate(0.027, 0, -0.0075);
    edge.rotateZ(a);
    b.add(edge, DR.red, { glow: true });
    const tip = new THREE.BoxGeometry(0.004, 0.0035, 0.01);
    tip.translate(0.041, 0, 0.018);
    tip.rotateZ(a);
    b.add(tip, DR.dark);
  }
  nozzle(b, 0, 0, 0.031, 0.0068);
  b.add(new THREE.CylinderGeometry(0.0007, 0.0007, 0.022, 4), DR.light, { pos: [0.006, 0.02, 0.014] });
  return b.build({ metalness: 0.65, roughness: 0.32, unique: true, uvDensity: 16, envIntensity: 1.5 });
}

/** Spinner: turret drone whose armoured arms open into a firing star. */
export function buildBloom() {
  const hub = new ModelBuilder();
  hub.add(new THREE.CylinderGeometry(0.03, 0.033, 0.026, 6).rotateX(Math.PI / 2), DR.gun);
  hub.add(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 6).rotateX(Math.PI / 2).rotateZ(Math.PI / 6), DR.dark);
  hub.add(new THREE.TorusGeometry(0.031, 0.0026, 6, 6), DR.red, { pos: [0, 0, 0.004], rot: [0, 0, Math.PI / 6], glow: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    hub.add(rbox(0.012, 0.008, 0.01, 0.002), DR.mid, { pos: [Math.cos(a) * 0.026, Math.sin(a) * 0.026, -0.012], rot: [0, 0, a] });
  }
  eye(hub, -0.016, 0.011);
  nozzle(hub, 0, 0, 0.018, 0.009);
  const group = hub.build({ metalness: 0.65, roughness: 0.32, unique: true, uvDensity: 16, envIntensity: 1.5 });
  const arms = new ModelBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const part = (geo, color, opts = {}) => {
      geo.rotateZ(a);
      arms.add(geo, color, opts);
    };
    part(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 10).rotateX(Math.PI / 2).translate(0, 0.036, 0), DR.light, { smooth: true });
    part(rbox(0.011, 0.04, 0.009, 0.003).translate(0, 0.056, 0), DR.gun);
    part(rbox(0.015, 0.024, 0.005, 0.002).translate(0, 0.058, -0.006), DR.dark);
    part(new THREE.BoxGeometry(0.0016, 0.026, 0.001).translate(0, 0.058, -0.0088), DR.red, { glow: true });
    part(rbox(0.016, 0.01, 0.012, 0.003).translate(0, 0.08, 0), DR.mid);
    part(new THREE.SphereGeometry(0.0042, 10, 8).translate(0, 0.084, -0.006), DR.hot, { glow: true });
  }
  const armGroup = arms.build({ metalness: 0.65, roughness: 0.32, uvDensity: 16, envIntensity: 1.5 });
  group.add(armGroup);
  group.userData.petals = armGroup;
  return group;
}

/** Swarm mite: a miniature X-fin drone, geometry only (rendered instanced). ~4 cm. */
export function miteGeometries() {
  const b = new ModelBuilder();
  b.add(rbox(0.012, 0.01, 0.026, 0.003), DR.gun);
  b.add(rbox(0.014, 0.012, 0.005, 0.0015), DR.dark, { pos: [0, 0, -0.004] });
  b.add(new THREE.SphereGeometry(0.0038, 10, 8), DR.red, { pos: [0, 0, -0.0135], scale: [1, 1, 0.6], glow: true });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const fin = blade([[0, -0.007], [0.016, 0.004], [0.017, 0.01], [0, 0.009]], 0.0011);
    fin.translate(0.005, 0, 0);
    fin.rotateZ(a);
    b.add(fin, k % 2 ? DR.mid : DR.gun);
  }
  b.add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.001, 10).rotateX(Math.PI / 2), DR.hot, { pos: [0, 0, 0.0135], glow: true });
  return b.geometries(18);
}

/** Lancer: twin-boom beam frigate with a focusing crystal between the booms. ~18 cm. */
export function buildLancer() {
  const b = new ModelBuilder();
  for (const sx of [-1, 1]) {
    b.add(rbox(0.015, 0.016, 0.15, 0.004), DR.gun, { pos: [0.02 * sx, 0, 0.0] });
    b.add(rbox(0.018, 0.006, 0.09, 0.002), DR.dark, { pos: [0.02 * sx, 0.01, 0.02] });
    b.add(new THREE.BoxGeometry(0.0014, 0.004, 0.08), DR.red, { pos: [0.0285 * sx, 0, 0.01], glow: true });
    b.add(rbox(0.012, 0.012, 0.016, 0.003), DR.mid, { pos: [0.02 * sx, 0, -0.08] });
    b.add(new THREE.SphereGeometry(0.0035, 10, 8), DR.red, { pos: [0.02 * sx, 0, -0.089], glow: true });
    for (let i = 0; i < 4; i++) b.add(rbox(0.017, 0.018, 0.004, 0.0015), DR.dark, { pos: [0.02 * sx, 0, -0.045 + i * 0.03] });
    nozzle(b, 0.02 * sx, 0, 0.078, 0.007);
  }
  b.add(blade([[0, 0.02], [0.03, 0.05], [0.032, 0.07], [0, 0.06]], 0.002), DR.mid, { pos: [0.026, 0, 0], mirrorX: true });
  // spine and cross braces
  b.add(rbox(0.022, 0.012, 0.11, 0.004), DR.gun, { pos: [0, 0.006, 0.02] });
  b.add(rbox(0.012, 0.008, 0.06, 0.003), DR.accent, { pos: [0, 0.014, 0.03] });
  for (const z of [-0.03, 0.02, 0.06]) b.add(rbox(0.05, 0.006, 0.008, 0.002), DR.mid, { pos: [0, -0.004, z] });
  // focusing crystal with coil rings
  b.add(new THREE.OctahedronGeometry(0.011, 0), 0xff3355, { pos: [0, 0, -0.07], scale: [0.75, 0.75, 1.9], glow: true });
  for (const z of [-0.058, -0.072, -0.086]) b.add(new THREE.TorusGeometry(0.0115, 0.0016, 6, 20), DR.light, { pos: [0, 0, z], smooth: true });
  return b.build({ metalness: 0.65, roughness: 0.32, unique: true, uvDensity: 14, envIntensity: 1.5 });
}

/** Carrier: heavy armoured mothership with a glowing hangar mouth, turrets and an engine bank. ~30 cm. */
export function buildCarrier() {
  const b = new ModelBuilder();
  b.add(rbox(0.13, 0.05, 0.24, 0.01), DR.gun);
  b.add(rbox(0.1, 0.022, 0.17, 0.006), DR.dark, { pos: [0, 0.033, 0.02] });
  b.add(rbox(0.06, 0.012, 0.11, 0.004), DR.mid, { pos: [0, 0.049, 0.03] });
  // bridge tower
  b.add(rbox(0.032, 0.03, 0.04, 0.005), DR.gun, { pos: [0, 0.07, 0.07] });
  b.add(new THREE.BoxGeometry(0.026, 0.0035, 0.002), 0xff4a5a, { pos: [0, 0.076, 0.0495], glow: true });
  for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 5), DR.light, { pos: [0.011 * sx, 0.1, 0.08] });
  // hangar mouth at the bow
  b.add(rbox(0.07, 0.03, 0.02, 0.004), DR.dark, { pos: [0, -0.002, -0.118] });
  b.add(new THREE.BoxGeometry(0.058, 0.02, 0.002), DR.red, { pos: [0, -0.002, -0.1295], glow: true });
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(0.002, 0.022, 0.003), DR.mid, { pos: [-0.021 + i * 0.014, -0.002, -0.13] });
  // sponsons with energy seams and vents
  for (const sx of [-1, 1]) {
    b.add(rbox(0.032, 0.04, 0.2, 0.006), DR.mid, { pos: [0.08 * sx, -0.004, 0.01] });
    b.add(new THREE.BoxGeometry(0.0016, 0.026, 0.16), DR.red, { pos: [0.0965 * sx, -0.004, 0.01], glow: true });
    for (let i = 0; i < 6; i++) b.add(rbox(0.034, 0.006, 0.014, 0.002), DR.dark, { pos: [0.08 * sx, 0.018, -0.07 + i * 0.03] });
    // turret
    b.add(new THREE.CylinderGeometry(0.012, 0.014, 0.01, 12), DR.dark, { pos: [0.04 * sx, 0.049, -0.05], smooth: true });
    b.add(rbox(0.014, 0.008, 0.018, 0.003), DR.gun, { pos: [0.04 * sx, 0.057, -0.052] });
    b.add(new THREE.CylinderGeometry(0.0018, 0.0018, 0.026, 6).rotateX(Math.PI / 2), DR.light, { pos: [0.04 * sx, 0.057, -0.072] });
  }
  // armour plates stacked on the flanks
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.add(rbox(0.006, 0.034, 0.05, 0.002), DR.dark, { pos: [0.066 * sx, 0.006, -0.06 + i * 0.06] });
  // engine bank
  for (const [x, y] of [[-0.04, 0], [0.04, 0], [-0.014, 0.004], [0.014, 0.004]]) nozzle(b, x, y, 0.126, 0.011);
  return b.build({ metalness: 0.65, roughness: 0.32, unique: true, uvDensity: 10, envIntensity: 1.5 });
}

/** Pivot mine: spiked armoured core with laser emitter prongs around a hot eye. ~5 cm. */
export function buildMine(prongs = 3) {
  const b = new ModelBuilder();
  b.add(new THREE.IcosahedronGeometry(0.013, 0), DR.gun);
  b.add(new THREE.TorusGeometry(0.0145, 0.0022, 6, 18), DR.light, { smooth: true });
  for (let i = 0; i < prongs; i++) {
    const a = (i / prongs) * Math.PI * 2;
    const arm = rbox(0.006, 0.02, 0.006, 0.0015);
    arm.translate(0, 0.02, 0);
    arm.rotateZ(a);
    b.add(arm, DR.mid);
    const tip = new THREE.OctahedronGeometry(0.004, 0);
    tip.translate(0, 0.032, 0);
    tip.rotateZ(a);
    b.add(tip, DR.red, { glow: true });
  }
  for (let i = 0; i < 6; i++) {
    const spike = taper(0.0025, 0.0, 0.012, 4);
    spike.rotateX(Math.PI / 2);
    spike.translate(0, 0.018, 0);
    spike.rotateX(Math.PI / 2);
    spike.rotateY((i / 6) * Math.PI * 2);
    b.add(spike, DR.dark);
  }
  b.add(new THREE.SphereGeometry(0.0062, 12, 8), DR.red, { pos: [0, 0, 0.011], scale: [1, 1, 0.6], glow: true });
  return b.build({ metalness: 0.65, roughness: 0.32, unique: true, uvDensity: 18, envIntensity: 1.5 });
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

import * as THREE from 'three';

// Procedural hull texture set: armour panels with seams, rivets, vents, wear and tiny running
// lights. Generated once on a canvas and shared by every ship, so nothing has to be downloaded.
//   map           - detail albedo (multiplies each part's tint)
//   normalMap     - panel seams, rivets and vents catch the light
//   roughnessMap  - green = roughness, blue = metalness (three.js channel convention)
//   emissiveMap   - sparse status lights and window strips

const SIZE = 1024;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

let cached = null;

export function hullTextures() {
  if (cached) return cached;
  if (typeof document === 'undefined') return null; // node tests
  const R = rng(9137);
  const height = canvas(), albedo = canvas(), rough = canvas(), glow = canvas();
  const H = height.getContext('2d'), A = albedo.getContext('2d'), M = rough.getContext('2d'), E = glow.getContext('2d');
  H.fillStyle = '#808080'; H.fillRect(0, 0, SIZE, SIZE);
  A.fillStyle = '#d6d6d6'; A.fillRect(0, 0, SIZE, SIZE);
  M.fillStyle = 'rgb(0,110,200)'; M.fillRect(0, 0, SIZE, SIZE);
  E.fillStyle = '#000'; E.fillRect(0, 0, SIZE, SIZE);

  // --- recursive panel split
  const panels = [];
  const split = (x, y, w, h, depth) => {
    const big = w > 70 && h > 70;
    if (depth > 5 || !big || (depth > 2 && R() < 0.22)) { panels.push({ x, y, w, h }); return; }
    if (w > h * (0.7 + R() * 0.6)) {
      const s = Math.round(w * (0.3 + R() * 0.4));
      split(x, y, s, h, depth + 1); split(x + s, y, w - s, h, depth + 1);
    } else {
      const s = Math.round(h * (0.3 + R() * 0.4));
      split(x, y, w, s, depth + 1); split(x, y + s, w, h - s, depth + 1);
    }
  };
  split(0, 0, SIZE, SIZE, 0);

  for (const p of panels) {
    const lift = 118 + Math.floor(R() * 30);
    const tone = 190 + Math.floor(R() * 50);
    const r = 70 + Math.floor(R() * 90), metal = 140 + Math.floor(R() * 100);
    // panel body
    H.fillStyle = `rgb(${lift},${lift},${lift})`;
    H.fillRect(p.x + 3, p.y + 3, p.w - 6, p.h - 6);
    A.fillStyle = `rgb(${tone},${tone},${tone})`;
    A.fillRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
    M.fillStyle = `rgb(0,${r},${metal})`;
    M.fillRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
    // bevelled edge highlight
    H.strokeStyle = `rgb(${lift + 25},${lift + 25},${lift + 25})`;
    H.lineWidth = 2;
    H.strokeRect(p.x + 5, p.y + 5, p.w - 10, p.h - 10);
    // seam (dark groove) around every panel
    A.strokeStyle = 'rgb(55,55,60)';
    A.lineWidth = 3;
    A.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
    H.strokeStyle = 'rgb(20,20,20)';
    H.lineWidth = 4;
    H.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

    const roll = R();
    if (roll < 0.28 && p.w > 60 && p.h > 60) {
      // rivets along the edges
      const step = 16 + Math.floor(R() * 10);
      for (let x = p.x + 12; x < p.x + p.w - 8; x += step) {
        for (const y of [p.y + 10, p.y + p.h - 10]) rivet(H, A, x, y);
      }
    } else if (roll < 0.45 && p.w > 80 && p.h > 50) {
      // vent slots
      const n = 4 + Math.floor(R() * 5);
      const vw = (p.w - 30) / n;
      for (let i = 0; i < n; i++) {
        const x = p.x + 15 + i * vw;
        H.fillStyle = 'rgb(25,25,25)'; H.fillRect(x, p.y + p.h * 0.3, vw * 0.5, p.h * 0.4);
        A.fillStyle = 'rgb(40,40,44)'; A.fillRect(x, p.y + p.h * 0.3, vw * 0.5, p.h * 0.4);
      }
    } else if (roll < 0.58 && p.w > 50 && p.h > 50) {
      // raised inner plate with bolts
      const ix = p.x + p.w * 0.2, iy = p.y + p.h * 0.2, iw = p.w * 0.6, ih = p.h * 0.6;
      H.fillStyle = `rgb(${lift + 30},${lift + 30},${lift + 30})`; H.fillRect(ix, iy, iw, ih);
      H.strokeStyle = 'rgb(40,40,40)'; H.lineWidth = 2; H.strokeRect(ix, iy, iw, ih);
      A.strokeStyle = 'rgb(90,90,96)'; A.lineWidth = 2; A.strokeRect(ix, iy, iw, ih);
      for (const [x, y] of [[ix + 6, iy + 6], [ix + iw - 6, iy + 6], [ix + 6, iy + ih - 6], [ix + iw - 6, iy + ih - 6]]) rivet(H, A, x, y);
    } else if (roll < 0.64 && p.w > 90) {
      // hazard stripes
      A.save();
      A.beginPath(); A.rect(p.x + 4, p.y + p.h - 22, p.w - 8, 14); A.clip();
      for (let x = p.x - 20; x < p.x + p.w + 20; x += 18) {
        A.fillStyle = 'rgb(200,150,40)'; A.beginPath();
        A.moveTo(x, p.y + p.h - 22); A.lineTo(x + 9, p.y + p.h - 22); A.lineTo(x - 5, p.y + p.h - 8); A.lineTo(x - 14, p.y + p.h - 8); A.fill();
      }
      A.restore();
    } else if (roll < 0.7 && p.w > 60 && p.h > 30) {
      // window strip / status light
      const lx = p.x + 10 + R() * (p.w - 40), ly = p.y + 10 + R() * (p.h - 20);
      const col = ['#45f0ff', '#ffb040', '#ff3050'][Math.floor(R() * 3)];
      const n = 1 + Math.floor(R() * 4);
      for (let i = 0; i < n; i++) {
        E.fillStyle = col; E.fillRect(lx + i * 9, ly, 5, 4);
        A.fillStyle = '#202020'; A.fillRect(lx + i * 9 - 1, ly - 1, 7, 6);
      }
    } else if (roll < 0.76 && p.w > 70 && p.h > 40) {
      // stencil marking
      A.fillStyle = 'rgba(40,40,46,0.8)';
      A.font = `bold ${Math.min(26, p.h * 0.35)}px monospace`;
      A.fillText(['X-26', 'RF', '07', 'AX', '3K', 'LAB'][Math.floor(R() * 6)], p.x + 10, p.y + p.h * 0.6);
    }
  }

  // --- wear: grime gradients, scratches, chipped edges
  for (let i = 0; i < 900; i++) {
    const x = R() * SIZE, y = R() * SIZE, r = 2 + R() * 22;
    const g = A.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(30,26,22,${0.05 + R() * 0.12})`);
    g.addColorStop(1, 'rgba(30,26,22,0)');
    A.fillStyle = g; A.fillRect(x - r, y - r, r * 2, r * 2);
    M.fillStyle = `rgba(0,${150 + R() * 80},${60 + R() * 60},0.15)`; M.fillRect(x - r * 0.5, y - r * 0.5, r, r);
  }
  for (let i = 0; i < 240; i++) {
    const x = R() * SIZE, y = R() * SIZE, a = R() * Math.PI, l = 6 + R() * 40;
    A.strokeStyle = `rgba(255,255,255,${0.08 + R() * 0.18})`; A.lineWidth = 1;
    A.beginPath(); A.moveTo(x, y); A.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); A.stroke();
    M.strokeStyle = 'rgba(0,60,255,0.4)'; M.lineWidth = 1;
    M.beginPath(); M.moveTo(x, y); M.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); M.stroke();
  }

  // --- normal map from height (Sobel)
  const hd = H.getImageData(0, 0, SIZE, SIZE).data;
  const nimg = new ImageData(SIZE, SIZE);
  const nd = nimg.data;
  const hAt = (x, y) => hd[(((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)) * 4] / 255;
  const strength = 3.2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (hAt(x + 1, y - 1) + 2 * hAt(x + 1, y) + hAt(x + 1, y + 1)) - (hAt(x - 1, y - 1) + 2 * hAt(x - 1, y) + hAt(x - 1, y + 1));
      const dy = (hAt(x - 1, y + 1) + 2 * hAt(x, y + 1) + hAt(x + 1, y + 1)) - (hAt(x - 1, y - 1) + 2 * hAt(x, y - 1) + hAt(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * SIZE + x) * 4;
      nd[i] = (nx * 0.5 + 0.5) * 255; nd[i + 1] = (ny * 0.5 + 0.5) * 255; nd[i + 2] = (nz * 0.5 + 0.5) * 255; nd[i + 3] = 255;
    }
  }
  const normal = canvas();
  normal.getContext('2d').putImageData(nimg, 0, 0);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  cached = {
    map: tex(albedo, true),
    normalMap: tex(normal, false),
    roughnessMap: tex(rough, false),
    emissiveMap: tex(glow, true),
  };
  return cached;
}

function rivet(H, A, x, y) {
  H.fillStyle = 'rgb(225,225,225)'; H.beginPath(); H.arc(x, y, 2.6, 0, Math.PI * 2); H.fill();
  A.fillStyle = 'rgb(150,150,155)'; A.beginPath(); A.arc(x, y, 2.2, 0, Math.PI * 2); A.fill();
}

/**
 * Box-projected UVs for a non-indexed geometry: each triangle takes the two axes facing it,
 * so texture density is uniform (uvPerMetre) across every part of a merged model.
 */
export function boxUVs(geo, uvPerMetre) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      let u, v;
      if (ax >= ay && ax >= az) { u = p.z; v = p.y; } else if (ay >= az) { u = p.x; v = p.z; } else { u = p.x; v = p.y; }
      uv[(i + k) * 2] = u * uvPerMetre + 0.37;
      uv[(i + k) * 2 + 1] = v * uvPerMetre + 0.61;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

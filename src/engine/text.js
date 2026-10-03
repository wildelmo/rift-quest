import * as THREE from 'three';

// Canvas-rendered text for in-headset UI. Text is drawn with a dark outline so it stays legible
// over any real-world surface the player happens to be looking at.

export const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draws text with outline + glow. opts: size, weight, color, glow, outline, align, italic, spacing */
export function drawText(ctx, text, x, y, opts = {}) {
  const {
    weight = 800, color = '#ffffff', glow = '#33e1ff', outline = 'rgba(0,0,0,0.85)',
    align = 'center', italic = true, spacing = 0.06, outlineWidth = 0.16, baseline = 'middle', fit = 0,
  } = opts;
  let size = opts.size ?? 64;
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * spacing)}px`;
  if (fit > 0) {
    const w = ctx.measureText(text).width;
    if (w > fit) {
      size = Math.floor(size * fit / w);
      ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
    }
  }
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * spacing)}px`;
  ctx.lineJoin = 'round';
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * outlineWidth;
    ctx.strokeText(text, x, y);
  }
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = size * 0.35;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A flat textured quad whose canvas can be redrawn. World size given in metres. */
export class TextPanel {
  constructor(widthM, heightM, pxPerM = 1400, { depthTest = true, renderOrder = 20 } = {}) {
    this.canvas = makeCanvas(Math.ceil(widthM * pxPerM), Math.ceil(heightM * pxPerM));
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthWrite: false, depthTest, toneMapped: false,
      premultipliedAlpha: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), this.material);
    this.mesh.renderOrder = renderOrder;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  commit() {
    this.texture.needsUpdate = true;
  }

  set opacity(v) {
    this.material.opacity = v;
    this.mesh.visible = v > 0.001;
  }
}

/** Cache of small single-line labels (score popups etc.). */
export class LabelCache {
  constructor(limit = 48) {
    this.limit = limit;
    this.map = new Map();
  }

  get(text, color = '#ffffff', glow = '#ff3df0', size = 72) {
    const key = `${text}|${color}|${glow}|${size}`;
    let tex = this.map.get(key);
    if (tex) {
      this.map.delete(key);
      this.map.set(key, tex);
      return tex;
    }
    const c = makeCanvas(512, 128);
    const ctx = c.getContext('2d');
    drawText(ctx, text, 256, 64, { size, color, glow, fit: 480 });
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.aspect = 4;
    this.map.set(key, tex);
    if (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      const t = this.map.get(oldest);
      this.map.delete(oldest);
      // Popups may still reference it for a moment; dispose next tick.
      setTimeout(() => t.dispose(), 3000);
    }
    return tex;
  }
}

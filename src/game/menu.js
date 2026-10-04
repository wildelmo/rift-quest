import * as THREE from 'three';
import { TextPanel, drawText } from '../engine/text.js';

// A pointable in-headset menu: laser pointers come out of the controllers whenever the menu is
// open; pull the trigger on a button to choose it. Used for pause, title and end-of-game.

const W = 0.4;
const ROW = 0.062;
const TITLE_H = 0.09;
const PPM = 1900;

// Slider row layout, as fractions of the panel width: label on the left, bar on the right.
export const SLIDER_BAR = Object.freeze({ x0: 0.4, x1: 0.77 });
const SLIDER_LABEL_X = 0.09;
const SLIDER_PCT_X = 0.925;

/** Maps a horizontal panel coordinate (uv.x, 0..1) to a slider value, clamped to 0..1. */
export function sliderValueAt(u, bar = SLIDER_BAR) {
  const v = (u - bar.x0) / (bar.x1 - bar.x0);
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** Whether a horizontal panel coordinate is on (or just beside) a slider's bar. */
export function onSliderBar(u, bar = SLIDER_BAR) {
  return u >= bar.x0 - 0.04 && u <= bar.x1 + 0.04;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Menu {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.title = '';
    this.hover = -1;
    this.visible = false;
    this.panel = null;
    this.drags = {}; // hand -> index of the slider that hand is dragging
    this.raycaster = new THREE.Raycaster();
    this.lasers = {};
    for (const hand of ['left', 'right', 'mouse']) {
      const geo = new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6, 1, true);
      geo.translate(0, 0.5, 0);
      geo.rotateX(-Math.PI / 2); // along -Z
      const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x66eaff, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
      beam.renderOrder = 50;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false }));
      dot.renderOrder = 51;
      beam.visible = dot.visible = false;
      game.scene.add(beam, dot);
      this.lasers[hand] = { beam, dot };
    }
    this._q = new THREE.Quaternion();
    this._fwd = new THREE.Vector3(0, 0, -1);
  }

  _ensurePanel(rows) {
    const h = TITLE_H + 0.02 + rows * ROW;
    if (this.panel && this.panel.rows === rows) return;
    if (this.panel) this.game.arena.remove(this.panel.mesh);
    this.panel = new TextPanel(W, h, PPM, { renderOrder: 45 });
    this.panel.rows = rows;
    this.game.arena.add(this.panel.mesh);
  }

  /**
   * items: [{ label, action, disabled?, danger? }] or sliders
   * [{ type: 'slider', label, get: () => 0..1, set: (v) => void }]. where: 'center' | 'side'.
   */
  show(title, items, where = 'center') {
    this.title = title;
    this.items = items;
    this._ensurePanel(items.length);
    const m = this.panel.mesh;
    if (where === 'side') m.position.set(0.56, 0.12, -0.36);
    else m.position.set(0, 0.1, -0.42);
    const head = new THREE.Vector3(0, 0.28, 0.42).applyMatrix4(this.game.arena.matrixWorld);
    m.lookAt(head);
    this.visible = true;
    this.hover = -1;
    this.drags = {};
    this._draw();
  }

  hide() {
    this.visible = false;
    this.drags = {};
    if (this.panel) this.panel.opacity = 0;
    for (const l of Object.values(this.lasers)) l.beam.visible = l.dot.visible = false;
  }

  _draw() {
    const p = this.panel;
    const { ctx, w, h } = p;
    p.clear();
    ctx.fillStyle = 'rgba(5,8,20,0.82)';
    roundRect(ctx, 4, 4, w - 8, h - 8, 34);
    ctx.fill();
    ctx.strokeStyle = 'rgba(51,225,255,0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
    const pxRow = ROW * PPM;
    const top = TITLE_H * PPM;
    drawText(ctx, this.title, w / 2, top / 2 + 6, { size: 64, fit: w * 0.85, glow: '#33e1ff', spacing: 0.25 });
    this.items.forEach((it, i) => {
      const y = top + i * pxRow;
      if (it.type === 'slider') { this._drawSlider(it, y, i === this.hover && !it.disabled); return; }
      const hov = i === this.hover && !it.disabled;
      ctx.fillStyle = hov ? 'rgba(51,225,255,0.85)' : 'rgba(255,255,255,0.08)';
      roundRect(ctx, 40, y + 8, w - 80, pxRow - 16, 22);
      ctx.fill();
      ctx.strokeStyle = it.danger ? 'rgba(255,70,90,0.9)' : 'rgba(51,225,255,0.55)';
      ctx.lineWidth = 3;
      ctx.stroke();
      drawText(ctx, it.label, w / 2, y + pxRow / 2 + 2, {
        size: 46, fit: w - 140, italic: false, weight: 900, spacing: 0.12,
        color: it.disabled ? '#5f6b78' : hov ? '#04121a' : it.danger ? '#ff8a96' : '#e8f6ff', glow: hov ? null : it.danger ? '#ff2244' : '#33e1ff',
        outline: hov ? null : 'rgba(0,0,0,0.85)',
      });
    });
    p.commit();
  }

  _drawSlider(it, y, hov) {
    const { ctx, w } = this.panel;
    const pxRow = ROW * PPM;
    const cy = y + pxRow / 2;
    const v = Math.min(1, Math.max(0, it.get()));
    ctx.fillStyle = hov ? 'rgba(51,225,255,0.22)' : 'rgba(255,255,255,0.08)';
    roundRect(ctx, 40, y + 8, w - 80, pxRow - 16, 22);
    ctx.fill();
    ctx.strokeStyle = hov ? 'rgba(51,225,255,0.95)' : 'rgba(51,225,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const dim = it.disabled;
    drawText(ctx, it.label, w * SLIDER_LABEL_X, cy + 2, {
      size: 40, fit: w * (SLIDER_BAR.x0 - SLIDER_LABEL_X - 0.03), align: 'left', italic: false, weight: 900, spacing: 0.1,
      color: dim ? '#5f6b78' : '#e8f6ff', glow: '#33e1ff',
    });
    // track, fill and knob
    const x0 = w * SLIDER_BAR.x0, x1 = w * SLIDER_BAR.x1, th = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, x0, cy - th / 2, x1 - x0, th, th / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(51,225,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const xv = x0 + (x1 - x0) * v;
    if (xv - x0 > 1) {
      ctx.save();
      ctx.shadowColor = '#33e1ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = dim ? '#5f6b78' : '#33e1ff';
      roundRect(ctx, x0, cy - th / 2, Math.max(th, xv - x0), th, th / 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(xv, cy, hov ? 22 : 19, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#33e1ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    drawText(ctx, `${Math.round(v * 100)}%`, w * SLIDER_PCT_X, cy + 2, {
      size: 34, align: 'right', italic: false, weight: 800, spacing: 0.04,
      color: dim ? '#5f6b78' : '#e8f6ff', glow: null,
    });
  }

  /** Moves slider i to the panel coordinate u; ticks every 10% so it can be felt. */
  _setSlider(i, u, hand) {
    const it = this.items[i];
    const v = Math.round(sliderValueAt(u) * 100) / 100;
    const prev = it.get();
    if (v === prev) return false;
    it.set(v);
    if (Math.floor(v * 10 + 1e-6) !== Math.floor(prev * 10 + 1e-6)) {
      this.game.input.haptic(hand, 0.2, 10);
      this.game.sfx.play('ui', null, { vol: 0.3, minGap: 0.07 });
    }
    return true;
  }

  /** World position of the centre of item i (used by automated tests). */
  itemWorldPos(i, out = new THREE.Vector3()) {
    const H = TITLE_H + 0.02 + this.items.length * ROW;
    out.set(0, H / 2 - TITLE_H - ROW * (i + 0.5), 0);
    return this.panel.mesh.localToWorld(out);
  }

  /** Which item a world-space panel hit lands on. */
  _itemAt(uv) {
    const n = this.items.length;
    const H = TITLE_H + 0.02 + n * ROW;
    const fromTop = (1 - uv.y) * H;
    const row = Math.floor((fromTop - TITLE_H) / ROW);
    return fromTop >= TITLE_H && row < n ? row : -1;
  }

  /**
   * pointers: [{ hand, origin: Vector3 (world), quaternion (world), select: bool (edge), hold: bool }]
   * Sliders follow a pointer whose trigger is held on them. Returns true when a button was chosen.
   */
  update(dt, pointers) {
    if (!this.visible) return false;
    this.panel.opacity = Math.min(1, (this.panel.material.opacity || 0) + dt * 6);
    let hover = -1, chosen = null, chooser = null, changed = false;
    const seen = new Set();
    for (const ptr of pointers) {
      const laser = this.lasers[ptr.hand];
      if (!laser) continue;
      seen.add(ptr.hand);
      const dir = this._fwd.set(0, 0, -1).applyQuaternion(ptr.quaternion);
      this.raycaster.set(ptr.origin, dir);
      const hit = this.raycaster.intersectObject(this.panel.mesh, false)[0];
      const len = hit ? hit.distance : 0.6;
      laser.beam.visible = true;
      laser.beam.position.copy(ptr.origin);
      laser.beam.quaternion.copy(ptr.quaternion);
      laser.beam.scale.set(1, 1, len);
      laser.dot.visible = !!hit;
      const pressed = ptr.select || ptr.hold;
      let drag = this.drags[ptr.hand];
      if (drag !== undefined && !pressed) { delete this.drags[ptr.hand]; drag = undefined; }
      if (hit) {
        laser.dot.position.copy(hit.point);
        const idx = this._itemAt(hit.uv);
        if (drag !== undefined) {
          // keep following the trigger even if the ray drifts off the row
          hover = drag;
          changed = this._setSlider(drag, hit.uv.x, ptr.hand) || changed;
        } else if (idx >= 0) {
          hover = idx;
          const it = this.items[idx];
          if (it.disabled) { /* nothing */ } else if (it.type === 'slider') {
            if (pressed && onSliderBar(hit.uv.x)) {
              this.drags[ptr.hand] = idx;
              changed = this._setSlider(idx, hit.uv.x, ptr.hand) || changed;
            }
          } else if (ptr.select) { chosen = it; chooser = ptr.hand; }
        }
      }
    }
    for (const [hand, l] of Object.entries(this.lasers)) if (!seen.has(hand)) l.beam.visible = l.dot.visible = false;
    for (const hand of Object.keys(this.drags)) if (!seen.has(hand)) delete this.drags[hand];
    if (changed && hover === this.hover) this._draw();
    if (hover !== this.hover) {
      this.hover = hover;
      this._draw();
      if (hover >= 0) {
        this.game.sfx.play('ui', null, { vol: 0.35, minGap: 0.04 });
        for (const p of pointers) this.game.input.haptic(p.hand, 0.15, 12);
      }
    }
    if (chosen) {
      this.game.sfx.play('grab', null, { vol: 0.8 });
      this.game.input.haptic(chooser, 0.5, 40);
      chosen.action(chooser);
      return true;
    }
    return false;
  }
}

/**
 * A row of big choice buttons (used for EASY / NORMAL / HARD under the title). Point and pull
 * the trigger to choose; the current choice stays lit.
 */
export class ChoiceBar {
  constructor(game, { width = 0.46, height = 0.075 } = {}) {
    this.game = game;
    this.width = width;
    this.height = height;
    this.choices = [];
    this.current = '';
    this.hover = -1;
    this.visible = false;
    this.panel = new TextPanel(width, height, PPM, { renderOrder: 45 });
    this.panel.opacity = 0;
    game.arena.add(this.panel.mesh);
    this.raycaster = new THREE.Raycaster();
    this._fwd = new THREE.Vector3();
  }

  /** choices: [{ key, label, sub }], onPick(key) */
  show(choices, current, onPick, pos) {
    this.choices = choices;
    this.current = current;
    this.onPick = onPick;
    this.panel.mesh.position.set(...pos);
    const head = new THREE.Vector3(0, 0.28, 0.42).applyMatrix4(this.game.arena.matrixWorld);
    this.panel.mesh.lookAt(head);
    this.visible = true;
    this.hover = -1;
    this._draw();
  }

  hide() {
    this.visible = false;
    this.panel.opacity = 0;
  }

  /** World position of choice i (used by automated tests). */
  itemWorldPos(i, out = new THREE.Vector3()) {
    const n = this.choices.length;
    out.set((-0.5 + (i + 0.5) / n) * this.width, 0, 0);
    return this.panel.mesh.localToWorld(out);
  }

  setCurrent(key) {
    this.current = key;
    if (this.visible) this._draw();
  }

  _draw() {
    const p = this.panel;
    const { ctx, w, h } = p;
    p.clear();
    const n = this.choices.length;
    const gap = 14;
    const bw = (w - gap * (n + 1)) / n;
    this.choices.forEach((c, i) => {
      const x = gap + i * (bw + gap);
      const on = c.key === this.current;
      const hov = i === this.hover;
      ctx.fillStyle = on ? 'rgba(51,225,255,0.9)' : hov ? 'rgba(51,225,255,0.35)' : 'rgba(5,8,20,0.82)';
      roundRect(ctx, x, 6, bw, h - 12, 22);
      ctx.fill();
      ctx.strokeStyle = on ? '#ffffff' : 'rgba(51,225,255,0.7)';
      ctx.lineWidth = on ? 5 : 3;
      ctx.stroke();
      drawText(ctx, c.label, x + bw / 2, h * 0.4, { size: 64, fit: bw - 24, italic: false, weight: 900, spacing: 0.12, color: on ? '#04121a' : '#e8f6ff', glow: on ? null : '#33e1ff', outline: on ? null : 'rgba(0,0,0,0.85)' });
      if (c.sub) drawText(ctx, c.sub, x + bw / 2, h * 0.76, { size: 30, fit: bw - 24, italic: false, weight: 700, spacing: 0.06, color: on ? '#0a2a36' : '#9fdcef', glow: null, outline: null });
    });
    p.commit();
  }

  /** pointers: [{ hand, origin, quaternion, select }]. Returns true when a choice was made. */
  update(dt, pointers) {
    if (!this.visible) return false;
    this.panel.opacity = Math.min(1, (this.panel.material.opacity || 0) + dt * 6);
    let hover = -1, picked = -1, picker = null;
    for (const ptr of pointers) {
      this._fwd.set(0, 0, -1).applyQuaternion(ptr.quaternion);
      this.raycaster.set(ptr.origin, this._fwd);
      const hit = this.raycaster.intersectObject(this.panel.mesh, false)[0];
      if (!hit || !hit.uv) continue;
      const i = Math.min(this.choices.length - 1, Math.floor(hit.uv.x * this.choices.length));
      hover = i;
      if (ptr.select) { picked = i; picker = ptr.hand; }
    }
    if (hover !== this.hover) {
      this.hover = hover;
      this._draw();
      if (hover >= 0) {
        this.game.sfx.play('ui', null, { vol: 0.35, minGap: 0.04 });
        for (const p of pointers) this.game.input.haptic(p.hand, 0.15, 12);
      }
    }
    if (picked >= 0) {
      const c = this.choices[picked];
      this.current = c.key;
      this._draw();
      this.game.sfx.play('grab', null, { vol: 0.8 });
      this.game.input.haptic(picker, 0.5, 40);
      this.onPick && this.onPick(c.key);
      return true;
    }
    return false;
  }
}

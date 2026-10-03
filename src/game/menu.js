import * as THREE from 'three';
import { TextPanel, drawText } from '../engine/text.js';

// A pointable in-headset menu: laser pointers come out of the controllers whenever the menu is
// open; pull the trigger on a button to choose it. Used for pause, title and end-of-game.

const W = 0.4;
const ROW = 0.062;
const TITLE_H = 0.09;
const PPM = 1900;

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
   * items: [{ label, action, disabled? }]. where: 'center' | 'side'.
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
    this._draw();
  }

  hide() {
    this.visible = false;
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
   * pointers: [{ hand, origin: Vector3 (world), quaternion (world), select: bool (edge) }]
   * Returns true when a selection happened.
   */
  update(dt, pointers) {
    if (!this.visible) return false;
    this.panel.opacity = Math.min(1, (this.panel.material.opacity || 0) + dt * 6);
    let hover = -1, chosen = null, chooser = null;
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
      if (hit) {
        laser.dot.position.copy(hit.point);
        const idx = this._itemAt(hit.uv);
        if (idx >= 0) {
          hover = idx;
          if (ptr.select && !this.items[idx].disabled) { chosen = this.items[idx]; chooser = ptr.hand; }
        }
      }
    }
    for (const [hand, l] of Object.entries(this.lasers)) if (!seen.has(hand)) l.beam.visible = l.dot.visible = false;
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

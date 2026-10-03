import * as THREE from 'three';
import { TextPanel, drawText, LabelCache, FONT } from '../engine/text.js';
import { clamp, easeOutBack, easeOutCubic } from '../engine/math.js';

// All in-headset UI. Panels sit in the arena, slightly tilted toward the player's eyes, and
// keep a dark backing so they are legible against whatever real wall is behind them.

const fmt = (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function backing(ctx, w, h, alpha = 0.55, accent = '#33e1ff') {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(6,10,22,${alpha})`);
  g.addColorStop(1, `rgba(10,4,20,${alpha})`);
  ctx.fillStyle = g;
  roundRect(ctx, 4, 4, w - 8, h - 8, Math.min(28, h * 0.2));
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export class Hud {
  constructor(game) {
    this.game = game;
    const arena = game.arena;
    this.root = new THREE.Group();
    arena.add(this.root);
    this.labels = new LabelCache(64);

    // --- top strip
    this.strip = new TextPanel(0.62, 0.075, 1650);
    this.strip.mesh.position.set(0, -0.3, -0.5);
    this.root.add(this.strip.mesh);
    this.stripState = '';
    this.stripTimer = 0;

    // --- boss bar
    this.bossBar = new TextPanel(0.8, 0.065, 1300);
    this.bossBar.mesh.position.set(0, 0.74, -0.98);
    this.bossBar.opacity = 0;
    this.root.add(this.bossBar.mesh);
    this.bossShown = 0;
    this.bossBarState = '';

    // --- banner
    this.banner = new TextPanel(0.9, 0.3, 1300, { depthTest: false, renderOrder: 40 });
    this.banner.mesh.position.set(0, 0.17, -0.7);
    this.banner.opacity = 0;
    this.root.add(this.banner.mesh);
    this.bannerT = 0;
    this.bannerDur = 0;
    this.bannerStyle = null;
    this.bannerData = null;

    // --- center panel (title / pause / results)
    this.panel = new TextPanel(0.62, 0.42, 1500, { renderOrder: 35 });
    this.panel.mesh.position.set(0, 0.16, -0.5);
    this.panel.opacity = 0;
    this.root.add(this.panel.mesh);
    this.panelTarget = 0;
    this.panelKind = null;

    // --- small hint label that floats near the ship
    this.hint = new TextPanel(0.3, 0.04, 1600, { depthTest: false, renderOrder: 41 });
    this.hint.opacity = 0;
    this.root.add(this.hint.mesh);
    this.hintText = '';
    this.hintT = 0;
    this.hintDur = 0;

    // --- wrist display on the off-hand
    this.wrist = new TextPanel(0.1, 0.06, 3000, { renderOrder: 36 });
    this.wrist.opacity = 0;
    game.scene.add(this.wrist.mesh);
    this.wristState = '';

    // --- popups
    this.popups = [];
    this.popupPool = [];

    for (const p of [this.strip, this.bossBar, this.banner, this.panel]) this._tiltToHead(p.mesh);
  }

  _tiltToHead(mesh) {
    // face a nominal head position (arena-local)
    const head = new THREE.Vector3(0, 0.28, 0.42);
    const world = head.clone();
    mesh.lookAt(world.applyMatrix4(this.game.arena.matrixWorld));
    mesh.userData.retilt = true;
  }

  retilt() {
    for (const p of [this.strip, this.bossBar, this.banner, this.panel]) this._tiltToHead(p.mesh);
  }

  // ------------------------------------------------------------------ banner

  /** style: 'wave' | 'clear' | 'warning' | 'boss' | 'info' */
  showBanner(title, subtitle = '', style = 'wave', duration = 2.6) {
    this.bannerT = 0;
    this.bannerDur = duration;
    this.bannerStyle = style;
    this.bannerData = { title, subtitle };
    this._drawBanner(0);
  }

  _drawBanner(t) {
    const p = this.banner;
    const { ctx, w, h } = p;
    const { title, subtitle } = this.bannerData;
    p.clear();
    const style = this.bannerStyle;
    if (style === 'warning') {
      const flash = Math.floor(t * 3) % 2 === 0;
      ctx.fillStyle = 'rgba(40,0,6,0.62)';
      ctx.fillRect(0, h * 0.18, w, h * 0.64);
      // hazard stripes
      const off = (t * 120) % 60;
      for (const y of [h * 0.18, h * 0.76]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, w, h * 0.06);
        ctx.clip();
        ctx.fillStyle = flash ? '#ff2340' : '#7a0010';
        for (let x = -60; x < w + 60; x += 60) {
          ctx.beginPath();
          ctx.moveTo(x + off, y);
          ctx.lineTo(x + 30 + off, y);
          ctx.lineTo(x + off, y + h * 0.06);
          ctx.lineTo(x - 30 + off, y + h * 0.06);
          ctx.fill();
        }
        ctx.restore();
      }
      drawText(ctx, title, w / 2, h * 0.44, { fit: w * 0.9, size: 150, color: flash ? '#ffffff' : '#ff6a7a', glow: '#ff0022', spacing: 0.3 });
      drawText(ctx, subtitle, w / 2, h * 0.67, { fit: w * 0.9, size: 46, color: '#ffd0d6', glow: '#ff2244', spacing: 0.2, italic: false, weight: 700 });
    } else {
      const glow = style === 'clear' ? '#ffd23a' : style === 'boss' ? '#ff3d8a' : '#33e1ff';
      const color = style === 'clear' ? '#fff6d0' : '#ffffff';
      // slanted backing slab
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#05060f';
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.22);
      ctx.lineTo(w * 0.96, h * 0.22);
      ctx.lineTo(w * 0.92, h * 0.8);
      ctx.lineTo(w * 0.04, h * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.22);
      ctx.lineTo(w * 0.96, h * 0.22);
      ctx.moveTo(w * 0.04, h * 0.8);
      ctx.lineTo(w * 0.92, h * 0.8);
      ctx.stroke();
      ctx.restore();
      drawText(ctx, title, w / 2, h * 0.45, { fit: w * 0.8, size: 112, color, glow, spacing: 0.12 });
      if (subtitle) drawText(ctx, subtitle, w / 2, h * 0.67, { fit: w * 0.9, size: 46, color: '#d8f6ff', glow, spacing: 0.25, italic: false, weight: 700 });
    }
    p.commit();
  }

  // ------------------------------------------------------------------ hint

  showHint(text, duration = 3, pos = null) {
    this.hintText = text;
    this.hintT = 0;
    this.hintDur = duration;
    this.hintPos = pos;
    const p = this.hint;
    p.clear();
    p.ctx.fillStyle = 'rgba(4,8,18,0.6)';
    roundRect(p.ctx, 6, 6, p.w - 12, p.h - 12, 20);
    p.ctx.fill();
    drawText(p.ctx, text, p.w / 2, p.h / 2 + 2, { fit: p.w - 50, size: 34, italic: false, weight: 800, spacing: 0.12, glow: '#33e1ff' });
    p.commit();
  }

  // ------------------------------------------------------------------ popups

  popup(text, pos, color = '#ffffff', glow = '#ff3df0', scale = 1) {
    let s = this.popupPool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      s.renderOrder = 42;
    }
    s.material.map = this.labels.get(text, color, glow);
    s.material.opacity = 1;
    s.material.needsUpdate = true;
    s.position.copy(pos);
    s.userData.t = 0;
    s.userData.scale = 0.022 * scale;
    this.root.add(s);
    this.popups.push(s);
  }

  // ------------------------------------------------------------------ panels

  showPanel(kind, data = {}) {
    this.panelKind = kind;
    this.panelData = data;
    this.panelTarget = 1;
    this._drawPanel();
  }

  hidePanel() {
    this.panelTarget = 0;
  }

  _drawPanel() {
    const p = this.panel;
    const { ctx, w, h } = p;
    const d = this.panelData || {};
    p.clear();
    if (this.panelKind === 'title') {
      backing(ctx, w, h, 0.5, '#33e1ff');
      drawText(ctx, 'RIFT', w / 2, h * 0.2, { size: 190, color: '#ffffff', glow: '#ff2d9a', spacing: 0.35 });
      drawText(ctx, 'MIXED REALITY BULLET HELL  ·  STAGE 1: THE GYRE', w / 2, h * 0.37, { fit: w * 0.9, size: 30, italic: false, weight: 700, color: '#bfefff', glow: '#33e1ff', spacing: 0.12 });
      drawText(ctx, 'GRAB THE SHIP', w / 2, h * 0.53, { size: 74, color: '#ffffff', glow: '#33e1ff' });
      const rows = [
        ['GRIP', 'hold the ship — it moves with your hand'],
        ['TRIGGER', 'hold to fire — shots go where the nose points'],
        ['A / X', 'singularity bomb (or off-hand trigger)'],
        ['B / Y', 'menu: resume, restart, sound, exit'],
        ['LET GO', 'pause'],
      ];
      rows.forEach(([k, v], i) => {
        const y = h * 0.66 + i * 46;
        drawText(ctx, k, w * 0.3, y, { size: 30, align: 'right', italic: false, weight: 900, color: '#ffd23a', glow: '#ff9a1a', spacing: 0.1 });
        drawText(ctx, v, w * 0.33, y, { fit: w * 0.64, size: 30, align: 'left', italic: false, weight: 600, color: '#e8f6ff', glow: null, spacing: 0.02 });
      });
      if (d.hiScore) drawText(ctx, `HI-SCORE  ${fmt(d.hiScore)}`, w / 2, h * 0.955, { size: 26, italic: false, weight: 700, color: '#9fe8ff', glow: null, spacing: 0.2 });
    } else if (this.panelKind === 'pause') {
      backing(ctx, w, h * 0.5, 0.55, '#ffd23a');
      drawText(ctx, 'PAUSED', w / 2, h * 0.14, { size: 100, glow: '#ffd23a', spacing: 0.3 });
      drawText(ctx, 'grab the ship to resume', w / 2, h * 0.3, { size: 40, italic: false, weight: 700, color: '#fff2c4', glow: null, spacing: 0.08 });
      drawText(ctx, 'thumbstick click: recentre arena  ·  B/Y: sound on/off', w / 2, h * 0.4, { size: 26, italic: false, weight: 600, color: '#cfe8ff', glow: null, spacing: 0.04 });
    } else if (this.panelKind === 'results' || this.panelKind === 'gameover') {
      const win = this.panelKind === 'results';
      backing(ctx, w, h, 0.62, win ? '#ffd23a' : '#ff3d6a');
      drawText(ctx, win ? 'STAGE CLEAR' : 'GAME OVER', w / 2, h * 0.12, { fit: w * 0.86, size: 110, glow: win ? '#ffd23a' : '#ff2050', spacing: 0.2 });
      if (win) drawText(ctx, 'THE GYRE HAS FALLEN', w / 2, h * 0.25, { size: 34, italic: false, weight: 800, color: '#fff2c4', glow: '#ff9a1a', spacing: 0.3 });
      const rows = d.rows || [];
      rows.forEach(([k, v], i) => {
        const y = h * 0.33 + i * 46;
        drawText(ctx, k, w * 0.12, y, { size: 36, align: 'left', italic: false, weight: 700, color: '#cfe8ff', glow: null, spacing: 0.1 });
        drawText(ctx, v, w * 0.88, y, { size: 40, align: 'right', italic: false, weight: 900, color: '#ffffff', glow: '#33e1ff', spacing: 0.05 });
      });
      const y = h * 0.33 + rows.length * 46 + 22;
      drawText(ctx, `SCORE  ${fmt(d.score || 0)}`, w / 2, y, { size: 64, glow: '#ff2d9a', spacing: 0.08 });
      if (d.newHigh) drawText(ctx, 'NEW HIGH SCORE!', w / 2, y + 56, { size: 34, color: '#ffe066', glow: '#ff9a1a', spacing: 0.2 });
      drawText(ctx, d.prompt || 'GRAB THE SHIP TO PLAY AGAIN', w / 2, h * 0.93, { fit: w * 0.9, size: 36, italic: false, weight: 800, color: '#e8f6ff', glow: '#33e1ff', spacing: 0.12 });
    }
    p.commit();
  }

  // ------------------------------------------------------------------ status

  _drawStrip() {
    const g = this.game;
    const ship = g.ship;
    const st = `${Math.floor(g.score)}|${g.hiScore}|${ship.lives}|${ship.bombs}|${ship.level}|${ship.optionCount}|${ship.shield}|${g.chainMult}|${g.waveLabel}`;
    if (st === this.stripState) return;
    this.stripState = st;
    const p = this.strip;
    const { ctx, w, h } = p;
    p.clear();
    ctx.fillStyle = 'rgba(4,8,18,0.5)';
    roundRect(ctx, 4, 4, w - 8, h - 8, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(51,225,255,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
    drawText(ctx, 'SCORE', 40, h * 0.3, { size: 22, align: 'left', italic: false, weight: 800, color: '#7fdcff', glow: null, spacing: 0.25 });
    drawText(ctx, fmt(g.score), 40, h * 0.66, { size: 50, align: 'left', glow: '#33e1ff', spacing: 0.04 });
    drawText(ctx, `HI ${fmt(Math.max(g.hiScore, g.score))}`, 300, h * 0.3, { size: 22, align: 'left', italic: false, weight: 700, color: '#ffd23a', glow: null, spacing: 0.1 });
    drawText(ctx, g.waveLabel || '', 300, h * 0.68, { fit: 260, size: 30, align: 'left', italic: false, weight: 800, color: '#e8f6ff', glow: null, spacing: 0.15 });
    // chain
    if (g.chainMult > 1) drawText(ctx, `×${g.chainMult}`, w * 0.53, h * 0.52, { size: 60, color: '#ffe066', glow: '#ff7a1a' });
    // lives
    const lx = w * 0.62;
    drawText(ctx, 'SHIPS', lx, h * 0.3, { size: 20, align: 'left', italic: false, weight: 800, color: '#7fdcff', glow: null, spacing: 0.25 });
    for (let i = 0; i < Math.min(ship.lives, 6); i++) {
      const x = lx + 12 + i * 30, y = h * 0.66;
      ctx.fillStyle = '#e9f6ff';
      ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 11, y + 10); ctx.lineTo(x, y + 4); ctx.lineTo(x - 11, y + 10);
      ctx.closePath();
      ctx.fill();
    }
    const bx = w * 0.745;
    drawText(ctx, 'BOMBS', bx, h * 0.3, { size: 20, align: 'left', italic: false, weight: 800, color: '#ff9af5', glow: null, spacing: 0.25 });
    for (let i = 0; i < Math.min(ship.bombs, 6); i++) {
      ctx.fillStyle = '#ff5af0';
      ctx.beginPath();
      ctx.arc(bx + 12 + i * 26, h * 0.66, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // power pips
    const px = w * 0.86;
    drawText(ctx, `PWR ${ship.level}`, px, h * 0.3, { size: 20, align: 'left', italic: false, weight: 800, color: '#ffb36a', glow: null, spacing: 0.1 });
    drawText(ctx, `OPT ${ship.optionCount}${ship.shield ? ' ◈' : ''}`, px, h * 0.68, { fit: w - px - 24, size: 22, align: 'left', italic: false, weight: 800, color: '#ffd23a', glow: null, spacing: 0.06 });
    p.commit();
  }

  _drawBossBar() {
    const g = this.game;
    const b = g.boss;
    if (!b) return;
    const v = clamp(b.barValue, 0, 1);
    const st = `${Math.round(v * 300)}|${b.phaseIndex}|${b.phase}`;
    if (st === this.bossBarState) return;
    this.bossBarState = st;
    const p = this.bossBar;
    const { ctx, w, h } = p;
    p.clear();
    ctx.fillStyle = 'rgba(14,2,10,0.6)';
    roundRect(ctx, 4, 4, w - 8, h - 8, 18);
    ctx.fill();
    drawText(ctx, 'THE GYRE', 26, h / 2, { size: 30, align: 'left', color: '#ffd0e4', glow: '#ff2d7a', spacing: 0.2 });
    const names = ['CROWN', 'LATTICE', 'HEART'];
    const bx = 250, bw = w - bx - 320, by = h * 0.32, bh = h * 0.36;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, by, bw, bh);
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#ff2d7a');
    grad.addColorStop(1, '#ffa31a');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * v, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    names.forEach((n, i) => {
      const active = i === b.phaseIndex;
      const done = i < b.phaseIndex;
      drawText(ctx, n, w - 255 + i * 92, h / 2, { fit: 86, size: 19, align: 'center', italic: false, weight: 900, color: active ? '#ffffff' : done ? '#6a4050' : '#b08090', glow: active ? '#ff2d7a' : null, spacing: 0.05 });
    });
    p.commit();
  }

  _drawWrist() {
    const g = this.game;
    const ship = g.ship;
    const st = `${Math.floor(g.score)}|${ship.lives}|${ship.bombs}|${g.chainMult}`;
    if (st === this.wristState) return;
    this.wristState = st;
    const p = this.wrist;
    const { ctx, w, h } = p;
    p.clear();
    backing(ctx, w, h, 0.65, '#33e1ff');
    drawText(ctx, fmt(g.score), w / 2, h * 0.32, { size: 46, glow: '#33e1ff' });
    drawText(ctx, `SHIPS ${ship.lives}   BOMBS ${ship.bombs}`, w / 2, h * 0.62, { size: 26, italic: false, weight: 800, color: '#e8f6ff', glow: null, spacing: 0.08 });
    drawText(ctx, g.chainMult > 1 ? `CHAIN ×${g.chainMult}` : g.waveLabel || '', w / 2, h * 0.84, { size: 22, italic: false, weight: 800, color: '#ffd23a', glow: null, spacing: 0.1 });
    p.commit();
  }

  /** wristPose: {position, quaternion} world-space or null */
  update(dt, { showStrip, wristPose }) {
    const g = this.game;
    // strip
    this.stripTimer -= dt;
    if (this.stripTimer <= 0) {
      this.stripTimer = 0.1;
      if (showStrip) this._drawStrip();
      if (g.boss && this.bossShown > 0.01) this._drawBossBar();
      if (wristPose) this._drawWrist();
    }
    this.strip.opacity = showStrip ? 1 : 0;
    const bossOn = !!(g.boss && g.boss.root.visible && g.boss.phase !== 'dying');
    this.bossShown += ((bossOn ? 1 : 0) - this.bossShown) * (1 - Math.exp(-4 * dt));
    this.bossBar.opacity = this.bossShown;

    // banner
    if (this.bannerData) {
      this.bannerT += dt;
      const t = this.bannerT;
      const D = this.bannerDur;
      if (this.bannerStyle === 'warning') this._drawBanner(t);
      const inK = easeOutBack(clamp(t / 0.35, 0, 1));
      const outK = clamp((D - t) / 0.4, 0, 1);
      this.banner.mesh.scale.set(0.2 + 0.8 * inK, Math.max(0.01, inK) * (0.6 + 0.4 * outK), 1);
      this.banner.opacity = Math.min(1, t / 0.12) * outK * (g.state === 'paused' ? 0 : 1);
      if (t > D) this.bannerData = null;
    } else this.banner.opacity = 0;

    // panel
    const cur = this.panel.material.opacity || 0;
    const next = cur + (this.panelTarget - cur) * (1 - Math.exp(-7 * dt));
    this.panel.opacity = next < 0.01 && this.panelTarget === 0 ? 0 : next;
    const k = easeOutCubic(next);
    this.panel.mesh.scale.setScalar(0.92 + 0.08 * k);

    // hint near ship
    if (this.hintDur > 0) {
      this.hintT += dt;
      const t = this.hintT;
      const a = Math.min(1, t / 0.2) * clamp((this.hintDur - t) / 0.4, 0, 1);
      this.hint.opacity = a;
      const anchor = this.hintPos || g.ship.pos;
      this.hint.mesh.position.set(anchor.x, anchor.y + 0.075, anchor.z);
      this.hint.mesh.lookAt(g.headWorld);
      if (t > this.hintDur) this.hintDur = 0;
    } else this.hint.opacity = 0;

    // wrist
    if (wristPose) {
      // float just above the back of the off-hand wrist, always turned toward the eyes
      const m = this.wrist.mesh;
      m.position.set(0, 0.045, 0.07).applyQuaternion(wristPose.quaternion).add(wristPose.position);
      m.lookAt(g.headWorld);
      this.wrist.opacity = 1;
    } else this.wrist.opacity = 0;

    // popups
    let w = 0;
    for (const s of this.popups) {
      s.userData.t += dt;
      const t = s.userData.t;
      if (t > 0.9) {
        this.root.remove(s);
        this.popupPool.push(s);
        continue;
      }
      s.position.y += dt * 0.06;
      const sc = s.userData.scale * (t < 0.08 ? 0.6 + 5 * t : 1);
      s.scale.set(sc * 4, sc, 1);
      s.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.3;
      this.popups[w++] = s;
    }
    this.popups.length = w;
  }
}

export { fmt, FONT };

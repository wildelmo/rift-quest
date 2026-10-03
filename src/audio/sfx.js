// Procedural sound design. Every effect is synthesised once into an AudioBuffer with an
// OfflineAudioContext, then played through HRTF panners so explosions, lasers and the boss
// are heard where they are in the room.

const SR = 44100;

function noiseBuffer(ctx, seconds) {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = (seed / 4294967296) * 2 - 1;
  }
  return buf;
}

function env(param, t0, points) {
  // points: [[time, value], ...] relative to t0; uses linear ramps, exp-ish via many points
  param.setValueAtTime(points[0][1], t0 + points[0][0]);
  for (let i = 1; i < points.length; i++) param.linearRampToValueAtTime(points[i][1], t0 + points[i][0]);
}

function expEnv(param, t0, from, to, dur) {
  param.setValueAtTime(Math.max(from, 1e-4), t0);
  param.exponentialRampToValueAtTime(Math.max(to, 1e-4), t0 + dur);
}

function distortionCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

function tone(ctx, out, { type = 'sine', f0, f1 = f0, t = 0, dur, gain = 0.3, attack = 0.002, curve = 'exp', detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  if (curve === 'exp') expEnv(o.frequency, t, f0, f1, dur);
  else { o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur); }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  return g;
}

function noise(ctx, out, { t = 0, dur, gain = 0.3, attack = 0.002, filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, release = 'exp' }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  expEnv(f.frequency, t, f0, f1, dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  if (release === 'exp') g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  else g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.05);
  return g;
}

const RECIPES = {
  shot: [0.09, (c, o) => {
    tone(c, o, { type: 'square', f0: 1900, f1: 650, dur: 0.07, gain: 0.16 });
    tone(c, o, { type: 'triangle', f0: 3800, f1: 1400, dur: 0.05, gain: 0.1 });
  }],
  hit: [0.06, (c, o) => {
    tone(c, o, { f0: 2700, f1: 2300, dur: 0.04, gain: 0.25 });
    tone(c, o, { f0: 4100, f1: 3600, dur: 0.03, gain: 0.15 });
    noise(c, o, { dur: 0.02, gain: 0.25, filter: 'highpass', f0: 3000 });
  }],
  tink: [0.3, (c, o) => {
    tone(c, o, { f0: 3150, dur: 0.25, gain: 0.18 });
    tone(c, o, { f0: 4730, dur: 0.18, gain: 0.12 });
    tone(c, o, { f0: 6890, dur: 0.12, gain: 0.08 });
    noise(c, o, { dur: 0.015, gain: 0.3, filter: 'highpass', f0: 5000 });
  }],
  pop: [0.45, (c, o) => {
    noise(c, o, { dur: 0.32, gain: 0.55, f0: 2600, f1: 380, q: 0.7 });
    tone(c, o, { f0: 220, f1: 45, dur: 0.22, gain: 0.6 });
    for (let i = 0; i < 6; i++) noise(c, o, { t: 0.04 + i * 0.045 + Math.random() * 0.02, dur: 0.012, gain: 0.25, filter: 'highpass', f0: 2500 });
  }],
  boom: [1.3, (c, o) => {
    const ws = c.createWaveShaper();
    ws.curve = distortionCurve(6);
    ws.connect(o);
    noise(c, ws, { dur: 1.1, gain: 0.7, filter: 'lowpass', f0: 4000, f1: 160, q: 0.5 });
    tone(c, ws, { f0: 140, f1: 32, dur: 0.7, gain: 0.9 });
    for (let i = 0; i < 10; i++) noise(c, o, { t: 0.05 + Math.random() * 0.6, dur: 0.02, gain: 0.18, filter: 'highpass', f0: 2000 });
  }],
  bigboom: [3.4, (c, o) => {
    const ws = c.createWaveShaper();
    ws.curve = distortionCurve(10);
    ws.connect(o);
    noise(c, ws, { dur: 3.2, gain: 0.8, filter: 'lowpass', f0: 6000, f1: 90, q: 0.4 });
    tone(c, ws, { f0: 90, f1: 22, dur: 2.2, gain: 1.0 });
    tone(c, ws, { type: 'sawtooth', f0: 220, f1: 30, dur: 1.6, gain: 0.25 });
    for (let i = 0; i < 40; i++) noise(c, o, { t: 0.05 + Math.random() * 2.4, dur: 0.015 + Math.random() * 0.03, gain: 0.12 + Math.random() * 0.15, filter: 'highpass', f0: 1500 + Math.random() * 3000 });
  }],
  graze: [0.03, (c, o) => {
    tone(c, o, { f0: 6200, f1: 5200, dur: 0.018, gain: 0.12 });
    tone(c, o, { f0: 9300, dur: 0.012, gain: 0.06 });
  }],
  powerup: [0.7, (c, o) => {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      tone(c, o, { type: 'square', f0: f, dur: 0.12, t: i * 0.055, gain: 0.12 });
      tone(c, o, { type: 'sine', f0: f * 2, dur: 0.25, t: i * 0.055, gain: 0.07 });
    });
  }],
  drop: [0.8, (c, o) => {
    tone(c, o, { type: 'triangle', f0: 880, dur: 0.6, gain: 0.25 });
    tone(c, o, { type: 'sine', f0: 1320, dur: 0.5, t: 0.06, gain: 0.18 });
    tone(c, o, { type: 'sine', f0: 1760, dur: 0.4, t: 0.12, gain: 0.12 });
  }],
  wave: [1.1, (c, o) => {
    const ws = c.createWaveShaper();
    ws.curve = distortionCurve(4);
    ws.connect(o);
    tone(c, ws, { type: 'sawtooth', f0: 420, f1: 60, dur: 0.75, gain: 0.35 });
    noise(c, ws, { dur: 0.9, gain: 0.6, f0: 6000, f1: 300, q: 1.2 });
    tone(c, ws, { f0: 110, f1: 30, dur: 0.6, gain: 0.8 });
  }],
  bomb: [2.6, (c, o) => {
    const ws = c.createWaveShaper();
    ws.curve = distortionCurve(5);
    ws.connect(o);
    // reverse swell
    const g = noise(c, o, { dur: 0.45, gain: 0.5, attack: 0.4, filter: 'bandpass', f0: 400, f1: 4000, q: 0.8, release: 'lin' });
    void g;
    noise(c, ws, { t: 0.42, dur: 2.0, gain: 0.8, filter: 'lowpass', f0: 5000, f1: 120, q: 0.4 });
    tone(c, ws, { t: 0.42, f0: 160, f1: 25, dur: 1.4, gain: 0.9 });
    for (let i = 0; i < 6; i++) tone(c, o, { t: 0.45 + i * 0.03, f0: 1200 + i * 400, f1: 3000 + i * 600, dur: 1.2, gain: 0.04 });
  }],
  death: [1.5, (c, o) => {
    const ws = c.createWaveShaper();
    ws.curve = distortionCurve(12);
    ws.connect(o);
    noise(c, ws, { dur: 0.9, gain: 0.7, filter: 'lowpass', f0: 3000, f1: 200 });
    tone(c, ws, { type: 'sawtooth', f0: 600, f1: 40, dur: 1.2, gain: 0.35 });
    tone(c, o, { type: 'square', f0: 1200, f1: 80, dur: 0.8, gain: 0.08 });
  }],
  warning: [1.25, (c, o) => {
    for (let k = 0; k < 2; k++) {
      const t = k * 0.6;
      for (const [f, ty, g] of [[233, 'sawtooth', 0.22], [466, 'square', 0.1], [117, 'sawtooth', 0.2]]) {
        const osc = c.createOscillator();
        osc.type = ty;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 1.06, t + 0.45);
        const gg = c.createGain();
        env(gg.gain, t, [[0, 0], [0.03, g], [0.4, g], [0.5, 0]]);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        osc.connect(lp).connect(gg).connect(o);
        osc.start(t);
        osc.stop(t + 0.55);
      }
    }
  }],
  laserCharge: [0.9, (c, o) => {
    tone(c, o, { f0: 260, f1: 2200, dur: 0.85, gain: 0.16, attack: 0.6, curve: 'exp' });
    tone(c, o, { type: 'square', f0: 130, f1: 1100, dur: 0.85, gain: 0.05, attack: 0.6 });
  }],
  laserHum: [1.0, (c, o) => {
    // loopable: integer cycles of 55Hz family
    for (const [f, ty, g] of [[110, 'sawtooth', 0.18], [165, 'sawtooth', 0.12], [55, 'square', 0.12], [880, 'sine', 0.04]]) {
      const osc = c.createOscillator();
      osc.type = ty;
      osc.frequency.value = f;
      const gg = c.createGain();
      gg.gain.value = g;
      osc.connect(gg).connect(o);
      osc.start(0);
      osc.stop(1.0);
    }
  }],
  enemyShot: [0.12, (c, o) => {
    tone(c, o, { f0: 1100, f1: 420, dur: 0.09, gain: 0.12 });
  }],
  enemyShotBig: [0.25, (c, o) => {
    tone(c, o, { type: 'triangle', f0: 600, f1: 160, dur: 0.2, gain: 0.25 });
    noise(c, o, { dur: 0.1, gain: 0.12, f0: 1500, f1: 400 });
  }],
  rift: [2.8, (c, o) => {
    noise(c, o, { dur: 2.4, gain: 0.55, attack: 0.9, filter: 'lowpass', f0: 200, f1: 900, q: 2, release: 'lin' });
    tone(c, o, { f0: 48, f1: 38, dur: 2.5, gain: 0.6, attack: 0.6 });
    for (let i = 0; i < 5; i++) tone(c, o, { t: 0.2 + i * 0.25, f0: 2600 - i * 300, f1: 500, dur: 1.2, gain: 0.05 });
  }],
  shield: [0.7, (c, o) => {
    for (const [f, g] of [[1200, 0.12], [1800, 0.09], [2400, 0.07], [3600, 0.04]]) tone(c, o, { f0: f, f1: f * 1.02, dur: 0.6, gain: g, attack: 0.02 });
    noise(c, o, { dur: 0.4, gain: 0.08, filter: 'highpass', f0: 7000 });
  }],
  shieldBreak: [0.8, (c, o) => {
    for (let i = 0; i < 14; i++) tone(c, o, { t: Math.random() * 0.3, f0: 2000 + Math.random() * 6000, dur: 0.15 + Math.random() * 0.3, gain: 0.07 });
    noise(c, o, { dur: 0.5, gain: 0.35, filter: 'highpass', f0: 3000, f1: 1200 });
  }],
  ui: [0.08, (c, o) => {
    tone(c, o, { type: 'square', f0: 1320, dur: 0.05, gain: 0.1 });
    tone(c, o, { type: 'square', f0: 1980, t: 0.03, dur: 0.04, gain: 0.08 });
  }],
  grab: [0.25, (c, o) => {
    tone(c, o, { type: 'triangle', f0: 400, f1: 900, dur: 0.12, gain: 0.25 });
    tone(c, o, { f0: 1800, t: 0.06, dur: 0.15, gain: 0.12 });
  }],
  release: [0.25, (c, o) => {
    tone(c, o, { type: 'triangle', f0: 900, f1: 380, dur: 0.18, gain: 0.22 });
  }],
  coin: [0.07, (c, o) => {
    tone(c, o, { f0: 1760, dur: 0.05, gain: 0.08 });
    tone(c, o, { f0: 2640, t: 0.02, dur: 0.04, gain: 0.06 });
  }],
  extend: [0.9, (c, o) => {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(c, o, { type: 'square', f0: f, t: i * 0.08, dur: 0.2, gain: 0.1 }));
  }],
  armorBreak: [0.9, (c, o) => {
    const ws = c.createWaveShaper();
    ws.curve = distortionCurve(8);
    ws.connect(o);
    noise(c, ws, { dur: 0.6, gain: 0.6, filter: 'bandpass', f0: 1800, f1: 300, q: 0.6 });
    for (let i = 0; i < 8; i++) tone(c, o, { t: Math.random() * 0.2, f0: 900 + Math.random() * 2500, dur: 0.3, gain: 0.06 });
    tone(c, ws, { f0: 180, f1: 40, dur: 0.5, gain: 0.7 });
  }],
  thrum: [1.6, (c, o) => {
    // low mechanical pulse for boss presence
    tone(c, o, { type: 'sawtooth', f0: 55, f1: 50, dur: 1.4, gain: 0.25, attack: 0.3 });
    noise(c, o, { dur: 1.2, gain: 0.2, filter: 'lowpass', f0: 250, f1: 120, attack: 0.3 });
  }],
};

const LIMITS = { shot: 3, hit: 4, tink: 3, graze: 3, coin: 4, enemyShot: 3, enemyShotBig: 3, pop: 6 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.active = {};
    this.lastPlay = {};
    this.volume = 1;
  }

  /** Synthesises every buffer. Safe to call before a user gesture. */
  async prepare() {
    const entries = Object.entries(RECIPES);
    await Promise.all(entries.map(async ([name, [dur, fn]]) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
      const out = ctx.createGain();
      out.connect(ctx.destination);
      fn(ctx, out);
      const buf = await ctx.startRendering();
      // normalise anything that clips so layered explosions stay clean
      const d = buf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      if (peak > 0.95) for (let i = 0; i < d.length; i++) d[i] *= 0.95 / peak;
      this.buffers[name] = buf;
    }));
  }

  /** Must be called from a user gesture. */
  attach(ctx, destination, reverbSend) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(destination);
    this.reverbSend = reverbSend;
    this.ready = true;
  }

  updateListener(m) {
    // m: THREE.Matrix4 world matrix of the head
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const e = m.elements;
    const px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(px, t); L.positionY.setValueAtTime(py, t); L.positionZ.setValueAtTime(pz, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t); L.upY.setValueAtTime(uy, t); L.upZ.setValueAtTime(uz, t);
    } else {
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 0.6;
    p.maxDistance = 30;
    p.rolloffFactor = 0.7;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  /**
   * Play a buffer. pos is a world-space {x,y,z} (omit for head-locked).
   * opts: vol, rate, rateJitter, reverb (0..1), minGap seconds
   */
  play(name, pos = null, opts = {}) {
    if (!this.ready || !this.buffers[name]) return null;
    const now = this.ctx.currentTime;
    const minGap = opts.minGap ?? 0.025;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return null;
    const limit = LIMITS[name] ?? 8;
    if ((this.active[name] || 0) >= limit) return null;
    this.lastPlay[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    const jitter = opts.rateJitter ?? 0.04;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);
    const g = this.ctx.createGain();
    g.gain.value = (opts.vol ?? 1) * this.volume;
    src.connect(g);
    let tail = g;
    if (pos) {
      const p = this._panner(pos);
      g.connect(p);
      tail = p;
    }
    tail.connect(this.out);
    const rv = opts.reverb ?? 0.15;
    if (rv > 0 && this.reverbSend) {
      const s = this.ctx.createGain();
      s.gain.value = rv;
      tail.connect(s).connect(this.reverbSend);
    }
    this.active[name] = (this.active[name] || 0) + 1;
    src.onended = () => {
      this.active[name]--;
      try { tail.disconnect(); } catch { /* already gone */ }
    };
    if (opts.loop) src.loop = true;
    src.start(now + (opts.delay ?? 0));
    return { src, gain: g, panner: pos ? tail : null };
  }

  /** Start a looping sound and return a handle with setPos / setVol / stop. */
  loop(name, pos, vol = 1) {
    const h = this.play(name, pos, { loop: true, vol: 0, rateJitter: 0, minGap: 0 });
    if (!h) return null;
    const ctx = this.ctx;
    h.gain.gain.setTargetAtTime(vol * this.volume, ctx.currentTime, 0.05);
    return {
      setPos(p) {
        if (!h.panner) return;
        if (h.panner.positionX) {
          h.panner.positionX.value = p.x; h.panner.positionY.value = p.y; h.panner.positionZ.value = p.z;
        }
      },
      setVol(v) { h.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
      setRate(r) { h.src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.05); },
      stop() {
        h.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
        h.src.stop(ctx.currentTime + 0.3);
      },
    };
  }

  /** Live oscillator for the charge shot: returns {set(charge), stop()} */
  chargeTone() {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.out);
    const t = ctx.currentTime;
    o1.start(t);
    o2.start(t);
    let full = false;
    return {
      set: (c) => {
        const now = ctx.currentTime;
        o1.frequency.setTargetAtTime(90 + c * 260, now, 0.03);
        o2.frequency.setTargetAtTime(180 + c * 520 + (c >= 1 ? Math.sin(now * 60) * 30 : 0), now, 0.03);
        lp.frequency.setTargetAtTime(300 + c * 3200, now, 0.03);
        g.gain.setTargetAtTime(0.03 + c * 0.07, now, 0.05);
        if (c >= 1 && !full) {
          full = true;
          this.play('coin', null, { vol: 1.4, rate: 0.75 });
        }
      },
      stop: () => {
        const now = ctx.currentTime;
        g.gain.setTargetAtTime(0, now, 0.03);
        o1.stop(now + 0.2);
        o2.stop(now + 0.2);
      },
    };
  }
}

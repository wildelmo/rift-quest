import { Sfx } from './sfx.js';
import { Music } from './music.js';

// A small, cheap room reverb built only from feed-forward echo taps (a convolver costs the
// Quest's audio thread far more): there is no feedback loop anywhere,
// so it can never ring on by itself, whatever the browser's filter or delay maths does.
// (The earlier comb-filter reverb fed back into itself; on the Quest it could run away into a
// screech that kept going after the music stopped.)
const TAPS = [0.019, 0.027, 0.034, 0.043, 0.052, 0.064, 0.077, 0.091, 0.108, 0.127, 0.149, 0.174, 0.203, 0.236, 0.274, 0.318];
export function makeReverb(ctx, rt60 = 1.0) {
  const input = ctx.createGain();
  const pre = ctx.createBiquadFilter();
  pre.type = 'lowpass';
  pre.frequency.value = 4200;
  input.connect(pre);
  const merger = ctx.createChannelMerger(2);
  let energy = 0;
  TAPS.forEach((dt, i) => {
    const d = ctx.createDelay(0.5);
    d.delayTime.value = dt;
    const g = ctx.createGain();
    // decays 60 dB over rt60; alternate taps flip sign and side for a wider, less metallic tail
    const a = Math.pow(10, (-3 * dt) / rt60) * (i % 3 === 2 ? -1 : 1);
    g.gain.value = a;
    energy += a * a;
    pre.connect(d).connect(g).connect(merger, 0, i % 2);
  });
  const out = ctx.createGain();
  // per side about the same tail energy as the old reverb (whose level was matched by ear)
  out.gain.value = Math.min(0.2, Math.sqrt(0.028 / (energy / 2)));
  merger.connect(out);
  return { input, out };
}

/** Owns the AudioContext, master chain and shared reverb. */
export class AudioEngine {
  constructor() {
    this.sfx = new Sfx();
    this.music = new Music();
    this.ctx = null;
    this.preparing = this.sfx.prepare().catch((e) => console.warn('sfx prepare failed', e));
    // the soundtrack renders in the background; the live sequencer covers until it is ready
    this.musicReady = this.preparing.then(() => this.music.prerender());
  }

  /** Call from a user gesture (button press). */
  async start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    // 'balanced' gives the Quest's audio thread a larger buffer: no dropouts when the fight gets busy
    this.ctx = new Ctx({ latencyHint: 'balanced' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    // brick-wall-ish limiter on the master so stacked explosions never clip into static
    comp.threshold.value = -12;
    comp.knee.value = 4;
    comp.ratio.value = 14;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    const reverb = makeReverb(ctx);
    reverb.out.connect(this.master);
    this.reverb = reverb;
    this._applyGate();
    this.sfx.attach(ctx, this.master, reverb.input);
    this.music.attach(ctx, this.master, reverb.input);
    if (ctx.state !== 'running') await ctx.resume();
    await this.preparing;
  }

  /**
   * Sound off (or both sliders at zero) closes the master itself, after every bus and the
   * reverb, so nothing at all can reach the speakers. Safe to call before start().
   */
  setSilent(silent) {
    this.silent = !!silent;
    this._applyGate();
  }

  _applyGate() {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.silent ? 0 : 0.9, t, 0.03);
  }

  tick() {
    this.music.tick();
  }
}

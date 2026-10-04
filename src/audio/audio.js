import { Sfx } from './sfx.js';
import { Music } from './music.js';

/**
 * A cheap room reverb: six damped feedback-delay combs split across left and right. A
 * convolution reverb sounds a little richer but costs the Quest's audio thread far more.
 */
function makeReverb(ctx, rt60 = 1.2) {
  const input = ctx.createGain();
  const pre = ctx.createBiquadFilter();
  pre.type = 'lowpass';
  pre.frequency.value = 5000;
  input.connect(pre);
  const merger = ctx.createChannelMerger(2);
  [0.0297, 0.0371, 0.0411, 0.0437, 0.0513, 0.0571].forEach((dt, i) => {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = dt;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3200;
    const fb = ctx.createGain();
    fb.gain.value = Math.pow(10, (-3 * dt) / rt60);
    pre.connect(d);
    d.connect(damp).connect(fb).connect(d);
    damp.connect(merger, 0, i % 2);
  });
  const out = ctx.createGain();
  out.gain.value = 0.06; // matched by ear-level energy to the old convolution reverb
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
    this.sfx.attach(ctx, this.master, reverb.input);
    this.music.attach(ctx, this.master, reverb.input);
    if (ctx.state !== 'running') await ctx.resume();
    await this.preparing;
  }

  tick() {
    this.music.tick();
  }
}

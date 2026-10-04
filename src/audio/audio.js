import { Sfx } from './sfx.js';
import { Music } from './music.js';

function makeImpulse(ctx, seconds = 1.3, decay = 3.0) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Owns the AudioContext, master chain and shared reverb. */
export class AudioEngine {
  constructor() {
    this.sfx = new Sfx();
    this.music = new Music();
    this.ctx = null;
    this.preparing = this.sfx.prepare().catch((e) => console.warn('sfx prepare failed', e));
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
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx);
    const rvGain = ctx.createGain();
    rvGain.gain.value = 0.5;
    reverb.connect(rvGain).connect(this.master);
    this.sfx.attach(ctx, this.master, reverb);
    this.music.attach(ctx, this.master, reverb);
    if (ctx.state !== 'running') await ctx.resume();
    await this.preparing;
  }

  tick() {
    this.music.tick();
  }
}

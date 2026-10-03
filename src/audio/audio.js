import { Sfx } from './sfx.js';
import { Music } from './music.js';

function makeImpulse(ctx, seconds = 2.4, decay = 3.2) {
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
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
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

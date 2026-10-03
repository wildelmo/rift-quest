export class Sound {
  constructor() { this.enabled = true; this.step = 0; this.nextBeat = 0; this.lastShot = 0; }
  async start() {
    if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = .25; this.master.connect(this.ctx.destination); }
    await this.ctx.resume(); this.nextBeat = this.ctx.currentTime;
  }
  tone(freq, duration, type = 'sine', volume = .2, endFreq = freq, pan = 0) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), stereo = this.ctx.createStereoPanner();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    gain.gain.setValueAtTime(.001, t); gain.gain.linearRampToValueAtTime(volume, t + .008); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    stereo.pan.value = Math.max(-.8, Math.min(.8, pan)); osc.connect(gain).connect(stereo).connect(this.master); osc.start(t); osc.stop(t + duration + .01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); stereo.disconnect(); };
  }
  event(e) {
    if (!this.ctx) return;
    if (e.type === 'shoot' && this.ctx.currentTime - this.lastShot > .09) { this.lastShot = this.ctx.currentTime; this.tone(640, .07, 'square', .065, 220, e.x / 9); }
    if (e.type === 'kill') this.tone(e.boss ? 85 : 160, e.boss ? 1.2 : .18, 'sawtooth', .2, 24, (e.x || 0) / 9);
    if (e.type === 'pickup') { this.tone(520, .2, 'sine', .3, 1040); this.tone(780, .35, 'triangle', .15, 1560); }
    if (e.type === 'hit') this.tone(110, .35, 'sawtooth', .35, 30);
    if (e.type === 'charge' || e.type === 'laser') this.tone(90, .7, 'sawtooth', .25, 900);
    if (e.type === 'bomb') { this.tone(60, 1.2, 'sawtooth', .35, 22); this.tone(1000, .7, 'triangle', .1, 30); }
    if (e.type === 'boss') this.tone(55, 2.2, 'sawtooth', .2, 41);
  }
  update(active, boss) {
    if (!this.ctx || !active || !this.enabled) return;
    const t = this.ctx.currentTime; if (t < this.nextBeat) return;
    this.nextBeat = t + (boss ? .19 : .23); const notes = [55, 55, 82.41, 65.41, 55, 110, 73.42, 65.41];
    this.tone(notes[this.step % 8], .17, 'triangle', .12);
    if (this.step % 4 === 0) this.tone(110, .13, 'sine', .25, 30);
    if (this.step % 2 === 0) this.tone(3000, .025, 'square', .012, 1200);
    if (this.step % 8 === 6) this.tone(notes[this.step % 8] * 8, .5, 'sine', .045, notes[this.step % 8] * 8, .6);
    this.step++;
  }
}

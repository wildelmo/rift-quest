// A small synthwave sequencer. Songs are authored as chord progressions plus a lead melody,
// and arrangements turn layers on and off as the fight intensifies.
//
// Playing the sequencer live means building a dozen audio nodes per note, scheduled from the
// render loop. On the Quest that churn (plus frame hitches delaying the scheduler) is what made
// the music crackle late in the boss fight. So at load each song is rendered once, offline, into
// one looping multichannel buffer with a channel per layer ("stems"). Gameplay then plays a
// single looping source per song and only moves gain knobs. The live sequencer remains as the
// fallback for the first seconds before the stems are ready, and for jingles.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Melody notes: [step (16ths within bar), midi, length in 16ths]
const STAGE = {
  bpm: 138,
  chords: [
    { root: 45, tones: [57, 60, 64, 69] }, // Am
    { root: 41, tones: [57, 60, 65, 69] }, // F
    { root: 48, tones: [55, 60, 64, 67] }, // C
    { root: 43, tones: [55, 59, 62, 67] }, // G
  ],
  lead: [
    [[0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 81, 4]],
    [[0, 79, 3], [3, 77, 1], [4, 76, 2], [6, 77, 2], [8, 72, 6], [14, 69, 2]],
    [[0, 76, 3], [3, 79, 1], [4, 84, 4], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 6], [14, 81, 1], [15, 83, 1]],
    [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 81, 2], [8, 84, 4], [12, 83, 2], [14, 81, 2]],
    [[0, 81, 4], [4, 77, 2], [6, 81, 2], [8, 84, 4], [12, 86, 4]],
    [[0, 88, 6], [6, 86, 2], [8, 84, 2], [10, 83, 2], [12, 84, 4]],
    [[0, 83, 4], [4, 79, 4], [8, 86, 8]],
  ],
  bassPattern: [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12], // offsets on 8ths / 16ths
  arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2, 0, 2],
};

const BOSS = {
  bpm: 152,
  chords: [
    { root: 38, tones: [62, 65, 69, 74] }, // Dm
    { root: 34, tones: [58, 62, 65, 70] }, // Bb
    { root: 36, tones: [60, 64, 67, 72] }, // C
    { root: 33, tones: [57, 61, 64, 69] }, // A
  ],
  lead: [
    [[0, 74, 1], [2, 74, 1], [3, 77, 1], [4, 74, 1], [6, 81, 2], [8, 79, 1], [9, 77, 1], [10, 76, 2], [12, 74, 1], [14, 77, 2]],
    [[0, 74, 1], [2, 74, 1], [3, 77, 1], [4, 82, 2], [6, 81, 2], [8, 77, 4], [12, 74, 4]],
    [[0, 76, 1], [2, 76, 1], [3, 79, 1], [4, 84, 2], [6, 82, 2], [8, 79, 2], [10, 76, 2], [12, 72, 4]],
    [[0, 73, 2], [2, 76, 2], [4, 81, 2], [6, 85, 2], [8, 88, 4], [12, 86, 2], [14, 85, 2]],
  ],
  bassPattern: [0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12],
  arp: [0, 2, 1, 3, 0, 2, 1, 3, 3, 2, 1, 0, 3, 2, 1, 2],
};

// Layers: pad, arp, bass, kick, snare, hat, lead, toms
export const ARRANGEMENTS = {
  silent: {},
  title: { pad: 0.7, arp: 0.35 },
  breather: { pad: 0.8, arp: 0.5, hat: 0.4, bass: 0.35 },
  build: { pad: 0.4, arp: 0.7, hat: 0.7, bass: 0.8, kick: 0.8 },
  wave: { pad: 0.25, arp: 0.6, hat: 0.8, bass: 1, kick: 1, snare: 1 },
  waveLead: { pad: 0.25, arp: 0.5, hat: 0.8, bass: 1, kick: 1, snare: 1, lead: 0.9 },
  bossIntro: { pad: 0.9, bass: 0.6, toms: 0.8 },
  boss: { arp: 0.6, hat: 0.9, bass: 1, kick: 1, snare: 1, lead: 0.85, toms: 0.5 },
  bossRage: { arp: 0.8, hat: 1, bass: 1, kick: 1, snare: 1, lead: 1, toms: 0.9, pad: 0.3 },
};

const STEMS = ['pad', 'arp', 'bass', 'kick', 'snare', 'hat', 'lead', 'toms'];
const DUCK_CH = STEMS.length; // extra channel: the kick's sidechain envelope, stored as (gain - 1)
const STEM_RATE = 32000;
// Layers that pump with the kick, and how much of each layer feeds the reverb.
const DUCKED = new Set(['pad', 'bass']);
const REVERB_SEND = { pad: 1, lead: 1, snare: 0.35 };
const LAYER_GLIDE = 0.2; // seconds (time constant) for arrangement changes

const isKick = (song, bar, s) => s % 4 === 0 || (song === BOSS && s === 14 && bar % 2 === 1);

/**
 * Renders one song loop to a buffer with one channel per layer, plus the duck envelope.
 * The loop is rendered with its last bar played first as a pre-roll, which is then cut away:
 * delay echoes and pad releases from the end of the loop are already ringing at its start,
 * so it loops without a seam.
 */
async function renderSong(song) {
  const bars = song.lead.length;
  const sixteenth = 60 / song.bpm / 4;
  const barLen = sixteenth * 16;
  const pre = Math.round(barLen * STEM_RATE);
  const len = Math.round(bars * barLen * STEM_RATE);
  const off = new OfflineAudioContext(STEMS.length, pre + len, STEM_RATE);
  off.destination.channelInterpretation = 'discrete';
  const merger = off.createChannelMerger(STEMS.length);
  merger.connect(off.destination);
  STEMS.forEach((name, ch) => {
    const tap = off.createGain();
    tap.connect(merger, 0, ch);
    const m = new Music();
    m.attach(off, tap, null);
    m.bus.gain.value = 1; // levels are applied at playback
    m.song = song;
    m._setDelayTime();
    m.layers = { [name]: 1 };
    for (let i = 0; i < (bars + 1) * 16; i++) {
      m.bar = i < 16 ? bars - 1 : Math.floor(i / 16) - 1;
      m.step = i % 16;
      m._scheduleStep(i * sixteenth);
    }
  });
  const rendered = await off.startRendering();
  const buffer = new AudioBuffer({ numberOfChannels: STEMS.length + 1, length: len, sampleRate: STEM_RATE });
  for (let ch = 0; ch < STEMS.length; ch++) buffer.copyToChannel(rendered.getChannelData(ch).subarray(pre, pre + len), ch);
  // Sidechain: on every kick the ducked layers drop to 0.35 and recover over three 16ths
  // (or until the next kick), exactly like the live sequencer's automation.
  const duck = buffer.getChannelData(DUCK_CH);
  const kicks = [];
  for (let b = 0; b < bars; b++) for (let s = 0; s < 16; s++) if (isKick(song, b, s)) kicks.push((b * 16 + s) * sixteenth);
  kicks.push(bars * barLen);
  for (let k = 0; k < kicks.length - 1; k++) {
    const a = Math.round(kicks[k] * STEM_RATE);
    const z = Math.min(len, Math.round(kicks[k + 1] * STEM_RATE));
    const ramp = sixteenth * 3 * STEM_RATE;
    for (let i = a; i < z; i++) duck[i] = Math.min(0, -0.65 + 0.65 * ((i - a) / ramp));
  }
  return { buffer, barLen, bars, sixteenth };
}

// Internal mix level of the music bus; the player's MUSIC slider scales on top of this,
// so 1.0 on the slider is the loudest the music gets.
const BUS_LEVEL = 0.45;

export class Music {
  constructor() {
    this.userVolume = 1;
    this.ctx = null;
    this.song = STAGE;
    this.pendingSong = null;
    this.layers = {};
    this.targetLayers = {};
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.playing = false;
    this.arrangement = '';
    this.stems = null; // { stage, boss } once rendered
    this.player = null; // the stem player currently (or about to be) heard
    this.players = new Set();
  }

  /** Renders the songs into stems. Needs no user gesture; call once at load. */
  prerender() {
    if (!this._prerender) {
      this._prerender = (async () => {
        if (typeof OfflineAudioContext === 'undefined' || typeof AudioBuffer === 'undefined') return;
        const stage = await renderSong(STAGE);
        const boss = await renderSong(BOSS);
        this.stems = { stage, boss };
      })().catch((e) => console.warn('music prerender failed; using the live sequencer', e));
    }
    return this._prerender;
  }

  attach(ctx, destination, reverbSend) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = BUS_LEVEL;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.7;
    // The player's volume sits after the bus (which setMuffle animates) so the two never fight.
    this.volume = ctx.createGain();
    this.volume.gain.value = this.userVolume;
    this.bus.connect(this.filter).connect(this.volume).connect(destination);
    // Reverb sends go through their own gain so they follow the volume slider too.
    this.reverbSend = null;
    if (reverbSend) {
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = this.userVolume;
      this.reverbSend.connect(reverbSend);
    }
    // Tempo-synced feedback delay for arp + lead
    this.delay = ctx.createDelay(2);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delayOut = ctx.createGain();
    this.delayOut.gain.value = 0.35;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    this.delay.connect(dlp).connect(this.delayFb).connect(this.delay);
    dlp.connect(this.delayOut).connect(this.bus);
    // Sidechain duck node for bass/pad
    this.duck = ctx.createGain();
    this.duck.connect(this.bus);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._setDelayTime();
  }

  _setDelayTime() {
    if (!this.ctx) return;
    this.delay.delayTime.value = (60 / this.song.bpm) * 0.75; // dotted 8th
  }

  play(songName = 'stage', arrangement = 'title') {
    const key = songName === 'boss' ? 'boss' : 'stage';
    const song = key === 'boss' ? BOSS : STAGE;
    this.arrange(arrangement);
    if (!this.ctx) return;
    if (this.stems) {
      const now = this.ctx.currentTime;
      if (!this.playing || !this.player) {
        this.playing = true;
        this.song = song;
        this.pendingSong = null;
        this._startPlayer(key, now + 0.06, 0, 0);
      } else if (this.player.key !== key) {
        this._switchPlayer(key);
      }
      return;
    }
    if (!this.playing) {
      this.song = song;
      this._setDelayTime();
      this.playing = true;
      this.step = 0;
      this.bar = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
    } else if (song !== this.song) {
      this.pendingSong = song;
    }
  }

  arrange(name) {
    if (name === this.arrangement) return;
    this.arrangement = name;
    this.targetLayers = ARRANGEMENTS[name] || {};
    if (this.ctx) for (const p of this.players) this._glide(p, this.ctx.currentTime, LAYER_GLIDE);
  }

  stop() {
    this.playing = false;
    if (this.ctx) for (const p of [...this.players]) this._fadeOut(p, this.ctx.currentTime, 0.1);
    this.player = null;
  }

  // ---------------------------------------------------------------- stem playback
  // One looping source per song: source -> splitter -> a gain per layer -> bus. The duck channel
  // drives the ducked layers' gain directly, so the sidechain pump costs nothing per beat.

  _startPlayer(key, when, offset, glide) {
    const c = this.ctx;
    const st = this.stems[key];
    const p = { key, t0: when - offset, barLen: st.barLen, gains: {}, ended: false };
    p.src = c.createBufferSource();
    p.src.buffer = st.buffer;
    p.src.loop = true;
    const split = c.createChannelSplitter(STEMS.length + 1);
    p.src.connect(split);
    p.out = c.createGain();
    p.out.connect(this.bus);
    p.duck = c.createGain();
    p.duck.connect(p.out);
    p.depth = c.createGain();
    p.depth.gain.value = 0;
    split.connect(p.depth, DUCK_CH);
    p.depth.connect(p.duck.gain);
    if (this.reverbSend) {
      p.rv = c.createGain();
      p.rv.connect(this.reverbSend);
    }
    STEMS.forEach((name, ch) => {
      const g = c.createGain();
      g.gain.value = glide ? this.layers[name] || 0 : this.targetLayers[name] || 0;
      split.connect(g, ch);
      g.connect(DUCKED.has(name) ? p.duck : p.out);
      if (p.rv && REVERB_SEND[name]) {
        const s = c.createGain();
        s.gain.value = REVERB_SEND[name];
        g.connect(s).connect(p.rv);
      }
      p.gains[name] = g;
    });
    this._glide(p, when, glide);
    p.src.onended = () => {
      p.ended = true;
      this.players.delete(p);
      try { p.src.disconnect(); p.out.disconnect(); if (p.rv) p.rv.disconnect(); } catch { /* gone */ }
    };
    p.src.start(when, offset);
    this.players.add(p);
    this.player = p;
    return p;
  }

  /** Moves a player's layer gains to the current arrangement. */
  _glide(p, t, tc) {
    const T = this.targetLayers;
    for (const name of STEMS) {
      const param = p.gains[name].gain;
      if (tc > 0) param.setTargetAtTime(T[name] || 0, t, tc);
      else param.setValueAtTime(T[name] || 0, t);
    }
    // the kick pumps the pads and bass only while the kick is playing
    const d = T.kick > 0.01 ? 1 : 0;
    if (tc > 0) p.depth.gain.setTargetAtTime(d, t, 0.05);
    else p.depth.gain.setValueAtTime(d, t);
  }

  _fadeOut(p, t, tc) {
    p.out.gain.setTargetAtTime(0, t, tc);
    if (p.rv) p.rv.gain.setTargetAtTime(0, t, tc);
    try { p.src.stop(t + tc * 8); } catch { /* already stopped */ }
    if (this.player === p) this.player = null;
  }

  /** Changes song on the current song's next bar line. */
  _switchPlayer(key) {
    const cur = this.player;
    const now = this.ctx.currentTime;
    const when = cur.t0 + Math.max(0, Math.ceil((now + 0.05 - cur.t0) / cur.barLen)) * cur.barLen;
    for (const p of [...this.players]) this._fadeOut(p, Math.max(now, when), 0.06);
    this.song = key === 'boss' ? BOSS : STAGE;
    this._startPlayer(key, Math.max(now + 0.02, when), 0, 0);
  }

  /** The stems finished rendering while the live sequencer was playing: take over seamlessly. */
  _handoff() {
    const song = this.pendingSong || this.song;
    const key = song === BOSS ? 'boss' : 'stage';
    const st = this.stems[key];
    let offset = 0;
    if (!this.pendingSong) offset = ((this.bar % st.bars) * 16 + this.step) * st.sixteenth;
    this.song = song;
    this.pendingSong = null;
    const when = Math.max(this.nextTime, this.ctx.currentTime + 0.02);
    this._startPlayer(key, when, offset, LAYER_GLIDE);
  }

  /** Muffles the music (used while paused or during slow motion). Only touches the bus. */
  setMuffle(amount) {
    if (!this.ctx) return;
    // called every frame: only touch the params when the amount actually changes
    if (this._muffle !== undefined && Math.abs(amount - this._muffle) < 0.005) return;
    this._muffle = amount;
    const f = 20000 * Math.pow(1 - amount, 3) + 350;
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.15);
    this.bus.gain.setTargetAtTime(BUS_LEVEL * (1 - amount * 0.45), this.ctx.currentTime, 0.15);
  }

  /** The player's music volume, 0..1 (0 silences it). Safe to call before attach. */
  setVolume(v) {
    this.userVolume = Math.min(1, Math.max(0, v));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.volume.gain.setTargetAtTime(this.userVolume, t, 0.04);
    if (this.reverbSend) this.reverbSend.gain.setTargetAtTime(this.userVolume, t, 0.04);
  }

  /** Short one-shot jingles, independent of the sequencer. */
  jingle(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    if (kind === 'victory') {
      const seq = [[67, 0], [72, 0.11], [76, 0.22], [79, 0.33], [84, 0.44]];
      for (const [m, dt] of seq) this._lead(t + dt, mtof(m), 0.18, 0.5);
      for (const m of [60, 64, 67, 72, 76]) this._pad(t + 0.55, mtof(m), 2.6, 0.25);
      this._lead(t + 0.55, mtof(88), 1.8, 0.45);
    } else if (kind === 'gameover') {
      const seq = [[69, 0], [67, 0.25], [64, 0.5], [60, 0.75], [57, 1.05]];
      for (const [m, dt] of seq) this._lead(t + dt, mtof(m), 0.3, 0.4);
      for (const m of [45, 57, 60, 64]) this._pad(t + 1.05, mtof(m), 2.5, 0.2);
    } else if (kind === 'clear') {
      const seq = [[72, 0], [76, 0.08], [79, 0.16], [84, 0.24], [83, 0.4], [84, 0.48]];
      for (const [m, dt] of seq) this._lead(t + dt, mtof(m), 0.14, 0.35);
    }
  }

  tick() {
    if (!this.ctx || !this.playing) return;
    if (this.stems) {
      // stem playback needs no per-frame work; just take over from the live sequencer once
      if (!this.player) this._handoff();
      return;
    }
    // Smoothly move layer gains towards targets once per tick
    const all = ['pad', 'arp', 'bass', 'kick', 'snare', 'hat', 'lead', 'toms'];
    for (const k of all) {
      const cur = this.layers[k] || 0;
      const tgt = this.targetLayers[k] || 0;
      this.layers[k] = cur + (tgt - cur) * 0.08;
      if (Math.abs(this.layers[k] - tgt) < 0.01) this.layers[k] = tgt;
    }
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05; // recovered from a stall
    while (this.nextTime < now + 0.14) {
      this._scheduleStep(this.nextTime);
      this.nextTime += 60 / this.song.bpm / 4;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
        if (this.pendingSong && this.bar % 4 === 0) {
          this.song = this.pendingSong;
          this.pendingSong = null;
          this.bar = 0;
          this._setDelayTime();
        }
      }
    }
  }

  _scheduleStep(t) {
    const L = this.layers;
    const s = this.step;
    const song = this.song;
    const chord = song.chords[this.bar % song.chords.length];
    const sixteenth = 60 / song.bpm / 4;
    const boss = song === BOSS;

    if (L.kick > 0.01 && (s % 4 === 0 || (boss && s === 14 && this.bar % 2 === 1))) {
      this._kick(t, L.kick);
      // sidechain pump
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(0.35, t);
      this.duck.gain.linearRampToValueAtTime(1, t + sixteenth * 3);
    }
    if (L.snare > 0.01 && (s === 4 || s === 12 || (boss && s === 15 && this.bar % 4 === 3))) this._snare(t, L.snare);
    if (L.hat > 0.01 && s % 2 === 0) this._hat(t, L.hat * (s % 4 === 2 ? 1 : 0.55), s % 8 === 6);
    if (L.hat > 0.01 && boss && s % 2 === 1) this._hat(t, L.hat * 0.3, false);
    if (L.toms > 0.01 && this.bar % 4 === 3 && s >= 8 && s % 2 === 0) this._tom(t, L.toms, 140 - (s - 8) * 9);

    if (L.bass > 0.01) {
      const step8 = boss ? true : s % 2 === 0;
      if (step8) {
        const off = song.bassPattern[s];
        this._bass(t, mtof(chord.root + 12 + off), sixteenth * (boss ? 0.9 : 1.8), L.bass, boss);
      }
    }
    if (L.arp > 0.01) {
      const idx = song.arp[s];
      const oct = s >= 8 && this.bar % 2 === 1 ? 12 : 0;
      this._arp(t, mtof(chord.tones[idx] + oct), sixteenth * 0.9, L.arp);
    }
    if (L.pad > 0.01 && s === 0) {
      for (const m of chord.tones.slice(0, 3)) this._pad(t, mtof(m - 12), sixteenth * 16, L.pad * 0.16);
    }
    if (L.lead > 0.01) {
      const phrase = song.lead[this.bar % song.lead.length];
      for (const [st, m, len] of phrase) if (st === s) this._lead(t, mtof(m), sixteenth * len * 0.95, L.lead * 0.32);
    }
  }

  _kick(t, v) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.45);
  }

  _noiseHit(t, dur, type, freq, q, gain, dest = this.bus) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  _snare(t, v) {
    this._noiseHit(t, 0.2, 'bandpass', 1900, 0.8, 0.5 * v);
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.35 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.15);
    if (this.reverbSend) this._noiseHit(t, 0.25, 'bandpass', 2400, 0.6, 0.18 * v, this.reverbSend);
  }

  _hat(t, v, open) {
    this._noiseHit(t, open ? 0.16 : 0.04, 'highpass', 7500, 0.7, 0.16 * v);
  }

  _tom(t, v, f) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.32);
  }

  _bass(t, f, dur, v, gritty) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const o2 = c.createOscillator();
    o2.type = gritty ? 'square' : 'sawtooth';
    o2.frequency.value = f / 2;
    o2.detune.value = 6;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = gritty ? 8 : 4;
    lp.frequency.setValueAtTime(gritty ? 2200 : 1500, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28 * v, t + 0.005);
    g.gain.setValueAtTime(0.28 * v, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.duck);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  _arp(t, f, dur, v) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.07 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g);
    g.connect(this.bus);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _pad(t, f, dur, v) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(v * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.connect(g);
    g.connect(this.duck);
    if (this.reverbSend) g.connect(this.reverbSend);
    for (const d of [-9, 0, 8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.35);
    }
  }

  _lead(t, f, dur, v) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.setValueAtTime(v * 0.85, t + Math.max(0.02, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    lp.Q.value = 2;
    lp.connect(g);
    g.connect(this.bus);
    g.connect(this.delay);
    if (this.reverbSend) g.connect(this.reverbSend);
    const vib = c.createOscillator();
    vib.frequency.value = 5.5;
    const vibG = c.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.3, dur));
    vib.connect(vibG);
    for (const [type, det] of [['sawtooth', -7], ['square', 7]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      vibG.connect(o.frequency);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.08);
    }
    vib.start(t);
    vib.stop(t + dur + 0.08);
  }
}

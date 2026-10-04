import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_DEFAULTS, loadAudioSettings, saveAudioSettings } from '../src/audio/settings.js';
import { sliderValueAt, onSliderBar, SLIDER_BAR } from '../src/game/menu.js';

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('audio settings default to quiet music, loud effects, unmuted', () => {
  assert.deepEqual(loadAudioSettings(memoryStorage()), { music: 0.35, effects: 0.85, muted: false });
  assert.deepEqual(loadAudioSettings(null), { ...AUDIO_DEFAULTS });
  assert.ok(AUDIO_DEFAULTS.music < AUDIO_DEFAULTS.effects);
});

test('audio settings round-trip and are clamped', () => {
  const st = memoryStorage();
  saveAudioSettings({ music: 0.2, effects: 1.7, muted: true }, st);
  assert.deepEqual(loadAudioSettings(st), { music: 0.2, effects: 1, muted: true });
});

test('audio settings survive corrupt or broken storage', () => {
  assert.deepEqual(loadAudioSettings(memoryStorage({ 'rift.audio': '{nope' })), { ...AUDIO_DEFAULTS });
  assert.deepEqual(loadAudioSettings(memoryStorage({ 'rift.audio': '{"music":"x","effects":-2}' })), { music: 0.35, effects: 0, muted: false });
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadAudioSettings(throwing), { ...AUDIO_DEFAULTS });
  assert.doesNotThrow(() => saveAudioSettings({ music: 0.5, effects: 0.5, muted: false }, throwing));
});

test('the old mute flag carries over when there are no saved settings', () => {
  assert.equal(loadAudioSettings(memoryStorage({ 'rift.muted': '1' })).muted, true);
});

test('slider bar maps hit position to a clamped 0..1 value', () => {
  const { x0, x1 } = SLIDER_BAR;
  assert.equal(sliderValueAt(x0), 0);
  assert.equal(sliderValueAt(x1), 1);
  assert.ok(Math.abs(sliderValueAt((x0 + x1) / 2) - 0.5) < 1e-9);
  assert.equal(sliderValueAt(0), 0);
  assert.equal(sliderValueAt(1), 1);
  assert.ok(onSliderBar((x0 + x1) / 2));
  assert.ok(!onSliderBar(0.1), 'the label is not part of the bar');
});

test('the shared reverb has no feedback loop, so it can never ring on by itself', async () => {
  // A comb reverb once fed back through a resonant filter, grew ~10x a second and screeched on
  // after the music was muted. Record the reverb's graph with a fake context and look for cycles.
  const { makeReverb } = await import('../src/audio/audio.js');
  const nodes = [];
  const node = (type) => {
    const n = { type, out: [], gain: { value: 1 }, delayTime: { value: 0 }, frequency: { value: 0 }, Q: { value: 1 } };
    n.connect = (to) => { n.out.push(to); return to; };
    nodes.push(n);
    return n;
  };
  const ctx = {
    createGain: () => node('gain'), createDelay: () => node('delay'), createBiquadFilter: () => node('filter'),
    createChannelMerger: () => node('merger'), createConvolver: () => node('convolver'),
  };
  const rv = makeReverb(ctx);
  const state = new Map();
  const cyclic = (n) => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    const hit = n.out.some(cyclic);
    state.set(n, 2);
    return hit;
  };
  assert.equal(cyclic(rv.input), false);
  assert.ok(nodes.filter((n) => n.type === 'gain').every((n) => Math.abs(n.gain.value) <= 1));
});

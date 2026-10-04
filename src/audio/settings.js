// Player audio settings: music and effects volume (0..1) plus a quick mute, kept in localStorage.

export const AUDIO_DEFAULTS = Object.freeze({ music: 0.35, effects: 0.85, muted: false });
const KEY = 'rift.audio';
const LEGACY_MUTE_KEY = 'rift.muted';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const level = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : fallback);

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Reads the saved settings, falling back to defaults for anything missing or malformed. */
export function loadAudioSettings(storage = defaultStorage()) {
  const s = { ...AUDIO_DEFAULTS };
  if (!storage) return s;
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) || {};
      s.music = level(saved.music, s.music);
      s.effects = level(saved.effects, s.effects);
      s.muted = saved.muted === true;
    } else {
      s.muted = storage.getItem(LEGACY_MUTE_KEY) === '1';
    }
  } catch { /* storage unavailable or corrupt: keep defaults */ }
  return s;
}

export function saveAudioSettings(s, storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify({ music: level(s.music, AUDIO_DEFAULTS.music), effects: level(s.effects, AUDIO_DEFAULTS.effects), muted: !!s.muted }));
  } catch { /* storage unavailable */ }
}

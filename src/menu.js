export const DIFFICULTIES = {
  casual: { label: 'Casual', speed: .82, cadence: .82, gap: .88, protection: 1.6, hint: 'Slower bullets. Wider openings.' },
  arcade: { label: 'Arcade', speed: 1, cadence: 1, gap: .68, protection: 1.2, hint: 'The original, full-pressure flight.' },
  expert: { label: 'Expert', speed: 1.18, cadence: 1.12, gap: .54, protection: .9, hint: 'Faster bullets. Tighter openings.' }
};
export const DEFAULT_SETTINGS = { distance: 1.98, width: 3.8, volume: 1, musicVolume: 1, difficulty: 'arcade' };
export function normalizeSettings(value = {}) {
  const bounded = (key, min, max) => Number.isFinite(value?.[key]) ? Math.max(min, Math.min(max, value[key])) : DEFAULT_SETTINGS[key];
  return { distance: bounded('distance', 1.52, 2.44), width: bounded('width', 2.4, 5.4), volume: bounded('volume', 0, 1), musicVolume: bounded('musicVolume', 0, 1), difficulty: Object.hasOwn(DIFFICULTIES, value?.difficulty) ? value.difficulty : 'arcade' };
}
export class PauseMenu {
  constructor() { this.selected = 0; this.nextMove = 0; }
  open() { this.selected = 0; this.nextMove = 0; }
  rows(settings, ended = false, deploying = false) {
    return [
      { id: 'resume', label: ended ? 'Play again' : deploying ? 'Deploy ship' : 'Resume flight', value: '→' },
      { id: 'volume', label: 'Master volume', value: `${Math.round(settings.volume * 100)}%` },
      { id: 'musicVolume', label: 'Music volume', value: `${Math.round(settings.musicVolume * 100)}%` },
      { id: 'difficulty', label: 'Difficulty', value: DIFFICULTIES[settings.difficulty].label },
      { id: 'width', label: 'Arena width', value: `${(settings.width * 3.28084).toFixed(1)} ft` },
      { id: 'distance', label: 'Plane distance', value: `${(settings.distance * 3.28084).toFixed(1)} ft` },
      { id: 'recenter', label: 'Recenter arena', value: 'X' },
      { id: 'restart', label: 'Restart level', value: '→' },
      { id: 'exit', label: 'Exit game', value: '→' }
    ];
  }
  input(x, y, trigger, now, settings) {
    const rows = this.rows(settings);
    if (Math.max(Math.abs(x), Math.abs(y)) < .45) this.nextMove = 0;
    else if (now >= this.nextMove) {
      this.nextMove = now + .24;
      if (Math.abs(y) >= Math.abs(x)) this.selected = Math.max(0, Math.min(rows.length - 1, this.selected - Math.sign(y)));
      else {
        const key = rows[this.selected].id, sign = Math.sign(x);
        if (key === 'difficulty') { const ids = Object.keys(DIFFICULTIES); settings[key] = ids[Math.max(0, Math.min(2, ids.indexOf(settings[key]) + sign))]; return 'changed'; }
        const limits = { volume: [0, 1, .05], musicVolume: [0, 1, .05], width: [2.4, 5.4, .1], distance: [1.52, 2.44, .05] }[key];
        if (limits) { settings[key] = Math.max(limits[0], Math.min(limits[1], Math.round((settings[key] + sign * limits[2]) * 100) / 100)); return 'changed'; }
      }
    }
    if (trigger) { const id = rows[this.selected].id; return ['resume', 'recenter', 'restart', 'exit'].includes(id) ? id : null; }
    return null;
  }
}

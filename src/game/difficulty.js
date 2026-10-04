// Difficulty settings. One table drives every knob so the three modes stay consistent.
//   enemyHp      multiplier on every enemy's and boss part's health
//   bulletSpeed  multiplier on every enemy bullet's speed
//   density      fraction of enemy bullets actually fired (evenly thinned, so patterns keep their shape)
//   pace         scripted paths run at this fraction of their authored duration (lower = faster)
//   pressure     frequency multiplier for the mines / hornets / wraiths layer
//   mineBeams    added to every pivot mine's beam count (min 2)
//   lives, bombs starting stock
//   bossHp       multiplier on the Gyre's pods, emitters and core
//   escorts      fighters that join the boss fight and hold station until shot down
//   mineReach    length of a boss-fight pivot mine's beams (metres)

export const DIFFICULTIES = {
  easy: { key: 'easy', label: 'EASY', enemyHp: 0.5, bulletSpeed: 1.0, density: 0.6, pace: 0.85, pressure: 0.5, mineBeams: -1, lives: 5, bombs: 2, bossHp: 0.6, escorts: 1, mineReach: 0.6 },
  normal: { key: 'normal', label: 'NORMAL', enemyHp: 0.68, bulletSpeed: 1.2, density: 0.8, pace: 0.76, pressure: 0.72, mineBeams: 0, lives: 3, bombs: 1, bossHp: 0.9, escorts: 2, mineReach: 0.8 },
  hard: { key: 'hard', label: 'HARD', enemyHp: 1.0, bulletSpeed: 1.45, density: 1.0, pace: 0.68, pressure: 1.0, mineBeams: 0, lives: 3, bombs: 1, bossHp: 1.25, escorts: 3, mineReach: 0.95 },
};

export const ORDER = ['easy', 'normal', 'hard'];

let current = DIFFICULTIES.normal;
try {
  const saved = typeof localStorage !== 'undefined' && localStorage.getItem('rift.difficulty');
  if (saved && DIFFICULTIES[saved]) current = DIFFICULTIES[saved];
} catch { /* storage unavailable */ }

export function difficulty() {
  return current;
}

export function setDifficulty(key) {
  if (!DIFFICULTIES[key]) return current;
  current = DIFFICULTIES[key];
  try { localStorage.setItem('rift.difficulty', key); } catch { /* storage unavailable */ }
  return current;
}

/** Cycle easy -> normal -> hard -> easy. */
export function nextDifficulty() {
  return setDifficulty(ORDER[(ORDER.indexOf(current.key) + 1) % ORDER.length]);
}

import * as THREE from 'three';
import { difficulty } from './difficulty.js';
import { TAU } from '../engine/math.js';
import { spawnBloom, spawnCarrier, spawnDart, spawnFormation, spawnLancer, spawnMine, spawnHornet, spawnWraith } from './enemies.js';
import { rand } from '../engine/math.js';

// Stage 1 - "Living Room Breach". Four short, escalating waves with breathers, then THE GYRE.
// All coordinates are arena-local: the origin is where your hand naturally rests, -Z is
// away from you, and the comfortable flying space is roughly 70 x 50 x 45 cm.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const WAVES = [
  { id: 1, name: 'FIRST CONTACT', script: wave1 },
  { id: 2, name: 'SPIRAL GARDEN', script: wave2 },
  { id: 3, name: 'THE SWARM', script: wave3 },
  { id: 4, name: 'CROSSFIRE', script: wave4 },
];

/** Wait until every spawned enemy of the wave is gone (killed or escaped), with a timeout. */
function* clearOrTimeout(g, timeout) {
  // the scripted part of the wave is over: stop the pressure layer so the wave can be cleared
  if (g.pressureTask) { g.pressureTask.cancel(); g.pressureTask = null; }
  let t = 0;
  while (t < timeout) {
    if (!g.hasHostiles()) return;
    yield 0.25;
    t += 0.25;
  }
}

function mouth(g, name, depth = 0.08) {
  return g.room.rifts[name].mouth(new THREE.Vector3(), depth);
}

// A point on a shell around the player (centred between hand and chest), so fights can
// happen beside and above you, not only on the far wall. az: 0 = straight ahead, + = right.
const CENTER = V(0, 0.1, 0.15);
const DEG = Math.PI / 180;
function around(azDeg, elDeg, r) {
  const az = azDeg * DEG, el = elDeg * DEG;
  return V(CENTER.x + Math.sin(az) * Math.cos(el) * r, CENTER.y + Math.sin(el) * r, CENTER.z - Math.cos(az) * Math.cos(el) * r);
}
function arc(fromAz, toAz, el, r, steps = 6, elTo = el, rTo = r) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(around(fromAz + (toAz - fromAz) * t, el + (elTo - el) * t, r + (rTo - r) * t));
  }
  return pts;
}

function* wave1(g) {
  g.openRifts(['left', 'right', 'front', 'ceiling']);
  yield 1.4;
  const L = mouth(g, 'left'), R = mouth(g, 'right'), F = mouth(g, 'front'), C = mouth(g, 'ceiling');
  // A: a squadron swings in from your left wall and sweeps around in front of you
  spawnFormation(g, 6, () => [L, ...arc(-95, 95, 12, 0.85, 7, 18, 0.75), R], 6.8, { spacing: 0.22, shots: 2, firstShot: 1.4, interval: 1.2 });
  yield 3.0;
  // B: mirrored, low and closer
  spawnFormation(g, 6, () => [R, ...arc(95, -95, -6, 0.75, 7, -2, 0.68), L], 6.8, { spacing: 0.22, shots: 2, firstShot: 1.4, interval: 1.2 });
  yield 4.0;
  // C: divers drop out of the ceiling right above the play space, then peel off sideways
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1;
    const az = (i - 3.5) * 14;
    spawnDart(g, [C, around(az, 48, 0.75), around(az * 0.8, 22, 0.62), around(az + 35 * s, 8, 0.68), around(100 * s, 15, 1.4)], 4.0, { shots: 2, firstShot: 0.9, interval: 0.8, speed: 0.42 });
    yield 0.28;
  }
  yield 2.6;
  // D: a ring of fighters orbits around you, firing from every angle as it passes
  spawnFormation(g, 8, (i) => [F, around(0, 30, 1.2), ...arc(-10, 95, 14, 0.72, 5), ...arc(95, -95, 4, 0.8, 8), around(-110, 20, 1.5)], 11, { spacing: 0.3, shots: 4, firstShot: 2.4, interval: 1.4 });
  yield 5.5;
  // E: twin snakes weave down both flanks
  for (const s of [-1, 1]) {
    spawnFormation(g, 5, () => [s < 0 ? L : R, around(70 * s, 30, 0.85), around(40 * s, 10, 0.7), around(65 * s, -5, 0.65), around(30 * s, -10, 0.72), around(10 * s, 20, 1.3), F], 6.0, { spacing: 0.24, shots: 2, firstShot: 1.2 });
  }
  yield* clearOrTimeout(g, 14);
}

function* wave2(g) {
  g.openRifts(['frontL', 'frontR', 'front', 'left', 'right', 'ceiling']);
  yield 1.4;
  const L = mouth(g, 'left'), R = mouth(g, 'right'), F = mouth(g, 'front'), C = mouth(g, 'ceiling');
  // three spiral blooms surround you - left flank, right flank, and overhead
  spawnBloom(g, L, around(-58, 14, 0.82), { arms: 4, phaseStep: 0.3, interval: 0.12, duration: 11, huge: true });
  yield 1.2;
  spawnBloom(g, R, around(58, 14, 0.82), { arms: 4, phaseStep: -0.3, interval: 0.12, duration: 11, drop: true, huge: true });
  yield 2.5;
  spawnBloom(g, C, around(0, 42, 0.9), { arms: 3, phaseStep: 0.38, interval: 0.14, duration: 8 });
  yield 2.5;
  spawnFormation(g, 6, () => [F, ...arc(-60, 60, -12, 0.7, 6), R], 5.4, { spacing: 0.2, shots: 1 });
  yield* clearOrTimeout(g, 7);
  // ring-bursters close in front with fast spirals on the flanks
  spawnBloom(g, F, around(-22, 2, 0.9), { style: 'rings', duration: 9, hp: 36, drop: true });
  spawnBloom(g, F, around(22, 2, 0.9), { style: 'rings', duration: 9, hp: 36, ringPhase: 0.5 });
  yield 1.4;
  spawnBloom(g, L, around(-75, 30, 0.8), { arms: 2, phaseStep: 0.45, interval: 0.09, duration: 8 });
  spawnBloom(g, R, around(75, -8, 0.8), { arms: 2, phaseStep: -0.45, interval: 0.09, duration: 8 });
  yield 4;
  spawnFormation(g, 8, () => [L, ...arc(-95, 95, 26, 0.78, 8), R], 7, { spacing: 0.22, shots: 2 });
  yield* clearOrTimeout(g, 16);
}

function riverPath(g, from, to, side) {
  // a stream that enters from one side, crosses in front, and curls past you on the far side
  return [from, around(-80 * side, 8, 1.1), around(-40 * side, 22, 0.8), around(5 * side, 6, 0.66), around(55 * side, -6, 0.55), around(85 * side, 0, 0.5), around(105 * side, 15, 0.9), to];
}

function* wave3(g) {
  g.openRifts(['left', 'right', 'ceiling', 'frontL', 'frontR']);
  yield 1.8;
  const Lm = mouth(g, 'left'), Rm = mouth(g, 'right'), C = mouth(g, 'ceiling');
  g.swarm.stream(riverPath(g, Lm, Rm, 1), 32, 6.5, { interval: 0.06, spread: 0.07, aimedShots: 6 });
  g.sfx.play('rift', g.worldPos(Lm), { vol: 0.8 });
  yield 3.6;
  g.swarm.stream(riverPath(g, Rm, Lm, -1).map((p, i) => (i > 0 && i < 7 ? p.clone().add(V(0, 0.12, 0)) : p)), 32, 6.5, { interval: 0.06, spread: 0.07, aimedShots: 6 });
  g.sfx.play('rift', g.worldPos(Rm), { vol: 0.8 });
  yield 3.0;
  // lancers take your flanks and sweep lasers through the space
  spawnLancer(g, mouth(g, 'frontL'), around(-62, 22, 0.85), { sweeps: 3, drop: true });
  yield 1.2;
  spawnLancer(g, mouth(g, 'frontR'), around(62, -4, 0.85), { sweeps: 3, vertical: true });
  yield 3.5;
  spawnBloom(g, C, around(0, 40, 0.92), { arms: 3, phaseStep: 0.33, duration: 7 });
  yield 3.5;
  // a helix pours down from the ceiling and corkscrews all the way around the play space
  const helix = [C];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    helix.push(around(-100 + 200 * t + Math.sin(t * TAU * 1.5) * 20, 45 - 55 * t, 0.62 + 0.12 * Math.sin(t * TAU * 2)));
  }
  helix.push(V(1.6, -0.6, -0.4));
  g.swarm.stream(helix, 40, 7.5, { interval: 0.055, spread: 0.05, aimedShots: 6 });
  g.sfx.play('rift', g.worldPos(C), { vol: 0.8 });
  yield 6.0;
  // finale: both rivers at once with a dart escort
  g.swarm.stream(riverPath(g, Lm, Rm, 1).map((p, i) => (i > 0 && i < 7 ? p.clone().add(V(0, 0.15, -0.05)) : p)), 26, 6, { interval: 0.07, spread: 0.08, aimedShots: 4 });
  g.swarm.stream(riverPath(g, Rm, Lm, -1).map((p, i) => (i > 0 && i < 7 ? p.clone().add(V(0, -0.1, -0.05)) : p)), 26, 6, { interval: 0.07, spread: 0.08, aimedShots: 4 });
  yield 2;
  spawnFormation(g, 6, () => [mouth(g, 'frontL'), ...arc(-70, 70, 30, 0.8, 6), mouth(g, 'frontR')], 5.5, { spacing: 0.2, shots: 2 });
  yield* clearOrTimeout(g, 14);
}

function* wave4(g) {
  g.openRifts(['front', 'frontL', 'frontR', 'ceiling', 'left', 'right']);
  yield 1.6;
  const F = mouth(g, 'front'), L = mouth(g, 'left'), R = mouth(g, 'right'), C = mouth(g, 'ceiling');
  const carrier = spawnCarrier(g, F, around(0, 10, 1.0), { hp: 130 });
  yield 4.5;
  spawnBloom(g, L, around(-62, 6, 0.8), { arms: 3, phaseStep: 0.34, duration: 10, hp: 30, huge: true });
  spawnBloom(g, R, around(62, 6, 0.8), { arms: 3, phaseStep: -0.34, duration: 10, hp: 30, huge: true });
  yield 5;
  spawnLancer(g, C, around(0, 45, 0.8), { sweeps: 3, vertical: false, drop: true });
  yield 3;
  for (let i = 0; i < 3; i++) {
    const s = i % 2 ? 1 : -1;
    spawnFormation(g, 6, () => [s > 0 ? R : L, ...arc(95 * s, -95 * s, 20 - i * 12, 0.72, 7), s > 0 ? L : R], 6, { spacing: 0.18, shots: 2 });
    yield 2.2;
  }
  yield () => !carrier.alive;
  yield* clearOrTimeout(g, 10);
}

/** A spot near the ship (but never on it) where a pivot mine warps in. */
export function minePos(g) {
  const s = g.ship.pos;
  const p = V(0, 0, 0);
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), r = rand(0.18, 0.32);
    p.set(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.75, s.z - rand(0.06, 0.24));
    p.x = Math.max(-0.45, Math.min(0.45, p.x));
    p.y = Math.max(-0.22, Math.min(0.38, p.y));
    p.z = Math.max(-0.55, Math.min(0.05, p.z));
    if (p.distanceTo(s) > 0.17) break;
  }
  return p;
}

/**
 * Pressure layer that runs alongside each wave's script: pivot mines warp in near you,
 * hornets dive at you and wraiths hop around unpredictably. It escalates wave by wave.
 */
export function* pressure(g, level) {
  const pr = difficulty().pressure;
  const mineEvery = [0, 6.5, 5.2, 4.6, 3.9][level] / pr;
  const beams = [0, 2, 3, 3, 4][level];
  let tMine = level === 1 ? 7 : 3.5, tHornet = 9, tWraith = 6;
  while (true) {
    yield 0.25;
    tMine -= 0.25; tHornet -= 0.25; tWraith -= 0.25;
    if (tMine <= 0) {
      tMine = mineEvery * rand(0.85, 1.15);
      spawnMine(g, minePos(g), { beams: level >= 4 && Math.random() < 0.5 ? 4 : beams, spin: rand(1.1, 1.6 + level * 0.15) });
    }
    if (tHornet <= 0 && level !== 2) {
      tHornet = ([0, 9, 0, 6, 6.5][level] / pr) * rand(0.85, 1.15);
      const n = level >= 3 && pr >= 1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const sd = (i % 2 ? 1 : -1);
        const m = mouth(g, sd > 0 ? 'right' : 'left');
        spawnHornet(g, m, [around(70 * sd, rand(0, 30), 0.75), around(rand(20, 45) * sd, rand(-5, 20), 0.58)], { travel: rand(1.8, 2.4) });
        yield 0.3;
      }
    }
    if (tWraith <= 0 && level >= 2) {
      tWraith = ([0, 0, 7.5, 8, 6][level] / pr) * rand(0.85, 1.15);
      const n = level >= 4 && pr >= 0.7 ? 2 : 1;
      for (let i = 0; i < n; i++) spawnWraith(g, mouth(g, Math.random() < 0.5 ? 'frontL' : 'frontR'), { hops: 5 + level });
    }
  }
}

/** The full stage: waves with breathers, then the boss. Yields until the boss is defeated. */
export function* stage(g, startAt = 0) {
  for (let i = startAt; i < WAVES.length; i++) {
    const w = WAVES[i];
    g.beginWave(w);
    yield 2.0;
    g.pressureTask = g.scheduler.start(pressure(g, w.id));
    yield* w.script(g);
    if (g.pressureTask) { g.pressureTask.cancel(); g.pressureTask = null; }
    g.endWave(w);
    yield 4.5; // breather
  }
  yield* bossFight(g);
}

export function* bossFight(g) {
  g.beginBossWarning();
  yield 5.2;
  g.boss.begin(g.bossStartPhase || 0);
  yield () => g.boss.defeated;
  yield 2.5;
}


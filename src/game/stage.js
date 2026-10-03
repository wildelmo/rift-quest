import * as THREE from 'three';
import { TAU } from '../engine/math.js';
import { spawnBloom, spawnCarrier, spawnDart, spawnFormation, spawnLancer } from './enemies.js';

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

function* wave1(g) {
  g.openRifts(['frontL', 'frontR', 'front']);
  yield 1.6;
  const L = mouth(g, 'frontL'), R = mouth(g, 'frontR'), F = mouth(g, 'front');
  // A: sweeping arc from the left rift across in front of you
  spawnFormation(g, 5, () => [L, V(-0.55, 0.28, -1.25), V(-0.05, 0.12, -0.8), V(0.45, 0.0, -0.95), V(0.95, 0.3, -1.9), R], 6.4, { spacing: 0.24, shots: 1, firstShot: 2.2 });
  yield 3.4;
  // B: mirrored, lower
  spawnFormation(g, 5, () => [R, V(0.55, 0.05, -1.2), V(0.05, -0.12, -0.8), V(-0.45, -0.15, -0.95), V(-0.95, 0.15, -1.9), L], 6.4, { spacing: 0.24, shots: 1, firstShot: 2.2 });
  yield 4.2;
  // C: two snakes weaving out of the centre rift
  for (const s of [-1, 1]) {
    spawnFormation(g, 4, () => [F, V(0.15 * s, 0.32, -1.45), V(-0.32 * s, 0.18, -0.95), V(0.32 * s, 0.02, -0.75), V(-0.25 * s, -0.12, -0.85), V(0.1 * s, -0.5, -1.8), V(0.6 * s, -0.8, -3)], 7.5, { spacing: 0.3, shots: 1, firstShot: 1.6 });
    yield 0.9;
  }
  yield 3.6;
  // D: divers fall out of the ceiling and peel off to the sides
  g.openRifts(['ceiling']);
  yield 1.2;
  const C = mouth(g, 'ceiling');
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    const x = (i - 2.5) * 0.12;
    spawnDart(g, [C, V(x, 0.45, -0.85), V(x * 1.2, 0.05, -0.62), V(x + 0.55 * s, -0.12, -0.75), V(1.6 * s, 0.2, -1.6)], 4.2, { shots: 1, firstShot: 1.1, speed: 0.45 });
    yield 0.32;
  }
  yield 3.0;
  // E: the weave - three formations braid across the space
  spawnFormation(g, 5, () => [L, V(-0.5, 0.3, -1.1), V(0, 0.3, -0.85), V(0.5, 0.3, -1.1), V(1.2, 0.5, -2.4)], 5.5, { spacing: 0.2, shots: 2, interval: 1.0 });
  yield 0.6;
  spawnFormation(g, 5, () => [R, V(0.5, -0.05, -1.0), V(0, -0.05, -0.75), V(-0.5, -0.05, -1.0), V(-1.2, 0.1, -2.4)], 5.5, { spacing: 0.2, shots: 2, interval: 1.0 });
  yield 0.6;
  spawnFormation(g, 5, () => [F, V(0, 0.4, -1.4), V(0, 0.12, -0.85), V(0, -0.25, -0.95), V(0, -0.9, -2.2)], 5.0, { spacing: 0.2, shots: 1 });
  yield* clearOrTimeout(g, 14);
}

function* wave2(g) {
  g.openRifts(['frontL', 'frontR', 'front']);
  yield 1.4;
  const L = mouth(g, 'frontL'), R = mouth(g, 'frontR'), F = mouth(g, 'front');
  spawnBloom(g, L, V(-0.3, 0.16, -1.05), { arms: 3, phaseStep: 0.31, duration: 10 });
  yield 2.0;
  spawnBloom(g, R, V(0.3, 0.16, -1.05), { arms: 3, phaseStep: -0.31, duration: 10, drop: true });
  yield 3.5;
  spawnFormation(g, 6, () => [L, V(-0.5, -0.18, -1.0), V(0, -0.2, -0.7), V(0.5, -0.18, -1.0), V(1.3, -0.1, -2.2)], 5.6, { spacing: 0.22 });
  yield 4.5;
  spawnFormation(g, 6, () => [R, V(0.5, 0.36, -1.0), V(0, 0.36, -0.75), V(-0.5, 0.36, -1.0), V(-1.3, 0.5, -2.2)], 5.6, { spacing: 0.22, shots: 1 });
  yield* clearOrTimeout(g, 6);
  // centre: a ring-burster flanked by two fast spirals
  spawnBloom(g, F, V(0, 0.02, -1.2), { style: 'rings', duration: 8, hp: 36, drop: true });
  yield 1.4;
  spawnBloom(g, L, V(-0.38, 0.3, -1.25), { arms: 2, phaseStep: 0.42, interval: 0.1, duration: 8 });
  spawnBloom(g, R, V(0.38, -0.16, -1.25), { arms: 2, phaseStep: -0.42, interval: 0.1, duration: 8 });
  yield 4;
  spawnFormation(g, 5, () => [F, V(-0.4, 0.35, -1.0), V(0.4, 0.2, -0.75), V(-0.4, 0.05, -0.75), V(0.4, -0.1, -0.9), V(0, -0.8, -2)], 6.5, { spacing: 0.25, shots: 1 });
  yield* clearOrTimeout(g, 16);
}

function riverPath(g, from, to, side) {
  // a stream that enters from one side, crosses in front, and curls past you on the far side
  return [from, V(-0.7 * side, 0.12, -0.55), V(-0.2 * side, 0.26, -0.95), V(0.25 * side, 0.05, -0.72), V(0.52 * side, -0.08, -0.25), V(0.42 * side, -0.05, 0.25), V(0.9 * side, 0.2, 0.3), to];
}

function* wave3(g) {
  g.openRifts(['left', 'right', 'ceiling', 'frontL', 'frontR']);
  yield 1.8;
  const Lm = mouth(g, 'left'), Rm = mouth(g, 'right'), C = mouth(g, 'ceiling');
  g.swarm.stream(riverPath(g, Lm, Rm, 1), 28, 6.5, { interval: 0.07, spread: 0.07, aimedShots: 4 });
  g.sfx.play('rift', g.worldPos(Lm), { vol: 0.8 });
  yield 4.2;
  g.swarm.stream(riverPath(g, Rm, Lm, -1).map((p, i) => (i > 0 && i < 7 ? p.clone().add(V(0, 0.12, 0)) : p)), 28, 6.5, { interval: 0.07, spread: 0.07, aimedShots: 4 });
  g.sfx.play('rift', g.worldPos(Rm), { vol: 0.8 });
  yield 3.5;
  // lancers take the flanks and sweep lasers through the space
  spawnLancer(g, mouth(g, 'frontL'), V(-0.55, 0.26, -1.0), { sweeps: 2, drop: true });
  yield 1.2;
  spawnLancer(g, mouth(g, 'frontR'), V(0.55, -0.08, -1.05), { sweeps: 2, vertical: true });
  yield 6.5;
  // a helix pours down from the ceiling and corkscrews around the play space
  const helix = [C];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * TAU * 1.25 + Math.PI / 2;
    helix.push(V(Math.cos(a) * 0.48, 0.5 - i * 0.075, -0.55 + Math.sin(a) * 0.3));
  }
  helix.push(V(0, -1.2, -1.2));
  g.swarm.stream(helix, 36, 7.5, { interval: 0.06, spread: 0.05, aimedShots: 5 });
  g.sfx.play('rift', g.worldPos(C), { vol: 0.8 });
  yield 6.5;
  // finale: both rivers at once with a dart escort
  g.swarm.stream(riverPath(g, Lm, Rm, 1).map((p, i) => (i > 0 && i < 7 ? p.clone().add(V(0, 0.15, -0.05)) : p)), 24, 6, { interval: 0.08, spread: 0.08, aimedShots: 3 });
  g.swarm.stream(riverPath(g, Rm, Lm, -1).map((p, i) => (i > 0 && i < 7 ? p.clone().add(V(0, -0.1, -0.05)) : p)), 24, 6, { interval: 0.08, spread: 0.08, aimedShots: 3 });
  yield 2;
  spawnFormation(g, 5, () => [mouth(g, 'frontL'), V(-0.4, 0.3, -1.1), V(0.3, 0.25, -0.8), V(0.6, 0.0, -1.2), V(1.2, 0.2, -2.4)], 5.5, { spacing: 0.2, shots: 1 });
  yield* clearOrTimeout(g, 14);
}

function* wave4(g) {
  g.openRifts(['front', 'frontL', 'frontR', 'ceiling']);
  yield 1.6;
  const F = mouth(g, 'front'), L = mouth(g, 'frontL'), R = mouth(g, 'frontR'), C = mouth(g, 'ceiling');
  const carrier = spawnCarrier(g, F, V(0, 0.14, -1.3), { hp: 120 });
  yield 5.5;
  spawnBloom(g, L, V(-0.42, -0.05, -1.15), { arms: 3, phaseStep: 0.34, duration: 9, hp: 30 });
  spawnBloom(g, R, V(0.42, -0.05, -1.15), { arms: 3, phaseStep: -0.34, duration: 9, hp: 30 });
  yield 6;
  spawnLancer(g, C, V(0, 0.48, -0.95), { sweeps: 2, vertical: false, drop: true });
  yield 4;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    spawnFormation(g, 5, () => [s > 0 ? R : L, V(0.5 * s, 0.32, -1.0), V(0, 0.36, -0.7), V(-0.5 * s, 0.25, -0.9), V(-1.2 * s, 0.4, -2.2)], 5.2, { spacing: 0.2, shots: 1 });
    yield 2.5;
  }
  yield () => !carrier.alive;
  yield* clearOrTimeout(g, 10);
}

/** The full stage: waves with breathers, then the boss. Yields until the boss is defeated. */
export function* stage(g, startAt = 0) {
  for (let i = startAt; i < WAVES.length; i++) {
    const w = WAVES[i];
    g.beginWave(w);
    yield 2.2;
    yield* w.script(g);
    g.endWave(w);
    yield 6.0; // breather
  }
  yield* bossFight(g);
}

export function* bossFight(g) {
  g.beginBossWarning();
  yield 5.2;
  g.boss.begin();
  yield () => g.boss.defeated;
  yield 2.5;
}


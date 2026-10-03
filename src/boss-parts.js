// Physical target sockets in combat-plane units. Decorative model depth is never a target.
export const BOSS_PART_LAYOUTS = {
  gatekeeper: [
    { id: 'upper-pod', role: 'weapon', x: -.20, y: .95, r: .25, maxHp: 32, breakDamage: 15 },
    { id: 'lower-pod', role: 'weapon', x: -.20, y: -.95, r: .25, maxHp: 32, breakDamage: 15 },
  ],
  cathedral: [
    { id: 'upper-pod', role: 'weapon', x: -.20, y: 1.05, r: .28, maxHp: 70, breakDamage: 40 },
    { id: 'lower-pod', role: 'weapon', x: -.20, y: -1.05, r: .28, maxHp: 70, breakDamage: 40 },
    { id: 'upper-reactor', role: 'reactor', x: .18, y: 1.65, r: .26, maxHp: 90, breakDamage: 55 },
    { id: 'lower-reactor', role: 'reactor', x: .18, y: -1.65, r: .26, maxHp: 90, breakDamage: 55 },
  ],
};
export const BOSS_CORE_RADIUS = { gatekeeper: .22, cathedral: .28 };
export const bossCoreOpen = e => !!e.parts?.length && e.parts.every(p => p.broken);
export const createBossParts = type => (BOSS_PART_LAYOUTS[type] || []).map(part => ({ ...part, hp: part.maxHp, flash: 0, broken: false }));

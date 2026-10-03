// Fixed visual identity works without sampling or darkening the person's room.
export const KEYLINE = 0x111827;
export const WARM_CORE = 0xfff1cf;
export function projectileStyle(shot) {
  const hostile = shot.hostile;
  const color = hostile ? shot.kind === 'petal' ? 0xe62a83 : shot.kind === 'orb' ? 0xf9a825 : 0xf15a24
    : shot.kind === 'spread' ? 0x14c9a2 : shot.kind === 'rail' ? 0x6875ed : 0x1ba9dc;
  const length = hostile ? shot.r * (shot.kind === 'needle' ? 2.2 : shot.kind === 'petal' ? 1.65 : 1)
    : shot.kind === 'lance' ? .65 : shot.kind === 'rail' ? .42 : .23;
  return { color, core: hostile ? WARM_CORE : 0xd9fff4, length, width: shot.r * (hostile && shot.kind === 'needle' ? .7 : .9) };
}

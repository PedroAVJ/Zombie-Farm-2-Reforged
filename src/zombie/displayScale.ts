/** Whole-actor farm scale for the ordinary zombie families.
 *
 * Regular, Large/brute and Headless actors share the same body scale. Headless
 * actors are naturally shorter because their rig omits the head; scaling their
 * remaining bounds up to a regular zombie's height makes their shoulders too big.
 */
const FAMILY_SCALE: Readonly<Record<string, number>> = {
  Regular: 0.9,
  Large: 0.9,
  Headless: 0.9,
  Female: 0.8,
  Girl: 0.8,
  Garden: 0.7,
  Small: 0.6,
};

/** Special actors normally use regular size. These authored transformations are
 * deliberately smaller and retain their family silhouette. */
const SPECIAL_SCALE: Readonly<Record<string, number>> = {
  ZombieActorGardenTier5: 0.7,
  ZombieActorSmallTier5: 0.6,
  ZombieActorGirlTier5: 0.8,
  ZombieActorHeadlessTier5: 0.8,
};

export function zombieFarmScale(group: string, className: string, key: string): number {
  if (className === "Special" || className === "Yellow") {
    return SPECIAL_SCALE[key] ?? FAMILY_SCALE.Regular;
  }
  return FAMILY_SCALE[group] ?? FAMILY_SCALE.Regular;
}

/** Relative height used after raid actors have been normalized to the regular
 * target height. */
export function zombieRaidHeightScale(group: string, className: string, key: string): number {
  return zombieFarmScale(group, className, key) / FAMILY_SCALE.Regular;
}

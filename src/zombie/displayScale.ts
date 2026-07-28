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

/** Relative raid height that preserves the size seen on the farm.
 *
 * Raid actors are contain-fit to a target height, which otherwise erases the
 * naturally short bounds of a headless rig. Use the actual native rig heights
 * for that family rather than a guessed multiplier: ordinary Headless bodies
 * are less than half the height of a Regular rig, while the tier-5 Skull Head
 * is nearly full height and should not be shrunk like the genuinely headless
 * variants. Other families retain the existing authored raid sizing. */
export function zombieRaidHeightScale(
  group: string,
  className: string,
  key: string,
  nativeHeight: number,
  regularNativeHeight: number,
): number {
  const heightRatio = group === "Headless"
    ? nativeHeight / Math.max(1, regularNativeHeight)
    : 1;
  return (zombieFarmScale(group, className, key) / FAMILY_SCALE.Regular) * heightRatio;
}

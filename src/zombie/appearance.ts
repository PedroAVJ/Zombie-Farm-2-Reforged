/** White multiplication preserves the eye sprite's authored light-yellow color. */
export const DEFAULT_ZOMBIE_EYE_TINT = 0xffffff;
export const BRUTE_ZOMBIE_EYE_TINT = 0x111111;
export const DEFAULT_ZOMBIE_TEETH_TINT = 0xffffff;

export function zombiePartTint(file: string, bodyTint: number, group = ""): number {
  if (/^default(?:Upper|Lower)Teeth(?:\.png)?$/i.test(file)) {
    return DEFAULT_ZOMBIE_TEETH_TINT;
  }
  if (/^defaultEye[LR](?:\.png)?$/i.test(file)) {
    return group === "Large" ? BRUTE_ZOMBIE_EYE_TINT : DEFAULT_ZOMBIE_EYE_TINT;
  }
  return bodyTint;
}

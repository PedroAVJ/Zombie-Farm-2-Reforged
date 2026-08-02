/**
 * The recovered economy stores the post-brainflation values so existing saves,
 * server balances, and purchase arithmetic remain compatible. Player-facing
 * amounts use the classic scale from the original game.
 */
export const BRAIN_DISPLAY_SCALE = 10;

/** Convert an internal brain amount or delta to the classic displayed amount. */
export function displayBrains(internalBrains: number): number {
  if (!Number.isFinite(internalBrains)) return 0;
  return Math.trunc(internalBrains) * BRAIN_DISPLAY_SCALE;
}

/**
 * Convert a player-entered classic amount back to the save/server scale.
 * Classic brain amounts must be whole multiples of ten.
 */
export function parseDisplayedBrains(displayedBrains: number): number | null {
  if (!Number.isSafeInteger(displayedBrains) || displayedBrains < 0) return null;
  if (displayedBrains % BRAIN_DISPLAY_SCALE !== 0) return null;
  return displayedBrains / BRAIN_DISPLAY_SCALE;
}

/** Player-facing amount with the currency name. */
export function brainLabel(internalBrains: number): string {
  const displayed = displayBrains(internalBrains);
  return `${displayed} ${displayed === 1 ? "Brain" : "Brains"}`;
}

/** Scale numeric brain amounts embedded in recovered player-facing copy. */
export function displayBrainText(text: string): string {
  return text.replace(/\b(\d+)\s+Brains?\b/gi, (_match, rawAmount: string) =>
    `${displayBrains(Number(rawAmount))} Brains`
  );
}

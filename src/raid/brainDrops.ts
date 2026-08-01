/** Recovered invasion brain table. Amounts stay fixed; the live game uses a 2x
 * drop-rate event multiplier across every tier. Tiers roll rarest-first so a boss
 * can award at most one stack. */
export const BRAIN_DROP_RATE_MULTIPLIER = 2;
export const BRAIN_OPTIMAL_LEVEL = 20;
export const BRAIN_DROP_PROTECTION_CYCLE = 4;

const PROTECTION_RATE_MULTIPLIERS = [1, 1.5, 2, 2] as const;

// Post-brainflation revert: amounts are 1/10 of the old 50/30/10 stacks (a brain is now
// ~10x more valuable). Drop CHANCES are unchanged — only the stack sizes shrank.
const BASE_BRAIN_DROP_TABLE = [
  { amount: 5, lower: 0.005, upper: 0.01 },
  { amount: 3, lower: 0.01, upper: 0.02 },
  { amount: 1, lower: 0.025, upper: 0.05 },
] as const;

export function brainDropTable(recommendedLevel: number) {
  const frac = Math.max(0, Math.min(1, recommendedLevel / BRAIN_OPTIMAL_LEVEL));
  return BASE_BRAIN_DROP_TABLE.map((tier) => ({
    amount: tier.amount,
    chance: (tier.lower + (tier.upper - tier.lower) * frac) * BRAIN_DROP_RATE_MULTIPLIER,
  }));
}

export function rollBrainDrop(recommendedLevel: number, random: () => number = Math.random): number {
  for (const tier of brainDropTable(recommendedLevel)) {
    if (random() < tier.chance) return tier.amount;
  }
  return 0;
}

function normalizedSuccessfulInvasions(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Total successful invasions across the farm's per-mission progress counters. */
export function successfulInvasionCount(progress: Readonly<Record<string, number>>): number {
  return Object.values(progress).reduce(
    (total, wins) => total + normalizedSuccessfulInvasions(wins),
    0,
  );
}

/** Odds escalate across each four-successful-invasion reward cycle. */
export function brainDropProtectionMultiplier(priorSuccessfulInvasions: number): number {
  return PROTECTION_RATE_MULTIPLIERS[
    normalizedSuccessfulInvasions(priorSuccessfulInvasions) % BRAIN_DROP_PROTECTION_CYCLE
  ];
}

/**
 * Brain roll with drought protection. The recovered 5/3/1 tiers still roll
 * rarest-first, at escalating odds. If all tiers miss on the fourth successful
 * invasion in a cycle, one brain is awarded as a floor.
 */
export function rollProtectedBrainDrop(
  recommendedLevel: number,
  priorSuccessfulInvasions: number,
  random: () => number = Math.random,
): number {
  const prior = normalizedSuccessfulInvasions(priorSuccessfulInvasions);
  const multiplier = brainDropProtectionMultiplier(prior);
  for (const tier of brainDropTable(recommendedLevel)) {
    if (random() < Math.min(1, tier.chance * multiplier)) return tier.amount;
  }
  return prior % BRAIN_DROP_PROTECTION_CYCLE === BRAIN_DROP_PROTECTION_CYCLE - 1 ? 1 : 0;
}

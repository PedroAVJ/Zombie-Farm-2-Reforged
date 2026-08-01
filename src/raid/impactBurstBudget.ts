/**
 * Keep simultaneous melee feedback spread across the formation without creating
 * a full particle emitter for every zombie on the same fixed tick. Combat and
 * attack animation are unaffected; this budgets only the presentation dust.
 */
export const MAX_MELEE_IMPACT_BURSTS_PER_TICK = 4;

export function budgetImpactBursts<T>(
  impacts: readonly T[],
  limit = MAX_MELEE_IMPACT_BURSTS_PER_TICK,
): T[] {
  const take = Math.min(impacts.length, Math.max(0, Math.floor(limit)));
  if (take === 0) return [];
  if (take === impacts.length) return [...impacts];
  if (take === 1) return [impacts[Math.floor((impacts.length - 1) / 2)]];

  // Include both ends and distribute the remaining samples evenly between them,
  // so a large formation still shows impacts across its full visual width.
  return Array.from({ length: take }, (_, i) =>
    impacts[Math.round((i * (impacts.length - 1)) / (take - 1))]
  );
}

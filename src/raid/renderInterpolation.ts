/** Render a fixed-step value between its previous and current simulation samples. */
export function interpolateFixedStep(
  previous: number,
  current: number,
  accumulatorMs: number,
  tickMs: number
): number {
  const alpha = Math.max(0, Math.min(1, accumulatorMs / Math.max(1, tickMs)));
  return previous + (current - previous) * alpha;
}

/** Interpolate a unit position, snapping genuine teleports/state jumps. */
export function interpolatePosition(
  previous: { x: number; y: number },
  current: { x: number; y: number },
  accumulatorMs: number,
  tickMs: number,
  teleportPx: number
): { x: number; y: number } {
  if (Math.hypot(current.x - previous.x, current.y - previous.y) > teleportPx) return { ...current };
  return {
    x: interpolateFixedStep(previous.x, current.x, accumulatorMs, tickMs),
    y: interpolateFixedStep(previous.y, current.y, accumulatorMs, tickMs),
  };
}

/**
 * Keep the presentation-only left staging offset when a zombie is released, then
 * ease it out as the simulator advances from the focus slot. This preserves the
 * original-game staging position without snapping to the simulator's older slot.
 */
export function playerStagingOffset(
  state: string,
  x: number,
  chargeX: number,
  offset: number
): number {
  if (state === "waiting" || state === "charging") return offset;
  if (state !== "advance") return 0;
  return Math.max(0, offset - Math.max(0, x - chargeX));
}

/**
 * The ordinary raid boss changes from its elevated exit route to its ground-level
 * re-entry route in one simulation step. Keep that transition offstage for the
 * remainder of the render interval so a wide boss cannot flash at ground level
 * before its walk back in begins.
 */
export function isOffstageBossReentryFrame(
  state: string,
  previousY: number,
  currentY: number,
  structureY: number
): boolean {
  return state === "emerging" && previousY === structureY && currentY !== structureY;
}

/** Advance a visual-only countdown through the unsimulated fraction of a tick. */
export function visualCountdown(valueMs: number, accumulatorMs: number, tickMs: number): number {
  return Math.max(0, valueMs - Math.max(0, Math.min(tickMs, accumulatorMs)));
}

/** Extrapolate a projectile over the unsimulated fraction of a tick. */
export function extrapolatePosition(
  x: number,
  y: number,
  vx: number,
  vy: number,
  accumulatorMs: number,
  tickMs: number
): { x: number; y: number } {
  const dt = Math.max(0, Math.min(tickMs, accumulatorMs)) / 1000;
  return { x: x + vx * dt, y: y + vy * dt };
}

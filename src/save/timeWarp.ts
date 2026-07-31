import type { SaveGame, ZombiePotSave } from "./schema";

const shiftTimestamp = (timestamp: number | undefined, deltaMs: number): number | undefined => {
  if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= 0) return timestamp;
  return Math.max(0, timestamp - deltaMs);
};

const shiftPot = (pot: ZombiePotSave | undefined, deltaMs: number): void => {
  if (!pot) return;
  pot.startedAt = shiftTimestamp(pot.startedAt, deltaMs) ?? pot.startedAt;
  pot.finishAt = shiftTimestamp(pot.finishAt, deltaMs) ?? pot.finishAt;
};

/**
 * Age a normal Local Farm save without changing the device clock or introducing a
 * private clock format. The returned save remains compatible with the upstream
 * game because only its existing absolute timestamps are moved into the past.
 */
export function advanceLocalSaveTime(
  source: SaveGame,
  deltaMs: number,
  savedAt: number = Date.now(),
): SaveGame {
  const advanced = JSON.parse(JSON.stringify(source)) as SaveGame;
  const delta = Number.isFinite(deltaMs) ? Math.max(0, Math.floor(deltaMs)) : 0;
  advanced.savedAt = savedAt;
  if (!delta) return advanced;

  for (const plot of advanced.farm.plots) {
    if (plot.crop) plot.crop.plantedAt = shiftTimestamp(plot.crop.plantedAt, delta) ?? plot.crop.plantedAt;
  }
  for (const object of advanced.objects ?? []) {
    object.readyAt = shiftTimestamp(object.readyAt, delta);
  }

  shiftPot(advanced.zombiePot, delta);
  for (const pot of Object.values(advanced.zombiePots ?? {})) shiftPot(pot, delta);

  if (advanced.raids?.lastRaidAt !== undefined) {
    advanced.raids.lastRaidAt = shiftTimestamp(advanced.raids.lastRaidAt, delta);
  }

  if (advanced.epicBoss) {
    advanced.epicBoss.activatedAt = shiftTimestamp(advanced.epicBoss.activatedAt, delta) ?? advanced.epicBoss.activatedAt;
    advanced.epicBoss.expiresAt = shiftTimestamp(advanced.epicBoss.expiresAt, delta) ?? advanced.epicBoss.expiresAt;
    advanced.epicBoss.encounterStartedAt = shiftTimestamp(advanced.epicBoss.encounterStartedAt, delta) ?? advanced.epicBoss.encounterStartedAt;
    advanced.epicBoss.retryReadyAt = shiftTimestamp(advanced.epicBoss.retryReadyAt, delta) ?? advanced.epicBoss.retryReadyAt;
    advanced.epicBoss.completedAt = shiftTimestamp(advanced.epicBoss.completedAt, delta) ?? advanced.epicBoss.completedAt;
  }

  if (advanced.farmJobs) {
    advanced.farmJobs.savedAt = shiftTimestamp(advanced.farmJobs.savedAt, delta) ?? advanced.farmJobs.savedAt;
    for (const job of advanced.farmJobs.jobs) {
      job.queuedAt = shiftTimestamp(job.queuedAt, delta);
    }
  }

  for (const friend of advanced.social?.friends ?? []) {
    friend.lastGiftAt = shiftTimestamp(friend.lastGiftAt, delta);
  }

  return advanced;
}

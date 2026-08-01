import type { SaveGame } from "./schema";

export type TimeWarpCommitResult = "committed" | "cloud-unavailable" | "local-unavailable";

/** Commit one prepared time-warp snapshot to every active save destination.
 * Cloud goes first so a failed upload cannot be followed by a reload that restores
 * an older remote snapshot over a newer local one. */
export async function commitTimeWarp(
  save: SaveGame,
  syncCloud: ((save: SaveGame) => Promise<void>) | null,
  persistLocal: (save: SaveGame) => boolean,
): Promise<TimeWarpCommitResult> {
  if (syncCloud) {
    try { await syncCloud(save); }
    catch { return "cloud-unavailable"; }
  }
  return persistLocal(save) ? "committed" : "local-unavailable";
}

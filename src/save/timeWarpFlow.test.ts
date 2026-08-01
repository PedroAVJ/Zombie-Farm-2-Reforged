import { describe, expect, it, vi } from "vitest";
import type { SaveGame } from "./schema";
import { commitTimeWarp } from "./timeWarpFlow";

const save: SaveGame = {
  version: 1,
  savedAt: 1,
  player: { name: "Test", gold: 0, brains: 0, xp: 0, zombieMax: 16, zombieCount: 0 },
  farm: { fieldId: "default", w: 30, h: 30, plots: [] },
};

describe("Personal Cloud time warp commit", () => {
  it("waits for the cloud snapshot before committing locally", async () => {
    let confirmCloud!: () => void;
    const syncCloud = vi.fn(() => new Promise<void>((resolve) => { confirmCloud = resolve; }));
    const persistLocal = vi.fn(() => true);

    const committing = commitTimeWarp(save, syncCloud, persistLocal);
    await Promise.resolve();
    expect(syncCloud).toHaveBeenCalledWith(save);
    expect(persistLocal).not.toHaveBeenCalled();

    confirmCloud();
    await expect(committing).resolves.toBe("committed");
    expect(persistLocal).toHaveBeenCalledWith(save);
  });

  it("does not commit or reload from a stale cloud snapshot after an upload failure", async () => {
    const persistLocal = vi.fn(() => true);
    const result = await commitTimeWarp(save, async () => { throw new Error("offline"); }, persistLocal);

    expect(result).toBe("cloud-unavailable");
    expect(persistLocal).not.toHaveBeenCalled();
  });
});

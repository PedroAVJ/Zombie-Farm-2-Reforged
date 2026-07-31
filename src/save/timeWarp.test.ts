import { describe, expect, it } from "vitest";
import type { SaveGame } from "./schema";
import { advanceLocalSaveTime } from "./timeWarp";

const save = (): SaveGame => ({
  version: 1,
  savedAt: 9_000,
  player: { name: "Zombie Farmer", gold: 400, brains: 1, xp: 0, zombieMax: 16, zombieCount: 1 },
  farm: {
    fieldId: "default", w: 30, h: 30,
    plots: [{ oc: 1, or: 2, state: "planted", crop: { key: "carrot", isZombie: false, plantedAt: 8_000, growMs: 60_000 } }],
  },
  objects: [{ id: "tree", key: "appleTree", oc: 3, or: 4, readyAt: 12_000 }],
  zombiePot: { keyA: "a", keyB: "b", maskA: 0, maskB: 0, startedAt: 7_000, finishAt: 11_000 },
  zombiePots: { pot2: { keyA: "c", keyB: "d", maskA: 0, maskB: 0, startedAt: 6_000, finishAt: 10_000 } },
  raids: { completed: {}, lastRaidAt: 8_500 },
  epicBoss: {
    runId: "run", bossId: "boss", activatedAt: 5_000, expiresAt: 20_000,
    level: 1, maxHp: 10, currentHp: 10, encounterStartedAt: 0, retryReadyAt: 15_000,
    tokenCount: 0, completedAt: 0, attackOrder: [],
  },
  farmJobs: { savedAt: 8_000, jobs: [{ kind: "walk", oc: 0, or: 0, cx: 1, cy: 1, queuedAt: 8_500 }] },
  social: { friends: [{ id: "f1", name: "Friend", addedAt: 1_000, lastGiftAt: 9_000, giftsSent: 1 }] },
});

describe("advanceLocalSaveTime", () => {
  it("moves every gameplay timer into the past without mutating the source", () => {
    const source = save();
    const advanced = advanceLocalSaveTime(source, 4_000, 99_000);

    expect(advanced.savedAt).toBe(99_000);
    expect(advanced.farm.plots[0].crop?.plantedAt).toBe(4_000);
    expect(advanced.objects?.[0].readyAt).toBe(8_000);
    expect(advanced.zombiePot).toMatchObject({ startedAt: 3_000, finishAt: 7_000 });
    expect(advanced.zombiePots?.pot2).toMatchObject({ startedAt: 2_000, finishAt: 6_000 });
    expect(advanced.raids?.lastRaidAt).toBe(4_500);
    expect(advanced.epicBoss).toMatchObject({ activatedAt: 1_000, expiresAt: 16_000, encounterStartedAt: 0, retryReadyAt: 11_000, completedAt: 0 });
    expect(advanced.farmJobs).toMatchObject({ savedAt: 4_000, jobs: [{ queuedAt: 4_500 }] });
    expect(advanced.social?.friends[0].lastGiftAt).toBe(5_000);
    expect(source.farm.plots[0].crop?.plantedAt).toBe(8_000);
  });

  it("clamps timers at zero and ignores backward or invalid travel", () => {
    const source = save();
    const farAhead = advanceLocalSaveTime(source, 50_000, 100_000);
    expect(farAhead.farm.plots[0].crop?.plantedAt).toBe(0);
    expect(farAhead.epicBoss?.expiresAt).toBe(0);

    expect(advanceLocalSaveTime(source, -1, 101_000).farm.plots[0].crop?.plantedAt).toBe(8_000);
    expect(advanceLocalSaveTime(source, Number.NaN, 102_000).farm.plots[0].crop?.plantedAt).toBe(8_000);
  });
});

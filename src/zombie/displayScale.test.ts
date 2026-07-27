import { describe, expect, it } from "vitest";
import {
  HEADLESS_RAID_STATURE,
  zombieFarmScale,
  zombieRaidHeightScale,
} from "./displayScale";

describe("zombie display sizing", () => {
  it("keeps regular, brute, and headless bodies on the same actor scale", () => {
    expect(zombieFarmScale("Regular", "Green", "ZombieActorRegularTier1")).toBe(0.9);
    expect(zombieFarmScale("Large", "Green", "ZombieActorLargeTier1")).toBe(0.9);
    expect(zombieFarmScale("Headless", "Green", "ZombieActorHeadlessTier1")).toBe(0.9);
  });

  it("steps female, garden, and small families down in order", () => {
    const female = zombieFarmScale("Female", "Green", "ZombieActorGirlTier1");
    const garden = zombieFarmScale("Garden", "Green", "ZombieActorGardenTier1");
    const small = zombieFarmScale("Small", "Green", "ZombieActorSmallTier1");
    expect(0.9).toBeGreaterThan(female);
    expect(female).toBeGreaterThan(garden);
    expect(garden).toBeGreaterThan(small);
  });

  it("defaults named specials to regular size while retaining known small transformations", () => {
    expect(zombieFarmScale("Female", "Special", "ZombieActorZomBetty")).toBe(0.9);
    expect(zombieFarmScale("Small", "Special", "ZombieActorSmallTier5")).toBe(0.6);
    expect(zombieRaidHeightScale("Garden", "Green", "ZombieActorGardenTier1"))
      .toBeCloseTo(0.7 / 0.9);
  });

  it("keeps Headless rigs naturally short instead of enlarging their torso in raids", () => {
    expect(HEADLESS_RAID_STATURE).toBe(2 / 3);
    expect(zombieRaidHeightScale("Headless", "Green", "ZombieActorHeadlessTier1"))
      .toBeCloseTo(2 / 3);
    expect(zombieRaidHeightScale("Headless", "Special", "ZombieActorHeadlessTier5"))
      .toBeCloseTo((0.8 / 0.9) * (2 / 3));
  });

  it("carries every farm family size into raids relative to the regular baseline", () => {
    const cases = [
      ["Regular", "Green", "ZombieActorRegularTier1"],
      ["Large", "Green", "ZombieActorLargeTier1"],
      ["Headless", "Green", "ZombieActorHeadlessTier1"],
      ["Female", "Green", "ZombieActorGirlTier1"],
      ["Garden", "Green", "ZombieActorGardenTier1"],
      ["Small", "Green", "ZombieActorSmallTier1"],
      ["Small", "Special", "ZombieActorSmallTier5"],
      ["Girl", "Special", "ZombieActorGirlTier5"],
      ["Headless", "Special", "ZombieActorHeadlessTier5"],
    ] as const;

    for (const [group, className, key] of cases) {
      const stature = group === "Headless" ? HEADLESS_RAID_STATURE : 1;
      expect(zombieRaidHeightScale(group, className, key))
        .toBeCloseTo((zombieFarmScale(group, className, key) / 0.9) * stature);
    }
  });
});

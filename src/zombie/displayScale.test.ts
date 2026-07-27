import { describe, expect, it } from "vitest";
import { zombieFarmScale, zombieRaidHeightScale } from "./displayScale";

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
});

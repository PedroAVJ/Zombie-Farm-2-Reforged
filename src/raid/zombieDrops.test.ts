import { describe, expect, it } from "vitest";
import {
  dropsOldMcZombie,
  OLD_MC_ZOMBIE_DROP_RATE,
  OLD_MC_ZOMBIE_KEY,
} from "./zombieDrops";

describe("Old McZombie raid drop", () => {
  it("uses the existing Old McZombie roster key and an exact 1% threshold", () => {
    expect(OLD_MC_ZOMBIE_KEY).toBe("ZombieActorOldMcZombie");
    expect(OLD_MC_ZOMBIE_DROP_RATE).toBe(0.01);
    expect(dropsOldMcZombie(1, true, 0)).toBe(true);
    expect(dropsOldMcZombie(1, true, 0.009999999)).toBe(true);
    expect(dropsOldMcZombie(1, true, 0.01)).toBe(false);
  });

  it("never drops from a loss or a different invasion", () => {
    expect(dropsOldMcZombie(1, false, 0)).toBe(false);
    expect(dropsOldMcZombie(2, true, 0)).toBe(false);
  });
});

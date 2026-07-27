import { describe, expect, it } from "vitest";
import { advanceZombieWalkBlend } from "./ZombieUnit";

describe("zombie farm walk animation", () => {
  it("raises the arms progressively when a walk begins", () => {
    const halfway = advanceZombieWalkBlend(0, true, 0.15);
    expect(halfway).toBeCloseTo(0.5);
    expect(advanceZombieWalkBlend(halfway, true, 0.15)).toBe(1);
  });

  it("lowers the arms progressively after a walk ends", () => {
    const halfway = advanceZombieWalkBlend(1, false, 0.15);
    expect(halfway).toBeCloseTo(0.5);
    expect(advanceZombieWalkBlend(halfway, false, 0.15)).toBe(0);
  });

  it("clamps large or invalid frame deltas to a valid pose", () => {
    expect(advanceZombieWalkBlend(0.4, true, 2)).toBe(1);
    expect(advanceZombieWalkBlend(0.6, false, 2)).toBe(0);
    expect(advanceZombieWalkBlend(0.4, true, -1)).toBe(0.4);
  });
});

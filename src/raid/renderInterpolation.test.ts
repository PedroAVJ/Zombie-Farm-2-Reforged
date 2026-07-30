import { describe, expect, it } from "vitest";
import {
  extrapolatePosition,
  interpolateFixedStep,
  interpolatePosition,
  isOffstageBossReentryFrame,
  playerStagingOffset,
  visualCountdown,
} from "./renderInterpolation";

describe("raid render interpolation", () => {
  it("moves smoothly between 50 ms simulation samples", () => {
    expect(interpolateFixedStep(10, 20, 25, 50)).toBe(15);
  });

  it("clamps interpolation to the current sample", () => {
    expect(interpolateFixedStep(10, 20, 80, 50)).toBe(20);
  });

  it("snaps teleports instead of sliding across the battlefield", () => {
    expect(interpolatePosition({ x: 0, y: 0 }, { x: 100, y: 20 }, 10, 50, 40)).toEqual({ x: 100, y: 20 });
  });

  it("walks a released zombie out of its left staging offset without teleporting", () => {
    expect(playerStagingOffset("waiting", 100, 220, 75)).toBe(75);
    expect(playerStagingOffset("charging", 220, 220, 75)).toBe(75);
    expect(playerStagingOffset("advance", 220, 220, 75)).toBe(75);
    expect(playerStagingOffset("advance", 250, 220, 75)).toBe(45);
    expect(playerStagingOffset("advance", 295, 220, 75)).toBe(0);
    expect(playerStagingOffset("fight", 295, 220, 75)).toBe(0);
  });

  it("keeps the boss's perch-to-ground wrap transition offstage", () => {
    expect(isOffstageBossReentryFrame("emerging", -150, 365, -150)).toBe(true);
    expect(isOffstageBossReentryFrame("emerging", 365, 365, -150)).toBe(false);
    expect(isOffstageBossReentryFrame("descending", -150, -150, -150)).toBe(false);
  });

  it("advances visual countdowns between simulation ticks", () => {
    expect(visualCountdown(800, 20, 50)).toBe(780);
    expect(visualCountdown(10, 20, 50)).toBe(0);
  });

  it("extrapolates projectiles using their retained velocity", () => {
    expect(extrapolatePosition(10, 20, 100, -50, 25, 50)).toEqual({ x: 12.5, y: 18.75 });
  });
});

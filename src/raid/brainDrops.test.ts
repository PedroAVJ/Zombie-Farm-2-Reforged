import { describe, expect, it } from "vitest";
import {
  brainDropTable,
  brainDropProtectionMultiplier,
  rollBrainDrop,
  rollProtectedBrainDrop,
  successfulInvasionCount,
} from "./brainDrops";

describe("invasion brain drops", () => {
  it("doubles rate without changing the 5/3/1 awards", () => {
    expect(brainDropTable(20)).toEqual([
      { amount: 5, chance: 0.02 },
      { amount: 3, chance: 0.04 },
      { amount: 1, chance: 0.1 },
    ]);
  });

  it("rolls rarest-first and awards at most one tier", () => {
    expect(rollBrainDrop(20, () => 0.019)).toBe(5);
    const rolls = [0.5, 0.039];
    expect(rollBrainDrop(20, () => rolls.shift() ?? 1)).toBe(3);
    expect(rollBrainDrop(20, () => 1)).toBe(0);
  });

  it("raises the odds across a four-win protection cycle", () => {
    expect([0, 1, 2, 3].map(brainDropProtectionMultiplier)).toEqual([1, 1.5, 2, 2]);
    expect(brainDropProtectionMultiplier(4)).toBe(1);
  });

  it("guarantees at least one brain on every fourth successful boss invasion", () => {
    expect([0, 1, 2].map((wins) => rollProtectedBrainDrop(20, wins, () => 1))).toEqual([0, 0, 0]);
    expect(rollProtectedBrainDrop(20, 3, () => 1)).toBe(1);
    expect(rollProtectedBrainDrop(20, 7, () => 1)).toBe(1);
  });

  it("keeps the rare stacks available on a guaranteed win", () => {
    expect(rollProtectedBrainDrop(20, 3, () => 0)).toBe(5);
  });

  it("counts only valid completed invasion wins", () => {
    expect(successfulInvasionCount({ "1": 2, "8": 3, broken: -4, nope: Number.NaN })).toBe(5);
  });
});

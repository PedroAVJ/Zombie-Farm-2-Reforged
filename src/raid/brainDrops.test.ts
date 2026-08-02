import { describe, expect, it } from "vitest";
import {
  brainDropTable,
  brainDropOddsMultiplier,
  rollBrainDrop,
  rollEscalatingBrainDrop,
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

  it("raises every tier's odds after every successful boss invasion", () => {
    expect([0, 1, 2, 3, 9].map(brainDropOddsMultiplier)).toEqual([1, 2, 3, 4, 10]);
  });

  it("does not force a minimum award on the fourth invasion", () => {
    expect([0, 1, 2, 3, 7].map((wins) => rollEscalatingBrainDrop(20, wins, () => 1)))
      .toEqual([0, 0, 0, 0, 0]);
  });

  it("lets the real tiers become guaranteed in rarest-first order", () => {
    const almostOne = () => 1 - Number.EPSILON;
    expect(rollEscalatingBrainDrop(20, 9, almostOne)).toBe(1);
    expect(rollEscalatingBrainDrop(20, 24, almostOne)).toBe(3);
    expect(rollEscalatingBrainDrop(20, 49, almostOne)).toBe(5);
  });

  it("counts only valid completed invasion wins", () => {
    expect(successfulInvasionCount({ "1": 2, "8": 3, broken: -4, nope: Number.NaN })).toBe(5);
  });
});

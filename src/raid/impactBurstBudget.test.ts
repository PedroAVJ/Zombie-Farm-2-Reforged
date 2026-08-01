import { describe, expect, it } from "vitest";
import {
  budgetImpactBursts,
  MAX_MELEE_IMPACT_BURSTS_PER_TICK,
} from "./impactBurstBudget";

describe("simultaneous raid impact presentation", () => {
  it("keeps every impact when the group is within the visual budget", () => {
    expect(budgetImpactBursts(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("spreads a full army's dust across the formation", () => {
    const impacts = Array.from({ length: 16 }, (_, i) => i);
    const shown = budgetImpactBursts(impacts);

    expect(shown).toHaveLength(MAX_MELEE_IMPACT_BURSTS_PER_TICK);
    expect(shown).toEqual([0, 5, 10, 15]);
  });

  it("can suppress presentation effects without changing the impact list", () => {
    const impacts = [1, 2, 3];
    expect(budgetImpactBursts(impacts, 0)).toEqual([]);
    expect(impacts).toEqual([1, 2, 3]);
  });
});

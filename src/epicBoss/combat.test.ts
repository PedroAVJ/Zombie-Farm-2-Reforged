import { describe, expect, it } from "vitest";
import { DR_GROUNDHOG } from "./catalog";
import { rollEpicBossLoot } from "./combat";
import { epicLootWeight } from "./rewards";

describe("Epic Boss fallback loot", () => {
  it("unlocks source rewards by defeated level and prefers missing rewards", () => {
    expect(rollEpicBossLoot(DR_GROUNDHOG, 1, new Set(), () => 0)).toBeNull();
    expect(rollEpicBossLoot(DR_GROUNDHOG, 2, new Set(), () => 0)?.name).toContain("Evil Device");
    const owned = new Set(["Dr. Groundhog's Evil Device"]);
    expect(rollEpicBossLoot(DR_GROUNDHOG, 4, owned, () => 0)?.name).toContain("Tricycle");
  });

  it("does not duplicate the pet once collected", () => {
    const owned = new Set(DR_GROUNDHOG.loot.map((loot) => loot.name));
    const result = rollEpicBossLoot(DR_GROUNDHOG, 20, owned, () => 0);
    expect(result?.stageActor).toBeUndefined();
  });

  it("makes the ladder's top prize RARER than its first rung", () => {
    // The regression: a uniform pick gave the level-20 prize exactly the same odds as the
    // level-2 one, so climbing bought no better chance at what climbing unlocks.
    const top = DR_GROUNDHOG.loot.reduce((a, b) => (b.level > a.level ? b : a));
    const first = DR_GROUNDHOG.loot.reduce((a, b) => (b.level < a.level ? b : a));
    const counts = new Map<string, number>();
    let seed = 0.5;
    const random = () => {
      seed = (seed * 9301 + 0.49297) % 1; // deterministic spread, no Math.random in tests
      return seed;
    };
    for (let i = 0; i < 20_000; i++) {
      const loot = rollEpicBossLoot(DR_GROUNDHOG, top.level, new Set(), random);
      if (loot) counts.set(loot.name, (counts.get(loot.name) ?? 0) + 1);
    }
    const topHits = counts.get(top.name) ?? 0;
    const firstHits = counts.get(first.name) ?? 0;
    expect(topHits).toBeGreaterThan(0); // still reachable — rarer, not gated off
    expect(topHits * 2).toBeLessThan(firstHits); // and clearly rarer than the first rung
  });

  it("weights strictly by the unlocking rung", () => {
    expect(epicLootWeight(5)).toBeGreaterThan(epicLootWeight(10));
    expect(epicLootWeight(20)).toBeGreaterThan(epicLootWeight(40));
    expect(epicLootWeight(0)).toBe(epicLootWeight(1)); // level 0 can't divide by zero
  });
});

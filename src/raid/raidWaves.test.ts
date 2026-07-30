// Data-fidelity regression for the SHIPPED raid waves (public/assets/raids/raids.json).
//
// ZF2 picks the fought stage once — `stageSettings[playerLevel − recommendedLevel]`,
// clamped, with no in-fight wave advance — so a raid authoring a single stage fights
// that one wave at EVERY level. Only Old McDonnell ships a real 7-stage ladder.
//
// `tools/prep_raids.py` used to extrapolate McDonnell's ladder onto all 11 raids, which
// both under-fielded the mid raids (Circus 4500 HP against an authored 6300) and wildly
// over-fielded the late ones (Video Games 1,078,000 against an authored 121,200). These
// tests pin each raid's authored population so a regenerate can't silently drift again.
import { describe, it, expect } from "vitest";
import raidsJson from "../../public/assets/raids/raids.json";
import { fightStage } from "./RaidCatalog";
import type { RaidDef } from "./types";

const raids = raidsJson as unknown as RaidDef[];
const byId = (id: number) => raids.find((r) => r.id === id)!;

/** Authored `population` per raid, transcribed from the source Enemies.json — either
 *  the raid's single `stageSettings` entry (2 / 10 / 11) or its top-level field (the
 *  other seven). McDonnell is absent: it is a ladder, not one wave. */
const AUTHORED_POPULATION: Record<number, number> = {
  2: 10, 3: 6, 4: 10, 5: 2, 6: 20, 7: 8, 8: 8, 9: 8, 10: 8, 11: 8,
};

describe("raid waves — authored composition, not an extrapolated ladder", () => {
  it("only Old McDonnell ships a multi-stage ladder", () => {
    const laddered = raids.filter((r) => r.stages.length > 1).map((r) => r.id);
    expect(laddered).toEqual([1]);
    expect(byId(1).stages).toHaveLength(7);
  });

  it("every other raid ships exactly one authored wave", () => {
    for (const r of raids.filter((raid) => raid.id !== 1)) {
      expect(`${r.id}:${r.stages.length}`).toBe(`${r.id}:1`);
    }
  });

  it("a single-stage raid fights the same wave at every player level", () => {
    for (const r of raids.filter((raid) => raid.id !== 1)) {
      const at = (lvl: number) => fightStage(r, lvl);
      const base = at(r.recommendedLevel);
      expect(base).toBeTruthy();
      for (const lvl of [1, r.recommendedLevel - 5, r.recommendedLevel + 1, 40, 99]) {
        expect(at(lvl)).toBe(base);
      }
    }
  });

  it("each raid keeps its source-authored population", () => {
    for (const [id, population] of Object.entries(AUTHORED_POPULATION)) {
      const stage = byId(Number(id)).stages[0];
      expect(`raid${id} pop ${stage.population}`).toBe(`raid${id} pop ${population}`);
    }
  });

  it("Circus fields the authored 8-strong 20/80 minion mix plus the Ringmaster", () => {
    const stage = byId(8).stages[0];
    expect(stage.bossKey).toBe("CircusStageActorBoss");
    expect(stage.population).toBe(8);
    expect(stage.weighted).toEqual([
      { enemy: "CircusStageActorMinion1", frequency: 20 },
      { enemy: "CircusStageActorMinion2", frequency: 80 },
    ]);
  });

  it("every population wave carries a boss and a spawnable minion pool", () => {
    // A `population` stage with no weighted pool makes buildEnemyUnits spawn the boss
    // alone. Robots is the live hazard: its source `boss` field is null (all three bots
    // carry bossActions), so the boss has to come from the family resolver.
    for (const r of raids) {
      for (const stage of r.stages) {
        if (!stage.population) continue;
        const total = (stage.weighted ?? []).reduce((sum, w) => sum + w.frequency, 0);
        expect(`raid${r.id} pool ${total > 0}`).toBe(`raid${r.id} pool true`);
      }
    }
    for (const r of raids.filter((raid) => raid.id !== 1)) {
      expect(`raid${r.id} boss ${!!r.stages[0].bossKey}`).toBe(`raid${r.id} boss true`);
    }
  });
});

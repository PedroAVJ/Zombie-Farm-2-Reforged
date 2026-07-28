import { describe, it, expect } from "vitest";
import { resolveRaid, buildEnemyUnits, buildPlayerUnits } from "./CombatEngine";
import type { CombatUnit } from "./types";
import type { OwnedZombie } from "../zombie/types";

// resolveRaid is the deterministic instant-resolver. These tests pin the outcome
// direction and, crucially, that the recovered damage formula
// (max(0, dmg − armor) × (1 − DR)) is wired into the hit step.

function mk(over: Partial<CombatUnit> & { id: string; team: "player" | "enemy" }): CombatUnit {
  return {
    sourceKey: over.id,
    name: over.id,
    str: 10,
    dex: 5,
    con: 10,
    focus: 0,
    hp: 100,
    maxHp: 100,
    attackCooldownMs: 1000,
    attacks: [{ name: "", frequency: 1, mult: 1 }],
    isBoss: false,
    alive: true,
    isGarden: false,
    isHeadless: false,
    abilities: [],
    ...over,
  };
}

describe("resolveRaid outcome direction", () => {
  it("a strong army beats a weak wave", () => {
    const player = [mk({ id: "p", team: "player", str: 50, con: 50 })];
    const enemy = [mk({ id: "e", team: "enemy", str: 2, con: 5 })];
    expect(resolveRaid(player, enemy).win).toBe(true);
  });

  it("a weak army loses to a strong wave", () => {
    const player = [mk({ id: "p", team: "player", str: 2, con: 5 })];
    const enemy = [mk({ id: "e", team: "enemy", str: 50, con: 50 })];
    expect(resolveRaid(player, enemy).win).toBe(false);
  });
});

describe("damage formula is wired into the resolver", () => {
  const player = () => [mk({ id: "p", team: "player", str: 20, con: 30, dex: 10 })];

  it("near-total damage reduction on the enemy flips a win into a loss", () => {
    const winnable = resolveRaid(player(), [mk({ id: "e", team: "enemy", str: 3, con: 20 })]);
    expect(winnable.win).toBe(true);

    const armored = resolveRaid(player(), [
      mk({ id: "e", team: "enemy", str: 3, con: 20, damageReduction: 0.99 }),
    ]);
    expect(armored.win).toBe(false); // player's damage is reduced to ~0 → can't kill
  });

  it("flat armor ≥ the attacker's per-hit damage blocks all of it", () => {
    // player hitDamage = finalPower(str20×10) × mult(1) × K(0.7) = 140; armor 200 absorbs it.
    const blocked = resolveRaid(player(), [
      mk({ id: "e", team: "enemy", str: 3, con: 20, armor: 200 }),
    ]);
    expect(blocked.win).toBe(false);
    expect(blocked.playerDamage).toBe(0);
  });
});

describe("enemies engage one at a time (army concentration matters)", () => {
  const army = (team: "player" | "enemy", n: number) =>
    Array.from({ length: n }, (_, i) => mk({ id: `${team}${i}`, team, str: 10, con: 10 }));

  it("an even-stat army beats a same-size wave by focusing it down one at a time", () => {
    // Under an all-at-once wave this is a loss; one-at-a-time, the army's concentrated
    // fire wins with survivors.
    const r = resolveRaid(army("player", 5), army("enemy", 5));
    expect(r.win).toBe(true);
    expect(r.enemiesBeaten).toBe(5);
    expect(r.survivors.length).toBeGreaterThan(0);
  });

  it("still loses when badly outnumbered by equal units", () => {
    const r = resolveRaid(army("player", 1), army("enemy", 4));
    expect(r.win).toBe(false);
  });

  it("faces the wave sequentially — a lone zombie can chip several before falling", () => {
    // Weak-but-many player vs one tanky enemy: the whole army piles the single enemy.
    const tank = mk({ id: "boss", team: "enemy", str: 8, con: 40 });
    const r = resolveRaid(army("player", 6), [tank]);
    expect(r.win).toBe(true);
  });
});

describe("weighted raid populations", () => {
  it("preserves the authored population exactly after weight apportionment", () => {
    const stats = Object.fromEntries(["a", "b", "c"].map((key) => [key, {
      str: 1, dex: 1, con: 1, attacks: [],
    }]));
    const units = buildEnemyUnits({
      enemyKeys: [],
      population: 11,
      weighted: [
        { enemy: "a", frequency: 50 },
        { enemy: "b", frequency: 33 },
        { enemy: "c", frequency: 17 },
      ],
    }, stats, {});
    expect(units).toHaveLength(11);
    expect(units.filter((unit) => unit.sourceKey === "a")).toHaveLength(5);
    expect(units.filter((unit) => unit.sourceKey === "b")).toHaveLength(4);
    expect(units.filter((unit) => unit.sourceKey === "c")).toHaveLength(2);
  });
});

describe("buildPlayerUnits — level-scaling is applied", () => {
  const headless = (): OwnedZombie[] => [
    {
      id: "z1",
      key: "ZombieActorHeadless",
      name: "Bob",
      typeName: "Skull Head",
      group: "Headless",
      className: "Green",
      classColor: "#000",
      mutation: 0,
      str: 11,
      dex: 1,
      con: 29.7, // base con; Headless con floor is 11
      focus: 100,
      invasions: 0,
      col: 0,
      row: 0,
    },
  ];

  it("a low-level army fights weaker than a maxed one (con ramps HP)", () => {
    const lo = buildPlayerUnits(headless(), { playerLevel: 8 })[0]; // con -> floor 11
    const hi = buildPlayerUnits(headless(), { playerLevel: 25 })[0]; // con -> base 29.7
    expect(lo.maxHp).toBeLessThan(hi.maxHp);
    expect(lo.maxHp).toBe(1100); // con 11 × 100 (ground-truth hitPointsTotal)
    expect(hi.maxHp).toBe(2970); // con 29.7 × 100
  });

  it("omitting playerLevel fights at full base stats (no scaling)", () => {
    const full = buildPlayerUnits(headless(), {})[0];
    expect(full.maxHp).toBe(2970);
  });

  it("does not scale focus (only str/con/dex)", () => {
    const lo = buildPlayerUnits(headless(), { playerLevel: 8 })[0];
    expect(lo.focus).toBe(100); // unchanged despite low level
  });

  it("applies equipped farmer head strength and life bonuses", () => {
    const base = buildPlayerUnits(headless())[0];
    const buffed = buildPlayerUnits(headless(), {
      farmerStrengthMult: 1.1,
      farmerLifeMult: 1.1,
    })[0];
    expect(buffed.str).toBeCloseTo(base.str * 1.1);
    expect(buffed.maxHp).toBeCloseTo(base.maxHp * 1.1);
  });

  it("carries the owned mutation mask into the raid combat unit", () => {
    const mutated = headless()[0];
    mutated.group = "Regular";
    mutated.mutation = 4 | 64;
    expect(buildPlayerUnits([mutated])[0].mutation).toBe(4 | 64);
  });
});

describe("buildPlayerUnits — binary-authentic zombie abilities", () => {
  const owned = (
    id: string,
    group: string,
    className: string,
    over: Partial<OwnedZombie> = {}
  ): OwnedZombie => ({
    id,
    key: `ZombieActor${group}${className}`,
    name: id,
    typeName: id,
    group,
    className,
    classColor: "#000",
    mutation: 0,
    str: 10,
    dex: 2,
    con: 20,
    focus: 50,
    invasions: 0,
    col: 0,
    row: 0,
    ...over,
  });
  const unlocked = () => true;

  it("Chivalry buffs Girl stats but not its Regular carrier", () => {
    const girl = owned("girl", "Female", "Green");
    const carrier = owned("knight", "Regular", "Blue");
    const solo = buildPlayerUnits([girl], { abilityUnlocked: unlocked })[0];
    const [buffed, regular] = buildPlayerUnits([girl, carrier], { abilityUnlocked: unlocked });
    expect(buffed.str).toBeCloseTo(solo.str * 1.10);
    expect(buffed.dex).toBeCloseTo(solo.dex * 1.10);
    expect(buffed.maxHp).toBeCloseTo(solo.maxHp * 1.10);
    expect(regular.str).toBeCloseTo(10 * 1.05); // only its own +5% All Stats
  });

  it("Grace buffs Regular zombies", () => {
    const regular = owned("regular", "Regular", "Green");
    const carrier = owned("grace", "Female", "Blue");
    const solo = buildPlayerUnits([regular], { abilityUnlocked: unlocked })[0];
    const [buffed] = buildPlayerUnits([regular, carrier], { abilityUnlocked: unlocked });
    expect(buffed.str).toBeCloseTo(solo.str * 1.10);
    expect(buffed.dex).toBeCloseTo(solo.dex * 1.10);
    expect(buffed.maxHp).toBeCloseTo(solo.maxHp * 1.10);
  });

  it("Protect reduces damage for every group except Headless", () => {
    const regular = owned("regular", "Regular", "Green");
    const headless = owned("protector", "Headless", "Blue");
    const built = buildPlayerUnits([regular, headless], { abilityUnlocked: unlocked });
    expect(built[0].damageReduction).toBeCloseTo(0.20);
    expect(built[1].damageReduction).toBe(0);
  });

  it("Fortitude gives Headless zombies 10% Life", () => {
    const headless = owned("headless", "Headless", "Green");
    const garden = owned("garden", "Garden", "Blue");
    const solo = buildPlayerUnits([headless], { abilityUnlocked: unlocked })[0];
    const [buffed] = buildPlayerUnits([headless, garden], { abilityUnlocked: unlocked });
    expect(buffed.maxHp).toBeCloseTo(solo.maxHp * 1.10);
  });

  it("Turbo doubles walking only, without changing DEX or attack cadence", () => {
    const turbo = owned("turbo", "Headless", "Red");
    const base = owned("base", "Headless", "Green");
    const [fast] = buildPlayerUnits([turbo], { abilityUnlocked: unlocked });
    const [normal] = buildPlayerUnits([base], { abilityUnlocked: unlocked });
    expect(fast.dex).toBeCloseTo(normal.dex);
    expect(fast.attackCooldownMs).toBeCloseTo(normal.attackCooldownMs);
    expect(fast.walkingSpeedMult).toBe(2);
  });
});

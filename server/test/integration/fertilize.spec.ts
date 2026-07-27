import { describe, it, expect } from "vitest";
import { call, signIn, uniqueSub, seedPlowed, type Session } from "./helpers";

// The live client owns the Garden-zombie roll so the result can animate immediately.
// The existing /farm request persists that boolean and still caps its effect to the
// ordinary 2x vegetable harvest.

interface FarmRes {
  balance: { gold: number };
  results: { id: string; status: string; error?: string; fertilized?: boolean }[];
}

async function player(gold: number): Promise<Session> {
  const s = await signIn();
  await call("POST", "/economy/sync", s.token, { seed: { gold, brains: 0, xp: 0 } });
  return s;
}

// N carrot plants on distinct plots INSIDE the base 30x30 farm, all in one batch (the
// batch rolls the fertilize probability once, then each plant rolls independently against
// it). Action ids are salted with uniqueSub() because idempotency dedups by id GLOBALLY,
// so reusing "f-0" across tests would spuriously come back "duplicate".
//
// Coords stay in 0..26: Phase E bounds a plant to the OWNED farm, and a 4-tile plot only
// fits up to origin 26 on a 30-wide farm. Returns the plots too, so the caller can import
// them as plowed soil — a plant now needs tilled ground.
const SPAN = 27; // origins 0..26

function plants(n: number, fertilized = false) {
  const salt = uniqueSub();
  const actions = [];
  const plots = [];
  for (let i = 0; i < n; i++) {
    const oc = i % SPAN;
    const or = Math.floor(i / SPAN);
    plots.push({ oc, or });
    actions.push({ id: `${salt}-${i}`, type: "plant" as const, oc, or, cropKey: "carrot", fertilized });
  }
  return { actions, plots };
}

/** Plant n carrots on freshly-imported plowed soil. */
async function plantOnSoil(s: Session, n: number, fertilized = false) {
  const { actions, plots } = plants(n, fertilized);
  await seedPlowed(s, plots);
  return call<FarmRes>("POST", "/farm/actions", s.token, { actions });
}

describe("fertilize — immediate client result", () => {
  it("leaves crops unfertilized when the client reports no hit", async () => {
    const s = await player(1000);
    const r = await plantOnSoil(s, 40);
    const applied = r.body.results.filter((x) => x.status === "applied");
    expect(applied).toHaveLength(40);
    expect(applied.every((x) => x.fertilized === false)).toBe(true);
  });

  it("persists client-reported fertilization without a separate request", async () => {
    const s = await player(1000);
    const r = await plantOnSoil(s, 30, true);
    const applied = r.body.results.filter((x) => x.status === "applied");
    expect(applied).toHaveLength(30);
    expect(applied.every((x) => x.fertilized === true)).toBe(true);
  });
});

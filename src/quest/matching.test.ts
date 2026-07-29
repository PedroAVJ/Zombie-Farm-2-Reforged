import { describe, expect, it } from "vitest";
import { questSubjectMatches } from "./matching";

describe("quest subject matching", () => {
  it("matches barrel and hedge objectives as object families", () => {
    expect(questSubjectMatches("Barrel", "Pirate Barrel")).toBe(true);
    expect(questSubjectMatches("Hedge", "Heart Hedge")).toBe(true);
  });

  it("keeps other named objectives exact and respects word boundaries", () => {
    expect(questSubjectMatches("Heart Hedge", "Hedge")).toBe(false);
    expect(questSubjectMatches("Barrel", "Barrel Cactus")).toBe(true);
    expect(questSubjectMatches("Barrel", "Barrelhouse")).toBe(false);
    expect(questSubjectMatches("", "Anything")).toBe(true);
  });
});

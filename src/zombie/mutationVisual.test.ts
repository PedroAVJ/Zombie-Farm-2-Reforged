import { describe, expect, it } from "vitest";
import { matchesMutationReplacement } from "./mutationVisual";

describe("mutation visual replacements", () => {
  it("matches every base body silhouette without hiding unrelated decorations", () => {
    expect(matchesMutationReplacement("defaultBody", "body")).toBe(true);
    expect(matchesMutationReplacement("bellydancerBody", "body")).toBe(true);
    expect(matchesMutationReplacement("heartichokeBody", "body")).toBe(true);
    expect(matchesMutationReplacement("flytrapCollar", "body")).toBe(false);
  });

  it("replaces only the front arm", () => {
    expect(matchesMutationReplacement("defaultArmF", "armF")).toBe(true);
    expect(matchesMutationReplacement("diverArmF", "armF")).toBe(true);
    expect(matchesMutationReplacement("defaultArmB", "armF")).toBe(false);
    expect(matchesMutationReplacement("dragonArm", "armF")).toBe(false);
  });

  it("recognizes the complete base face as a head replacement target", () => {
    expect(matchesMutationReplacement("defaultHead", "head")).toBe(true);
    expect(matchesMutationReplacement("defaultEyeL", "head")).toBe(true);
    expect(matchesMutationReplacement("defaultUpperTeeth", "head")).toBe(true);
    expect(matchesMutationReplacement("defaultBody", "head")).toBe(false);
  });
});

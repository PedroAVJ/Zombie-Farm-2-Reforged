import { describe, expect, it } from "vitest";
import {
  BRAIN_DISPLAY_SCALE,
  brainLabel,
  displayBrainText,
  displayBrains,
  parseDisplayedBrains,
} from "./brainDisplay";

describe("classic brain presentation", () => {
  it("shows every internal brain as ten classic brains", () => {
    expect(BRAIN_DISPLAY_SCALE).toBe(10);
    expect(displayBrains(0)).toBe(0);
    expect(displayBrains(1)).toBe(10);
    expect(displayBrains(5)).toBe(50);
    expect(displayBrains(-3)).toBe(-30);
    expect(brainLabel(1)).toBe("10 Brains");
    expect(displayBrainText("Give 3 Brains, then earn 1 Brain."))
      .toBe("Give 30 Brains, then earn 10 Brains.");
  });

  it("accepts classic amounts only when they map exactly to internal units", () => {
    expect(parseDisplayedBrains(0)).toBe(0);
    expect(parseDisplayedBrains(10)).toBe(1);
    expect(parseDisplayedBrains(50)).toBe(5);
    expect(parseDisplayedBrains(15)).toBeNull();
    expect(parseDisplayedBrains(-10)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  BRUTE_ZOMBIE_EYE_TINT,
  DEFAULT_ZOMBIE_EYE_TINT,
  DEFAULT_ZOMBIE_TEETH_TINT,
  zombiePartTint,
} from "./appearance";

describe("zombie appearance", () => {
  it("keeps default eyes light yellow while other tintable parts use the body color", () => {
    expect(zombiePartTint("defaultEyeL", 0x123456)).toBe(DEFAULT_ZOMBIE_EYE_TINT);
    expect(zombiePartTint("defaultEyeR.png", 0x123456)).toBe(DEFAULT_ZOMBIE_EYE_TINT);
    expect(zombiePartTint("defaultHead", 0x123456)).toBe(0x123456);
  });

  it("keeps teeth white and gives brute-family zombies black eyes", () => {
    expect(zombiePartTint("defaultUpperTeeth", 0x7bff4a)).toBe(DEFAULT_ZOMBIE_TEETH_TINT);
    expect(zombiePartTint("defaultLowerTeeth.png", 0xffff5f)).toBe(DEFAULT_ZOMBIE_TEETH_TINT);
    expect(zombiePartTint("defaultEyeL", 0x123456, "Large")).toBe(BRUTE_ZOMBIE_EYE_TINT);
  });
});

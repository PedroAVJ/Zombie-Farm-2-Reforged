import { describe, expect, it } from "vitest";
import { shouldActivateWaitingWorker } from "./pwaUpdate";

describe("PWA update activation", () => {
  it("activates a waiting worker when the player explicitly refreshed", () => {
    expect(shouldActivateWaitingWorker("reload")).toBe(true);
  });

  it("does not interrupt a live navigation or history traversal", () => {
    expect(shouldActivateWaitingWorker("navigate")).toBe(false);
    expect(shouldActivateWaitingWorker("back_forward")).toBe(false);
    expect(shouldActivateWaitingWorker(undefined)).toBe(false);
  });
});

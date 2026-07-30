import { describe, expect, it } from "vitest";
import { bindBackdropDismiss, shouldBlockFreshMenuActivation } from "./Modal";

/** Minimal stand-in for a backdrop element: records the listeners so a test can
 * replay a gesture without a DOM (same duck-typing the touch-input tests use). */
function fakeBackdrop() {
  const on: Record<string, ((e: { target: unknown }) => void)[]> = {};
  const bg = {
    addEventListener(type: string, handler: (e: { target: unknown }) => void) {
      (on[type] ??= []).push(handler);
    },
    fire(type: string, target: unknown) {
      for (const h of on[type] ?? []) h({ target });
    },
  };
  return bg;
}

describe("backdrop dismissal", () => {
  it("closes on a click that also pressed the backdrop", () => {
    const bg = fakeBackdrop();
    let closed = 0;
    bindBackdropDismiss(bg, () => closed++);
    bg.fire("pointerdown", bg);
    bg.fire("click", bg);
    expect(closed).toBe(1);
  });

  it("ignores the opening tap's trailing click", () => {
    // The panel is appended under the finger during pointer-up, so the backdrop
    // never saw a press. Dismissing here would close the panel on the very tap
    // that opened it — the mobile "tapping the plot does nothing" bug.
    const bg = fakeBackdrop();
    let closed = 0;
    bindBackdropDismiss(bg, () => closed++);
    bg.fire("click", bg);
    expect(closed).toBe(0);
  });

  it("leaves clicks on the panel inside the backdrop alone", () => {
    const bg = fakeBackdrop();
    const panel = {};
    let closed = 0;
    bindBackdropDismiss(bg, () => closed++);
    bg.fire("pointerdown", panel);
    bg.fire("click", panel);
    expect(closed).toBe(0);
  });

  it("does not let one press arm a second dismissal", () => {
    const bg = fakeBackdrop();
    let closed = 0;
    bindBackdropDismiss(bg, () => closed++);
    bg.fire("pointerdown", bg);
    bg.fire("click", bg);
    bg.fire("click", bg);
    expect(closed).toBe(1);
  });
});

describe("fresh menu activation guard", () => {
  it("blocks interactive controls during the opening window", () => {
    expect(shouldBlockFreshMenuActivation(1250, 1100, true)).toBe(true);
    expect(shouldBlockFreshMenuActivation(1250, 1250, true)).toBe(false);
    expect(shouldBlockFreshMenuActivation(1250, 1100, false)).toBe(false);
  });
});

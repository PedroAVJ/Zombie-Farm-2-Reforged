import { describe, expect, it, vi } from "vitest";
import { ZombieField } from "./ZombieField";

type UnitStub = {
  sleepAt: ReturnType<typeof vi.fn>;
  wake: ReturnType<typeof vi.fn>;
};

const subject = (units: UnitStub[]) => {
  const zombies = Object.create(ZombieField.prototype) as ZombieField;
  Object.assign(zombies, { units, gathered: false });
  return zombies;
};

describe("Zombie Patch persistence", () => {
  it("restores gathered zombies to sleep across the patch tiles", () => {
    const units = [
      { sleepAt: vi.fn(), wake: vi.fn() },
      { sleepAt: vi.fn(), wake: vi.fn() },
      { sleepAt: vi.fn(), wake: vi.fn() },
    ];
    const zombies = subject(units);

    zombies.restoreGathered(true, [{ col: 4, row: 5 }, { col: 6, row: 7 }]);

    expect(zombies.isGathered).toBe(true);
    expect(units[0].sleepAt).toHaveBeenCalledWith(4, 5);
    expect(units[1].sleepAt).toHaveBeenCalledWith(6, 7);
    expect(units[2].sleepAt).toHaveBeenCalledWith(4, 5);
  });

  it("defaults old saves to awake and ignores a stale nap without a patch", () => {
    const unit = { sleepAt: vi.fn(), wake: vi.fn() };
    const zombies = subject([unit]);

    zombies.restoreGathered(undefined, [{ col: 4, row: 5 }]);
    expect(zombies.isGathered).toBe(false);
    expect(unit.wake).toHaveBeenCalledOnce();

    zombies.restoreGathered(true, null);
    expect(zombies.isGathered).toBe(false);
    expect(unit.sleepAt).not.toHaveBeenCalled();
  });
});

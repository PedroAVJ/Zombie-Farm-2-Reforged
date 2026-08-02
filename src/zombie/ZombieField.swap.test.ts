import { describe, expect, it, vi } from "vitest";
import { ZombieField } from "./ZombieField";

const zombie = (id: string, col: number, row: number) => ({
  id,
  key: id,
  name: id,
  typeName: id,
  group: id === "garden" ? "Garden" : "Regular",
  className: "Green",
  classColor: "#00ff00",
  mutation: 0,
  str: 1,
  dex: 1,
  con: 1,
  focus: 1,
  invasions: 0,
  col,
  row,
});

describe("Mausoleum quick swap", () => {
  it("atomically exchanges a deployed and stored zombie at full capacity", () => {
    const outgoing = zombie("garden", 8, 11);
    const incoming = zombie("army", 2, 3);
    const outgoingUnit = {
      id: outgoing.id,
      getData: vi.fn(() => outgoing),
      destroy: vi.fn(),
    };
    const added: ReturnType<typeof zombie>[] = [];
    const subject = Object.assign(Object.create(ZombieField.prototype), {
      units: [outgoingUnit],
      stored: [incoming],
      selected: outgoingUnit,
      addUnit: vi.fn(),
      syncCount: vi.fn(),
    }) as ZombieField;
    (subject as any).addUnit.mockImplementation((data: ReturnType<typeof zombie>) => {
      added.push(data);
      (subject as any).units.push({ id: data.id, getData: () => data, destroy: vi.fn() });
    });

    expect(subject.swap("garden", "army")).toBe(true);
    expect(outgoingUnit.destroy).toHaveBeenCalledOnce();
    expect((subject as any).units).toHaveLength(1);
    expect((subject as any).units[0].id).toBe("army");
    expect((subject as any).stored).toEqual([outgoing]);
    expect(added).toEqual([{ ...incoming, col: 8, row: 11 }]);
    expect((subject as any).selected).toBeNull();
    expect((subject as any).syncCount).toHaveBeenCalledOnce();
  });

  it("does not change either roster when one side is missing", () => {
    const outgoing = zombie("garden", 8, 11);
    const outgoingUnit = { id: outgoing.id, getData: vi.fn(() => outgoing), destroy: vi.fn() };
    const subject = Object.assign(Object.create(ZombieField.prototype), {
      units: [outgoingUnit],
      stored: [zombie("army", 2, 3)],
      selected: null,
      addUnit: vi.fn(),
      syncCount: vi.fn(),
    }) as ZombieField;

    expect(subject.swap("missing", "army")).toBe(false);
    expect(subject.swap("garden", "missing")).toBe(false);
    expect(outgoingUnit.destroy).not.toHaveBeenCalled();
    expect((subject as any).addUnit).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeSaveKey } from "./profiles";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("Local Farm profile migration", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("adopts the original single-slot Local Farm save into Profile 1", () => {
    const legacy = JSON.stringify({
      version: 1,
      savedAt: 123,
      player: { name: "Legacy Farm" },
      farm: { plots: [] },
    });
    localStorage.setItem("zf2r.save.v1", legacy);

    const key = activeSaveKey();

    expect(key).toBe("zf2r.local.save.v1::p1");
    expect(localStorage.getItem(key)).toBe(legacy);
    expect(localStorage.getItem("zf2r.save.v1")).toBe(legacy);
  });
});

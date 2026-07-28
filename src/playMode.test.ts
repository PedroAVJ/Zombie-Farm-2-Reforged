import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  choosePlayMode, clearPreferredPlayMode, getPreferredPlayMode, setPreferredPlayMode,
} from "./playMode";

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

describe("play mode preference", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("keeps Local Farm and Online Farm as an explicit persisted choice", () => {
    expect(getPreferredPlayMode()).toBeNull();
    setPreferredPlayMode("local");
    expect(getPreferredPlayMode()).toBe("local");
    setPreferredPlayMode("online");
    expect(getPreferredPlayMode()).toBe("online");
    clearPreferredPlayMode();
    expect(getPreferredPlayMode()).toBeNull();
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("zf2r.play-mode.v1", "sometimes");
    expect(getPreferredPlayMode()).toBeNull();
  });

  it("opens Local Farm directly when online services are not configured", async () => {
    setPreferredPlayMode("online");
    await expect(choosePlayMode(false)).resolves.toBe("local");
    expect(getPreferredPlayMode()).toBe("local");
  });
});

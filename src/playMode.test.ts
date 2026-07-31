import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  choosePlayMode, clearPreferredPlayMode, getPreferredPlayMode, setPreferredPlayMode,
  farmModeSettingsNote, localFarmProfileNote,
  otherPlayMode, playModeDestinationLabel, usesOnlineGameplay,
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

  it("keeps server-owned gameplay disabled for Local Farm", () => {
    // A browser may still hold a valid Online Farm session after the player
    // switches farms. That retained login must not change Local Farm behavior.
    expect(usesOnlineGameplay("local")).toBe(false);
    expect(usesOnlineGameplay("online")).toBe(true);
  });

  it("labels a direct switch to the other independent farm", () => {
    expect(otherPlayMode("local")).toBe("online");
    expect(playModeDestinationLabel("local")).toBe("Go to Online Farm");
    expect(otherPlayMode("online")).toBe("local");
    expect(playModeDestinationLabel("online")).toBe("Go to Local Farm");
  });

  it("mentions the other farm only when switching can actually be offered", () => {
    expect(farmModeSettingsNote("local", true))
      .toBe("Saved on this device only. Online Farm has separate progress.");
    expect(farmModeSettingsNote("online", true))
      .toBe("Saved to your account. Local Farm has separate progress.");
    expect(localFarmProfileNote(true))
      .toBe("Local Farm is saved on this device. Online Farm has separate progress.");
  });

  it("never advertises Online Farm on a Local-only build", () => {
    expect(farmModeSettingsNote("local", false)).toBe("Saved on this device only.");
    expect(localFarmProfileNote(false)).toBe("Local Farm is saved on this device.");
    expect(farmModeSettingsNote("local", false)).not.toContain("Online");
    expect(localFarmProfileNote(false)).not.toContain("Online");
  });
});

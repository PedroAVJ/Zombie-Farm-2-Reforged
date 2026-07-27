import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDayNightMode,
  getWeatherEnabled,
  isLocalNight,
  setDayNightMode,
  setWeatherEnabled,
} from "./prefs";

describe("environment preferences", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  });
  beforeEach(() => values.clear());

  it("defaults day/night to local-clock auto mode", () => {
    expect(getDayNightMode()).toBe("auto");
    setDayNightMode("night");
    expect(getDayNightMode()).toBe("night");
  });

  it("uses the device-local 7pm to 7am night window", () => {
    expect(isLocalNight(new Date(2026, 6, 26, 6, 59))).toBe(true);
    expect(isLocalNight(new Date(2026, 6, 26, 7, 0))).toBe(false);
    expect(isLocalNight(new Date(2026, 6, 26, 18, 59))).toBe(false);
    expect(isLocalNight(new Date(2026, 6, 26, 19, 0))).toBe(true);
  });

  it("persists the cosmetic weather toggle", () => {
    expect(getWeatherEnabled()).toBe(false);
    setWeatherEnabled(true);
    expect(getWeatherEnabled()).toBe(true);
  });
});

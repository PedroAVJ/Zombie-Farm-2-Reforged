import { describe, expect, it } from "vitest";
import { purgeRetiredOnlineStorage } from "./storageCleanup";

function memoryStorage(entries: Record<string, string>): Storage {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("retired online storage cleanup", () => {
  it("preserves every live local and online namespace", () => {
    const storage = memoryStorage({
      "zf2r.local.save.v1::p1": "farm",
      "zf2r.local.save.v1::p1.backup": "backup",
      "zf2r.profiles.v1": "profiles",
      "zf2r.play-mode.v1": "local",
      "zf2r.spriteSet": "zf2",
      "zf2r.farmBackground": "classic",
      "zf2r.dayNight": "auto",
      "zf2r.v3.settings": "settings",
      "zf2r.online.outbox.v1::account": "commands",
      "zf2r.online.snapshot.v1::account": "snapshot",
      "zf2r.online.presentation.v1::account": "presentation",
      "zf2r.v3.session": "session",
      "zf2r.v4.writer-client": "writer",
      "zf2r.save.v1": "legacy-local-farm",
    });

    purgeRetiredOnlineStorage(storage);

    expect(storage.length).toBe(14);
  });

  it("removes only known retired online credentials and outboxes", () => {
    const storage = memoryStorage({
      "zf2r.session.v1": "retired-session",
      "zf2r.econ.outbox.v1::account": "retired-economy",
      "zf2r.raid.outbox.v1::account": "retired-raid",
      "unrelated.key": "keep",
    });

    purgeRetiredOnlineStorage(storage);

    expect(storage.getItem("zf2r.session.v1")).toBeNull();
    expect(storage.getItem("zf2r.econ.outbox.v1::account")).toBeNull();
    expect(storage.getItem("zf2r.raid.outbox.v1::account")).toBeNull();
    expect(storage.getItem("unrelated.key")).toBe("keep");
  });
});

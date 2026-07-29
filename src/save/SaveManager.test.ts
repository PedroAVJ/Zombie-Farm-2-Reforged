import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../net/api";
import { SaveManager } from "./SaveManager";
import { activeSaveKey } from "./profiles";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
};

describe("SaveManager presentation conflicts", () => {
  it("adopts the committed server version after a lost PUT response", async () => {
    const manager = new SaveManager(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new Map(),
      new Map(),
      async () => undefined,
    );
    const first = { camera: { x: 1, y: 2 } };
    const second = { camera: { x: 3, y: 4 } };
    const put = vi.spyOn(api, "putPresentationV3")
      .mockRejectedValueOnce(new api.ApiError(409, "presentation_conflict"))
      .mockResolvedValueOnce({ version: 2, data: second });
    vi.spyOn(api, "bootstrap").mockResolvedValue({
      presentation: { version: 1, data: first },
    } as never);

    await (manager as any).push(first);
    await (manager as any).push(second);

    expect(api.bootstrap).toHaveBeenCalledWith(true);
    expect(put).toHaveBeenNthCalledWith(2, {
      protocolVersion: 3,
      expectedVersion: 1,
      data: second,
    });
    expect((manager as any).presentationDirty).toBe(false);
  });
});

describe("SaveManager object layout races", () => {
  it("retains a removed object's position until authoritative settlement", () => {
    const field = {
      serializeObjects: vi.fn()
        .mockReturnValueOnce([{ id: "candle-1", key: "candle", oc: 8, or: 9 }])
        .mockReturnValueOnce([]),
    };
    const manager = new SaveManager(
      {} as never, field as never, {} as never, {} as never, {} as never,
      new Map(), new Map(), async () => undefined, "online",
    );
    vi.spyOn(manager, "serialize").mockImplementation(() => ({
      version: 1,
      savedAt: 1,
      player: { name: "Tester", farmerAppearance: {} },
      farm: { fieldId: "default", w: 30, h: 30, climate: "grass", plots: [] },
      objects: field.serializeObjects(),
    } as never));

    expect((manager as any).presentation().objectLayout).toEqual([
      { id: "candle-1", oc: 8, or: 9, rotation: undefined },
    ]);
    expect((manager as any).presentation().objectLayout).toEqual([
      { id: "candle-1", oc: 8, or: 9, rotation: undefined },
    ]);

    manager.reconcileObjectLayouts(new Set());
    expect((manager as any).presentation().objectLayout).toEqual([]);
  });
});

describe("SaveManager mode isolation", () => {
  it("never falls back to a Local Farm write from Online Farm", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.spyOn(api, "isConfigured").mockReturnValue(false);
    const manager = new SaveManager(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      new Map(), new Map(), async () => undefined, "online",
    );
    vi.spyOn(manager, "serialize").mockReturnValue({ version: 1, savedAt: 1 } as never);

    manager.save();

    expect(localStorage.length).toBe(0);
  });

  it("rotates a last-known-good backup for Local Farm", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const manager = new SaveManager(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      new Map(), new Map(), async () => undefined, "local",
    );
    const first = { version: 1, savedAt: 1 };
    const second = { version: 1, savedAt: 2 };

    (manager as any).writeLocal(first);
    (manager as any).writeLocal(second);

    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!);
    const primary = keys.find((key) => !key.endsWith(".backup") && !key.endsWith(".tmp") && key.includes("local.save"));
    expect(primary).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(primary!) ?? "null")).toMatchObject(second);
    expect(JSON.parse(localStorage.getItem(`${primary}.backup`) ?? "null")).toMatchObject(first);
  });

  it("does not rewrite a farm after persistence is suspended for a switch or reset", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const manager = new SaveManager(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      new Map(), new Map(), async () => undefined, "local",
    );
    const write = vi.spyOn(manager as any, "writeLocal");

    manager.suspend();
    manager.flushCritical();

    expect(write).not.toHaveBeenCalled();
  });

  it("does not treat an existing but unreadable Local Farm as a new farm", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const manager = new SaveManager(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      new Map(), new Map(), async () => undefined, "local",
    );
    const key = activeSaveKey();
    const stored = JSON.stringify({
      version: 1,
      savedAt: 123,
      player: { name: "Preserve Me" },
      farm: { plots: [] },
    });
    localStorage.setItem(key, stored);
    vi.spyOn(manager as any, "applySave").mockRejectedValue(new Error("temporary hydrate failure"));

    await expect(manager.load()).resolves.toEqual({
      kind: "local-unavailable",
      reason: "save_unreadable",
    });
    expect(localStorage.getItem(key)).toBe(stored);
  });

  it("reports unavailable storage instead of creating a disposable Local Farm", async () => {
    const blocked = memoryStorage();
    blocked.getItem = () => { throw new Error("storage blocked"); };
    vi.stubGlobal("localStorage", blocked);
    const manager = new SaveManager(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      new Map(), new Map(), async () => undefined, "local",
    );

    await expect(manager.load()).resolves.toEqual({
      kind: "local-unavailable",
      reason: "storage_unavailable",
    });
  });
});

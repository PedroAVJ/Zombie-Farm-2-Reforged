import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetHttpError,
  fetchJson,
  mapConcurrent,
  retry,
} from "./assetLoading";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startup asset resilience", () => {
  it("retries a transient operation with exponential backoff", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValue("loaded");
    const sleep = vi.fn(async () => undefined);

    await expect(retry(operation, {
      attempts: 4,
      baseDelayMs: 100,
      sleep,
      random: () => 0.5,
    })).resolves.toBe("loaded");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it("never exceeds the requested concurrency and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const run = mapConcurrent([1, 2, 3, 4, 5], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return value * 10;
    });

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()!();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()!();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    while (releases.length) releases.shift()!();
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
    while (releases.length) releases.shift()!();

    await expect(run).resolves.toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("retries retryable JSON responses but not a missing asset", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ready: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson<{ ready: boolean }>("/assets/catalog.json"))
      .resolves.toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchJson("/assets/missing.json"))
      .rejects.toBeInstanceOf(AssetHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

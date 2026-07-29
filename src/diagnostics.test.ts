import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordDiagnostic,
  diagnosticsReport,
  diagnosticsCount,
  clearDiagnostics,
} from "./diagnostics";

const entry = (message: string, at = 1_700_000_000_000) =>
  ({ at, kind: "error" as const, message });

describe("diagnostics buffer", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  beforeEach(() => values.clear());

  it("records and counts entries", () => {
    expect(diagnosticsCount()).toBe(0);
    recordDiagnostic(entry("boom"));
    recordDiagnostic(entry("bang"));
    expect(diagnosticsCount()).toBe(2);
  });

  it("keeps only the newest 20 so it can't crowd out the save", () => {
    for (let i = 0; i < 30; i++) recordDiagnostic(entry(`err-${i}`));
    expect(diagnosticsCount()).toBe(20);
    const report = diagnosticsReport();
    // Oldest dropped, newest retained.
    expect(report).not.toContain("err-0");
    expect(report).toContain("err-29");
  });

  it("truncates oversized stacks", () => {
    recordDiagnostic({ ...entry("huge"), stack: "x".repeat(5000) });
    const report = diagnosticsReport();
    expect(report).toContain("huge");
    expect(report.length).toBeLessThan(3000);
  });

  it("reports build id and extra fields, and says so when empty", () => {
    const report = diagnosticsReport({ mode: "local" });
    expect(report).toContain("build:");
    expect(report).toContain("local");
    expect(report).toContain("none recorded");
  });

  it("survives unparseable stored data", () => {
    localStorage.setItem("zf2r.diagnostics.v1", "{not json");
    expect(diagnosticsCount()).toBe(0);
    recordDiagnostic(entry("after corruption"));
    expect(diagnosticsCount()).toBe(1);
  });

  it("clears the buffer", () => {
    recordDiagnostic(entry("boom"));
    clearDiagnostics();
    expect(diagnosticsCount()).toBe(0);
  });
});

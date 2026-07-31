import { describe, expect, it } from "vitest";
import { validPairingToken } from "./personalCloud";

describe("Personal Cloud pairing tokens", () => {
  it("accepts only long, URL-fragment-safe private tokens", () => {
    expect(validPairingToken(`zfpc_${"a".repeat(43)}`)).toBe(true);
    expect(validPairingToken("short-secret")).toBe(false);
    expect(validPairingToken(`zfpc_${"a".repeat(31)}`)).toBe(false);
    expect(validPairingToken(`zfpc_${"a".repeat(40)}!`)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { personalCloudTokenFromText, validPairingToken } from "./personalCloud";

describe("Personal Cloud pairing tokens", () => {
  it("accepts only long, URL-fragment-safe private tokens", () => {
    expect(validPairingToken(`zfpc_${"a".repeat(43)}`)).toBe(true);
    expect(validPairingToken("short-secret")).toBe(false);
    expect(validPairingToken(`zfpc_${"a".repeat(31)}`)).toBe(false);
    expect(validPairingToken(`zfpc_${"a".repeat(40)}!`)).toBe(false);
  });

  it("extracts a current private token from the copied iPhone link", () => {
    const token = `zfpc_${"c".repeat(43)}`;
    expect(personalCloudTokenFromText(token, "https://example.test/")).toBe(token);
    expect(personalCloudTokenFromText(
      `https://example.test/#personal-cloud=${token}`,
      "https://example.test/",
    )).toBe(token);
    expect(personalCloudTokenFromText(
      "https://example.test/#personal-cloud=expired",
      "https://example.test/",
    )).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  isCountryCode,
  isRegionCode,
  normaliseRegionCode,
  REGIONS,
  regionLabel,
} from "./regions";

describe("region registry", () => {
  it("lists the supported countries", () => {
    expect(COUNTRIES.map((country) => country.code)).toEqual([
      "AU",
      "NZ",
      "UK",
    ]);
  });

  it("holds every Australian state and territory", () => {
    expect(REGIONS.AU.map((region) => region.code)).toEqual([
      "ACT",
      "NSW",
      "NT",
      "QLD",
      "SA",
      "TAS",
      "VIC",
      "WA",
    ]);
  });

  it("holds every New Zealand region and the UK nations", () => {
    expect(REGIONS.NZ).toHaveLength(17);
    expect(REGIONS.NZ.map((region) => region.code)).toContain("AUK");
    expect(REGIONS.UK.map((region) => region.code)).toEqual([
      "EAW",
      "SCT",
      "NIR",
    ]);
  });

  it("gives every region a label", () => {
    for (const regions of Object.values(REGIONS)) {
      for (const region of regions) {
        expect(region.label.length).toBeGreaterThan(1);
      }
    }
  });

  it("normalises codes and labels case-insensitively", () => {
    expect(normaliseRegionCode("AU", "Queensland")).toBe("QLD");
    expect(normaliseRegionCode("AU", "qld")).toBe("QLD");
    expect(normaliseRegionCode("AU", " New South Wales ")).toBe("NSW");
    expect(normaliseRegionCode("UK", "scotland")).toBe("SCT");
    expect(normaliseRegionCode("UK", "England")).toBe("EAW");
    expect(normaliseRegionCode("UK", "ENG")).toBe("EAW");
    expect(normaliseRegionCode("UK", "WLS")).toBe("EAW");
    expect(normaliseRegionCode("UK", "Wales")).toBe("EAW");
    expect(normaliseRegionCode("NZ", "Auckland")).toBe("AUK");
    expect(normaliseRegionCode("NZ", "Hawke's Bay")).toBe("HKB");
  });

  it("returns null for unknown values, empty values and unknown countries", () => {
    expect(normaliseRegionCode("AU", "Atlantis")).toBeNull();
    expect(normaliseRegionCode("AU", "")).toBeNull();
    expect(normaliseRegionCode("AU", null)).toBeNull();
    expect(normaliseRegionCode("US", "CA")).toBeNull();
    expect(normaliseRegionCode("AU", "SCT")).toBeNull();
  });

  it("validates country and region codes", () => {
    expect(isCountryCode("AU")).toBe(true);
    expect(isCountryCode("GB")).toBe(false);
    expect(isRegionCode("NZ", "TAS")).toBe(true);
    expect(isRegionCode("UK", "QLD")).toBe(false);
    expect(regionLabel("AU", "WA")).toBe("Western Australia");
    expect(regionLabel("AU", "XX")).toBeNull();
  });
});

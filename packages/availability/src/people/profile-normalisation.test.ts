import { describe, expect, it } from "vitest";
import { cleanString, normaliseEmail } from "./profile-normalisation";

describe("profile normalisation", () => {
  describe("cleanString", () => {
    it("trims populated strings", () => {
      expect(cleanString("  Jamie Smith  ")).toBe("Jamie Smith");
    });

    it("returns null for empty, whitespace, null, and undefined values", () => {
      expect(cleanString("")).toBeNull();
      expect(cleanString("   ")).toBeNull();
      expect(cleanString(null)).toBeNull();
      expect(cleanString(undefined)).toBeNull();
    });
  });

  describe("normaliseEmail", () => {
    it("trims and lowercases email values", () => {
      expect(normaliseEmail("  JAMIE.SMITH@EXAMPLE.COM  ")).toBe(
        "jamie.smith@example.com"
      );
    });

    it("returns null for empty email values", () => {
      expect(normaliseEmail("")).toBeNull();
      expect(normaliseEmail("   ")).toBeNull();
      expect(normaliseEmail(null)).toBeNull();
      expect(normaliseEmail(undefined)).toBeNull();
    });
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return {};
  }),
  tenantTransaction: vi.fn(
    (accountId: string, transactionCallback: unknown, options?: unknown) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return {}.$transaction(transactionCallback, options);
    }
  ),
}));

import {
  isFallbackEmail,
  isValidEmail,
  normalizeEmail,
} from "./clerk-access-service";

describe("clerk-access-service unit helpers", () => {
  it("normalises emails correctly", () => {
    expect(normalizeEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("identifies fallback emails correctly", () => {
    expect(isFallbackEmail("john.doe@noemail.teamcalendar.online")).toBe(true);
    expect(isFallbackEmail("jane.smith@noemail.teamcalendar.online")).toBe(
      true
    );
    expect(isFallbackEmail("john.doe@example.com")).toBe(false);
    expect(isFallbackEmail(null)).toBe(false);
  });

  it("validates emails properly", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

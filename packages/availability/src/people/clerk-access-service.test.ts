import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{},
  };
}

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

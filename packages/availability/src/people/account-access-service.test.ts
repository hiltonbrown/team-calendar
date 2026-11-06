import type { AccountDirectory, AccountMember } from "@repo/auth/accounts";
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
  fetchAllAccountMembers,
  fetchAllPendingAccountInvitations,
  isFallbackEmail,
  isValidEmail,
  normalizeEmail,
} from "./account-access-service";

describe("account-access-service unit helpers", () => {
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

function directory(
  overrides: Partial<AccountDirectory> = {}
): AccountDirectory {
  return {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
    listMembers: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
    ...overrides,
  };
}

function member(id: string): AccountMember {
  return {
    accountId: "account_test",
    email: `${id}@example.com`,
    id,
    image: null,
    name: id,
    role: "viewer",
    userId: `user_${id}`,
  };
}

describe("neutral account directory pagination", () => {
  it("loads all member pages with the explicit account context", async () => {
    const first = member("first");
    const second = member("second");
    const listMembers = vi
      .fn()
      .mockResolvedValueOnce({ data: [first], totalCount: 2 })
      .mockResolvedValueOnce({ data: [second], totalCount: 2 });

    await expect(
      fetchAllAccountMembers(directory({ listMembers }), "account_test")
    ).resolves.toEqual([first, second]);
    expect(listMembers.mock.calls).toEqual([
      [{ accountId: "account_test", limit: 100, offset: 0 }],
      [{ accountId: "account_test", limit: 100, offset: 1 }],
    ]);
  });

  it("stops on an empty page even when the provider count is stale", async () => {
    const listMembers = vi.fn().mockResolvedValue({ data: [], totalCount: 10 });

    await expect(
      fetchAllAccountMembers(directory({ listMembers }), "account_test")
    ).resolves.toEqual([]);
    expect(listMembers).toHaveBeenCalledTimes(1);
  });

  it("requests only pending invitations with the explicit account context", async () => {
    const invitation = {
      email: "person@example.com",
      id: "invitation",
      role: "viewer",
      status: "pending",
    };
    const listInvitations = vi
      .fn()
      .mockResolvedValue({ data: [invitation], totalCount: 1 });

    await expect(
      fetchAllPendingAccountInvitations(
        directory({ listInvitations }),
        "account_test"
      )
    ).resolves.toEqual([invitation]);
    expect(listInvitations).toHaveBeenCalledWith({
      accountId: "account_test",
      limit: 100,
      offset: 0,
      status: ["pending"],
    });
  });
});

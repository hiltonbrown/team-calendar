vi.mock("@repo/auth/helpers", () => ({
  requireRole: async (role: string) => (await mocks.auth()).orgRole === role,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  currentUser: vi.fn(),
  database: {
    $transaction: vi.fn(),
    person: { findFirst: vi.fn() },
    xeroPersonMatch: { findFirst: vi.fn() },
  },
  getActiveOrgContext: vi.fn(),
  log: { error: vi.fn() },
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/email", () => ({ resend: {} }));
vi.mock("@repo/email/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/feeds", () => ({
  invalidateFeedCachesForPerson: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/database", () => ({
  tenantDatabase: vi.fn(() => mocks.database),
  tenantTransaction: vi.fn((_clerkOrgId, operation) =>
    mocks.database.$transaction(operation)
  ),
}));
vi.mock("@repo/observability/log", () => ({ log: mocks.log }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { resolveXeroPersonMatchAction } = await import("./_actions");

describe("resolveXeroPersonMatchAction", () => {
  const orgId = "org_1";
  const matchId = "00000000-0000-4000-8000-000000000001";
  const xeroPersonId = "00000000-0000-4000-8000-000000000002";
  const candidatePersonId = "00000000-0000-4000-8000-000000000003";
  const organisationId = "00000000-0000-4000-8000-000000000004";

  function baseMatch(overrides: Record<string, unknown> = {}) {
    return {
      candidate_person: {
        clerk_user_id: "user_candidate",
        id: candidatePersonId,
      },
      clerk_org_id: orgId,
      id: matchId,
      organisation_id: organisationId,
      xero_person: { id: xeroPersonId },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgId, orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "admin@example.com" }],
      firstName: "Admin",
      id: "user_admin",
      lastName: "User",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId: orgId, organisationId },
    });
    mocks.database.xeroPersonMatch.findFirst.mockResolvedValue(baseMatch());
    mocks.database.person.findFirst.mockImplementation(
      (args?: {
        where?: { clerk_user_id?: string; id?: string | { notIn?: string[] } };
      }) => {
        if (!args?.where) {
          return null;
        }
        if (args.where.id === xeroPersonId) {
          return { archived_at: null, clerk_user_id: null, id: xeroPersonId };
        }
        if (args.where.id === candidatePersonId) {
          return {
            archived_at: null,
            clerk_user_id: "user_candidate",
            id: candidatePersonId,
          };
        }
        return null;
      }
    );
    mocks.database.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          alternativeContact: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
          availabilityRecord: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          feedScope: {
            delete: vi.fn().mockResolvedValue({}),
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue({}),
          },
          leaveBalance: {
            delete: vi.fn().mockResolvedValue({}),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue({}),
          },
          notification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          person: {
            findFirst: vi.fn().mockImplementation((args) => {
              if (args.where.id === xeroPersonId) {
                return {
                  archived_at: null,
                  clerk_user_id: null,
                  id: xeroPersonId,
                };
              }
              if (args.where.id === candidatePersonId) {
                return {
                  archived_at: null,
                  clerk_user_id: "user_candidate",
                  id: candidatePersonId,
                };
              }
              return null;
            }),
            update: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          xeroPersonMatch: {
            findFirst: vi.fn().mockResolvedValue(baseMatch()),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return await cb(tx as never);
      }
    );
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        getOrganizationMembershipList: vi
          .fn()
          .mockResolvedValue({ data: [{ id: "mem_1" }] }),
      },
    });
  });

  it("calls findFirst with the active organisation scope on happy path", async () => {
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "ignore",
    });

    expect(result.ok).toBe(true);
    expect(mocks.getActiveOrgContext).toHaveBeenCalledWith(organisationId);
    expect(mocks.database.xeroPersonMatch.findFirst).toHaveBeenCalledTimes(1);
    const where =
      mocks.database.xeroPersonMatch.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toEqual(
      expect.objectContaining({
        clerk_org_id: orgId,
        id: matchId,
        organisation_id: organisationId,
      })
    );
  });

  it("rejects a non-member", async () => {
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: [] }),
      },
    });
    const result = await resolveXeroPersonMatchAction({
      clerkUserId: "user_outsider123",
      matchId,
      organisationId,
      resolution: "match",
    });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect((result as { ok: false; error: { code: string } }).error.code).toBe(
      "validation_error"
    );
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a member", async () => {
    const result = await resolveXeroPersonMatchAction({
      clerkUserId: "user_valid123",
      matchId,
      organisationId,
      resolution: "match",
    });
    expect(result).toEqual({ ok: true, value: { resolved: true } });
    expect(mocks.database.$transaction).toHaveBeenCalled();
  });

  it("fails closed on Clerk error", async () => {
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        getOrganizationMembershipList: vi
          .fn()
          .mockRejectedValue(new Error("down")),
      },
    });
    const result = await resolveXeroPersonMatchAction({
      clerkUserId: "user_valid123",
      matchId,
      organisationId,
      resolution: "match",
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: { code: string } }).error.code).toBe(
      "validation_error"
    );
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("skips membership validation for database-sourced fallback", async () => {
    await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "match",
    });
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.database.$transaction).toHaveBeenCalled();
  });

  it("rejects duplicate binding", async () => {
    mocks.database.person.findFirst.mockResolvedValue({ id: "other-person" });
    const result = await resolveXeroPersonMatchAction({
      clerkUserId: "user_valid123",
      matchId,
      organisationId,
      resolution: "match",
    });
    expect(result.ok).toBe(false);
    expect(
      (result as { ok: false; error: { message: string } }).error.message
    ).toMatch("already linked");
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed id", async () => {
    const result = await resolveXeroPersonMatchAction({
      clerkUserId: "not-a-user-id",
      matchId,
      organisationId,
      resolution: "match",
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: { code: string } }).error.code).toBe(
      "validation_error"
    );
    expect(mocks.clerkClient).not.toHaveBeenCalled();
  });

  it("ignore resolution is unaffected", async () => {
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "ignore",
    });
    expect(result).toEqual({ ok: true, value: { resolved: true } });
    expect(mocks.clerkClient).not.toHaveBeenCalled();
  });
});

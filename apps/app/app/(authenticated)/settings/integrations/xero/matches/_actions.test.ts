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
    organisation: { findFirst: vi.fn(), findMany: vi.fn() },
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
  invalidateAccountFeedCaches: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { feedIds: [] } }),
  invalidateFeedCachesForPerson: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { feedIds: [] } }),
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
  currentUser: mocks.currentUser,
}));
vi.mock("../../../../../../../../packages/database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) =>
      executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...buildTenantTestDatabase(),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../../../../packages/database/src/queries/account-companies")
  >("../../../../../../../../packages/database/src/queries/account-companies")),
  ...(await vi.importActual<
    typeof import("../../../../../../../../packages/database/src/queries/billing")
  >("../../../../../../../../packages/database/src/queries/billing")),
  ...(await vi.importActual<
    typeof import("../../../../../../../../packages/database/src/tenant-db")
  >("../../../../../../../../packages/database/src/tenant-db")),
}));
function buildTenantTestDatabase() {
  return mocks.database;
}
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
      candidate_person_id: candidatePersonId,
      clerk_org_id: orgId,
      id: matchId,
      organisation_id: organisationId,
      status: "pending",
      xero_person: { id: xeroPersonId },
      xero_person_id: xeroPersonId,
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
    mocks.database.organisation.findFirst.mockResolvedValue({
      id: organisationId,
    });
    mocks.database.organisation.findMany.mockResolvedValue([
      { id: organisationId, name: "Company A" },
    ]);
    mocks.database.xeroPersonMatch.findFirst.mockResolvedValue(baseMatch());
    mocks.database.person.findFirst.mockImplementation(
      (args?: {
        where?: { clerk_user_id?: string; id?: string | { notIn?: string[] } };
      }) => {
        if (!args?.where) {
          return null;
        }
        if (args.where.id === xeroPersonId) {
          return {
            archived_at: null,
            clerk_org_id: orgId,
            clerk_user_id: null,
            id: xeroPersonId,
            manager_person_id: null,
            organisation_id: organisationId,
          };
        }
        if (args.where.id === candidatePersonId) {
          return {
            archived_at: null,
            clerk_org_id: orgId,
            clerk_user_id: "user_candidate",
            id: candidatePersonId,
            manager_person_id: null,
            organisation_id: organisationId,
          };
        }
        return null;
      }
    );
    const mutations = {
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
    Object.assign(mocks.database, {
      ...mutations,
      organisation: mocks.database.organisation,
      person: {
        ...mutations.person,
        findFirst: mocks.database.person.findFirst,
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              clerk_org_id: orgId,
              id: xeroPersonId,
              manager_person_id: null,
              organisation_id: organisationId,
            },
            {
              clerk_org_id: orgId,
              id: candidatePersonId,
              manager_person_id: null,
              organisation_id: organisationId,
            },
          ])
        ),
      },
      xeroPersonMatch: {
        ...mutations.xeroPersonMatch,
        findFirst: mocks.database.xeroPersonMatch.findFirst,
      },
    });
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
    expect(mocks.database.organisation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerk_org_id: orgId, id: organisationId },
      })
    );
    expect(mocks.database.xeroPersonMatch.findFirst).toHaveBeenCalledTimes(3);
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
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/settings/integrations/xero/matches"
    );
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
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/settings/integrations/xero/matches"
    );
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

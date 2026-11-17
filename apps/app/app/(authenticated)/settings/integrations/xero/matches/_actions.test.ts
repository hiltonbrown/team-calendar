vi.mock("@repo/auth/helpers", () => ({
  hasPermission: async (
    request: import("@repo/auth/permissions").PermissionRequest
  ) =>
    (await import("@repo/auth/permissions")).hasPermission(
      (await mocks.getSession())?.role,
      request
    ),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: {
    $transaction: vi.fn(),
    organisation: { findFirst: vi.fn(), findMany: vi.fn() },
    person: { findFirst: vi.fn() },
    xeroPersonMatch: { findFirst: vi.fn() },
  },
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  listAccountMembers: vi.fn(),
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
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/database/tenant-client", () => ({
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
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
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
  const accountId = "org_1";
  const matchId = "00000000-0000-4000-8000-000000000001";
  const xeroPersonId = "00000000-0000-4000-8000-000000000002";
  const candidatePersonId = "00000000-0000-4000-8000-000000000003";
  const organisationId = "00000000-0000-4000-8000-000000000004";

  function baseMatch(overrides: Record<string, unknown> = {}) {
    return {
      account_id: accountId,
      candidate_person: {
        id: candidatePersonId,
        user_id: "user_candidate",
      },
      candidate_person_id: candidatePersonId,
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
    mocks.getSession.mockResolvedValue({ accountId, role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({
      email: "admin@example.com",
      id: "user_admin",
      name: "Admin",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId, organisationId },
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
        where?: { user_id?: string; id?: string | { notIn?: string[] } };
      }) => {
        if (!args?.where) {
          return null;
        }
        if (args.where.id === xeroPersonId) {
          return {
            account_id: accountId,
            archived_at: null,
            id: xeroPersonId,
            manager_person_id: null,
            organisation_id: organisationId,
            user_id: null,
          };
        }
        if (args.where.id === candidatePersonId) {
          return {
            account_id: accountId,
            archived_at: null,
            id: candidatePersonId,
            manager_person_id: null,
            organisation_id: organisationId,
            user_id: "user_candidate",
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
              id: xeroPersonId,
              user_id: null,
            };
          }
          if (args.where.id === candidatePersonId) {
            return {
              archived_at: null,
              id: candidatePersonId,
              user_id: "user_candidate",
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
              account_id: accountId,
              id: xeroPersonId,
              manager_person_id: null,
              organisation_id: organisationId,
            },
            {
              account_id: accountId,
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
    mocks.listAccountMembers.mockResolvedValue({ data: [{ id: "mem_1" }] });
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
        where: { account_id: accountId, id: organisationId },
      })
    );
    expect(mocks.database.xeroPersonMatch.findFirst).toHaveBeenCalledTimes(3);
    const where =
      mocks.database.xeroPersonMatch.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toEqual(
      expect.objectContaining({
        account_id: accountId,
        id: matchId,
        organisation_id: organisationId,
      })
    );
  });

  it("rejects a non-member", async () => {
    mocks.listAccountMembers.mockResolvedValue({ data: [] });
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "match",
      userId: "user_outsider123",
    });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect((result as { ok: false; error: { code: string } }).error.code).toBe(
      "validation_error"
    );
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a member", async () => {
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "match",
      userId: "user_valid123",
    });
    expect(result).toEqual({ ok: true, value: { resolved: true } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/settings/integrations/xero/matches"
    );
  });

  it("fails closed on directory error", async () => {
    mocks.listAccountMembers.mockRejectedValueOnce(
      new Error("Directory unavailable")
    );

    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "match",
      userId: "user_valid123",
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

    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/settings/integrations/xero/matches"
    );
  });

  it("rejects duplicate binding", async () => {
    mocks.database.person.findFirst.mockResolvedValue({ id: "other-person" });
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "match",
      userId: "user_valid123",
    });
    expect(result.ok).toBe(false);
    expect(
      (result as { ok: false; error: { message: string } }).error.message
    ).toMatch("already linked");
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed id", async () => {
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "match",
      userId: "not-a-user-id",
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: { code: string } }).error.code).toBe(
      "validation_error"
    );
  });

  it("ignore resolution is unaffected", async () => {
    const result = await resolveXeroPersonMatchAction({
      matchId,
      organisationId,
      resolution: "ignore",
    });
    expect(result).toEqual({ ok: true, value: { resolved: true } });
  });
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
  listAccountMembers: mocks.listAccountMembers,
}));

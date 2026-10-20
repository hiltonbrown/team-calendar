import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock(
  "@repo/database",
  async () =>
    await vi.importActual<typeof import("@repo/database/tenant-db")>(
      "@repo/database/tenant-db"
    )
);
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>) =>
      mocks.poolTransaction(run),
  },
}));

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personFindMany: vi.fn(),
  poolTransaction: vi.fn(),
  updateMany: vi.fn(),
}));

const client = {
  notification: {
    count: mocks.count,
    findFirst: mocks.findFirst,
    findMany: mocks.findMany,
    updateMany: mocks.updateMany,
  },
  person: {
    findMany: mocks.personFindMany,
  },
};

const {
  getUnreadCount,
  listForUser,
  listRecentUnread,
  markAllAsRead,
  markAsRead,
} = await import("./notification-service");

const input = {
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  userId: "user_1",
};

const row = {
  action_url: "/leave-approvals?recordId=1",
  actor_user_id: "manager_1",
  body: "Ava submitted leave.",
  created_at: new Date("2026-04-18T00:00:00.000Z"),
  id: "00000000-0000-4000-8000-000000000101",
  object_id: "00000000-0000-4000-8000-000000000099",
  object_type: "availability_record",
  organisation: { name: "Company A" },
  organisation_id: input.organisationId,
  read_at: null,
  recipient_user_id: "user_1",
  title: "Leave submitted for approval",
  type: "leave_submitted",
};

describe("notification-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolTransaction.mockImplementation(
      async (run: (db: unknown) => Promise<unknown>) =>
        run({ ...client, $queryRaw: vi.fn(async () => []) })
    );
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([row]);
    mocks.personFindMany.mockResolvedValue([
      {
        clerk_user_id: "manager_1",
        first_name: "Mina",
        last_name: "Patel",
      },
    ]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("loads notifications through the account-bound default client", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      listForUser(input, db)
    );
    expect(result).toMatchObject({
      ok: true,
      value: { notifications: [expect.objectContaining({ id: row.id })] },
    });
    expect(mocks.poolTransaction).toHaveBeenCalledOnce();
  });

  it("lists notifications scoped to the account recipient", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      listForUser(input, db)
    );

    expect(result.ok).toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation: { clerk_org_id: input.clerkOrgId },
          recipient_user_id: input.userId,
        }),
      })
    );
    if (result.ok) {
      expect(result.value.notifications[0]).toMatchObject({
        actorDisplay: "Mina P.",
        isUnread: true,
        type: "leave_submitted",
      });
      expect(result.value.unreadCount).toBe(1);
    }
  });

  it("marks a recipient notification as read idempotently", async () => {
    mocks.findFirst.mockResolvedValue(row);

    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, notificationId: row.id }),
      (db) => markAsRead({ ...input, notificationId: row.id }, db)
    );

    expect(result.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation: { clerk_org_id: input.clerkOrgId },
          recipient_user_id: input.userId,
        }),
      })
    );
  });

  it("rejects non-recipient read attempts", async () => {
    mocks.findFirst.mockResolvedValue({ ...row, recipient_user_id: "other" });

    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, notificationId: row.id }),
      (db) => markAsRead({ ...input, notificationId: row.id }, db)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_recipient");
    }
  });

  it("marks all unread only for the account recipient", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      markAllAsRead(input, db)
    );

    expect(result).toEqual({
      ok: true,
      value: { markedCount: 1, unreadCount: 0 },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organisation: { clerk_org_id: input.clerkOrgId },
          read_at: null,
        }),
      })
    );
  });

  it("returns unread count and recent unread rows", async () => {
    await expect(
      withTestTenantResult(tenantTestAccount(input), (db) =>
        getUnreadCount(input, db)
      )
    ).resolves.toEqual({
      ok: true,
      value: 1,
    });
    await expect(
      withTestTenantResult(tenantTestAccount(input), (db) =>
        listRecentUnread(input, db)
      )
    ).resolves.toMatchObject({
      ok: true,
      value: [expect.objectContaining({ id: row.id })],
    });
  });
});

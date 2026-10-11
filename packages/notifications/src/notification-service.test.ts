import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({ tenantDatabase: mocks.tenantDatabase }));

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personFindMany: vi.fn(),
  tenantDatabase: vi.fn(),
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
  read_at: null,
  recipient_user_id: "user_1",
  title: "Leave submitted for approval",
  type: "leave_submitted",
};

describe("notification-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantDatabase.mockReturnValue(client);
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
    const result = await listForUser(input);
    expect(result).toMatchObject({
      ok: true,
      value: { notifications: [expect.objectContaining({ id: row.id })] },
    });
    expect(mocks.tenantDatabase).toHaveBeenCalledWith(input.clerkOrgId);
  });

  it("lists notifications scoped to user and organisation", async () => {
    const result = await listForUser(input, client);

    expect(result.ok).toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
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

    const result = await markAsRead(
      { ...input, notificationId: row.id },
      client
    );

    expect(result.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          recipient_user_id: input.userId,
        }),
      })
    );
  });

  it("rejects non-recipient read attempts", async () => {
    mocks.findFirst.mockResolvedValue({ ...row, recipient_user_id: "other" });

    const result = await markAsRead(
      { ...input, notificationId: row.id },
      client
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_recipient");
    }
  });

  it("marks all unread only for the scoped user and organisation", async () => {
    const result = await markAllAsRead(input, client);

    expect(result).toEqual({
      ok: true,
      value: { markedCount: 1, unreadCount: 0 },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organisation_id: input.organisationId,
          read_at: null,
        }),
      })
    );
  });

  it("returns unread count and recent unread rows", async () => {
    await expect(getUnreadCount(input, client)).resolves.toEqual({
      ok: true,
      value: 1,
    });
    await expect(listRecentUnread(input, client)).resolves.toMatchObject({
      ok: true,
      value: [expect.objectContaining({ id: row.id })],
    });
  });
});

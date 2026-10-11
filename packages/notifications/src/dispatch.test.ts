import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({ tenantDatabase: mocks.tenantDatabase }));

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  emailCreate: vi.fn(),
  notificationCreate: vi.fn(),
  notificationFindFirst: vi.fn(),
  personFindFirst: vi.fn(),
  preferenceFindUnique: vi.fn(),
  publish: vi.fn(),
  tenantDatabase: vi.fn(),
}));

vi.mock("./sse/broker", () => ({
  publishNotificationEvent: mocks.publish,
}));

const client = {
  notification: {
    count: mocks.count,
    create: mocks.notificationCreate,
    findFirst: mocks.notificationFindFirst,
  },
  notificationEmailQueue: {
    create: mocks.emailCreate,
  },
  notificationPreference: {
    findUnique: mocks.preferenceFindUnique,
  },
  person: {
    findFirst: mocks.personFindFirst,
  },
};

const { dispatchNotification, publishPersistedNotification } = await import(
  "./dispatch"
);

const input = {
  actionUrl: "/leave-approvals?recordId=00000000-0000-4000-8000-000000000099",
  actorUserId: "manager_1",
  body: "Ava submitted leave.",
  clerkOrgId: "org_1",
  objectId: "00000000-0000-4000-8000-000000000099",
  objectType: "availability_record",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recipientPersonId: "00000000-0000-4000-8000-000000000011",
  recipientUserId: "user_1",
  title: "Leave submitted for approval",
  type: "leave_submitted",
};

describe("dispatchNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantDatabase.mockReturnValue(client);
    mocks.count.mockResolvedValue(1);
    mocks.emailCreate.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
    });
    mocks.notificationCreate.mockResolvedValue({
      created_at: new Date("2026-04-18T00:00:00.000Z"),
      id: "00000000-0000-4000-8000-000000000101",
    });
    mocks.personFindFirst.mockResolvedValue({ email: "ava@example.com" });
    mocks.preferenceFindUnique.mockResolvedValue(null);
    mocks.publish.mockResolvedValue(undefined);
  });

  it("delivers notifications through the account-bound default client", async () => {
    const result = await dispatchNotification(input);
    expect(result).toMatchObject({
      ok: true,
      value: { emailQueued: true, inAppDelivered: true },
    });
    expect(mocks.tenantDatabase).toHaveBeenCalledWith(input.clerkOrgId);
  });

  it("creates in-app rows and queues email when defaults allow both", async () => {
    const result = await dispatchNotification(input, client);

    expect(result).toEqual({
      ok: true,
      value: {
        emailQueued: true,
        inAppDelivered: true,
        notificationId: "00000000-0000-4000-8000-000000000101",
      },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          recipient_user_id: input.recipientUserId,
        }),
      })
    );
    expect(mocks.emailCreate).toHaveBeenCalled();
  });

  it("skips in-app delivery when disabled", async () => {
    mocks.preferenceFindUnique.mockResolvedValue({
      email_enabled: true,
      in_app_enabled: false,
    });

    const result = await dispatchNotification(input, client);

    expect(result.ok).toBe(true);
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.emailCreate).toHaveBeenCalled();
  });

  it("suppresses realtime publication for a caller-owned transaction", async () => {
    const result = await dispatchNotification(input, client, {
      publishRealtime: false,
    });

    expect(result.ok).toBe(true);
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("never queues email for null-template types", async () => {
    const result = await dispatchNotification(
      { ...input, title: "Leave withdrawn", type: "leave_withdrawn" },
      client
    );

    expect(result).toEqual({
      ok: true,
      value: {
        emailQueued: false,
        inAppDelivered: true,
        notificationId: "00000000-0000-4000-8000-000000000101",
      },
    });
    expect(mocks.emailCreate).not.toHaveBeenCalled();
  });

  it("recognises reconciliation complete notifications and suppresses email", async () => {
    const result = await dispatchNotification(
      {
        ...input,
        title: "Approval reconciliation complete",
        type: "sync_reconciliation_complete",
      },
      client
    );

    expect(result).toEqual({
      ok: true,
      value: {
        emailQueued: false,
        inAppDelivered: true,
        notificationId: "00000000-0000-4000-8000-000000000101",
      },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "sync_reconciliation_complete",
        }),
      })
    );
    expect(mocks.emailCreate).not.toHaveBeenCalled();
  });
});

describe("publishPersistedNotification", () => {
  it("reads the committed scoped row and publishes without creating rows", async () => {
    vi.clearAllMocks();
    mocks.tenantDatabase.mockReturnValue(client);
    mocks.notificationFindFirst.mockResolvedValue({
      action_url: input.actionUrl,
      body: input.body,
      clerk_org_id: input.clerkOrgId,
      created_at: new Date("2026-04-18T00:00:00Z"),
      id: "notification_1",
      organisation_id: input.organisationId,
      recipient_user_id: input.recipientUserId,
      title: input.title,
      type: "leave_submitted",
    });
    mocks.count.mockResolvedValue(2);
    mocks.publish.mockResolvedValue(undefined);
    await publishPersistedNotification(
      {
        clerkOrgId: input.clerkOrgId,
        notificationId: "notification_1",
        organisationId: input.organisationId,
      },
      client
    );
    expect(mocks.notificationFindFirst).toHaveBeenCalledWith({
      where: {
        clerk_org_id: input.clerkOrgId,
        id: "notification_1",
        organisation_id: input.organisationId,
      },
    });
    expect(mocks.publish).toHaveBeenCalledWith(
      { organisationId: input.organisationId, userId: input.recipientUserId },
      expect.objectContaining({
        payload: expect.objectContaining({
          notificationId: "notification_1",
          unreadCount: 2,
        }),
        type: "notification.created",
      })
    );
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.emailCreate).not.toHaveBeenCalled();
  });
  it("does not publish a row absent from the committed scope", async () => {
    vi.clearAllMocks();
    mocks.tenantDatabase.mockReturnValue(client);
    mocks.notificationFindFirst.mockResolvedValue(null);
    await publishPersistedNotification(
      {
        clerkOrgId: input.clerkOrgId,
        notificationId: "rolled_back",
        organisationId: input.organisationId,
      },
      client
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

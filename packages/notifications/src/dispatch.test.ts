import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../database/src/tenant-db";
import { tenantTestAccount } from "../../database/src/test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));
vi.mock("../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>, options: unknown) =>
      mocks.poolTransaction(run, options),
  },
}));
vi.mock(
  "@repo/database",
  async () =>
    await vi.importActual<typeof import("../../database/src/tenant-db")>(
      "../../database/src/tenant-db"
    )
);

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  effects: [] as (() => Promise<void>)[],
  emailCreate: vi.fn(),
  notificationCreate: vi.fn(),
  notificationFindFirst: vi.fn(),
  persistedNotifications: 0,
  personFindFirst: vi.fn(),
  poolTransaction: vi.fn(),
  preferenceFindUnique: vi.fn(),
  publish: vi.fn(),
  transactionOpen: false,
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
    mocks.effects.length = 0;
    mocks.persistedNotifications = 0;
    mocks.transactionOpen = false;
    mocks.poolTransaction.mockImplementation(
      async (callback: (db: unknown) => Promise<unknown>) => {
        const before = mocks.persistedNotifications;
        mocks.transactionOpen = true;
        try {
          return await callback({
            $queryRaw: vi.fn(async () => []),
            ...client,
          });
        } catch (error) {
          mocks.persistedNotifications = before;
          throw error;
        } finally {
          mocks.transactionOpen = false;
        }
      }
    );
    mocks.count.mockResolvedValue(1);
    mocks.emailCreate.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
    });
    mocks.notificationCreate.mockImplementation(async () => {
      mocks.persistedNotifications += 1;
      return await {
        created_at: new Date("2026-04-18T00:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000101",
        organisation: { name: "Company A" },
        organisation_id: input.organisationId,
      };
    });
    mocks.notificationFindFirst.mockResolvedValue({
      action_url: input.actionUrl,
      body: input.body,
      created_at: new Date("2026-04-18T00:00:00.000Z"),
      id: "00000000-0000-4000-8000-000000000101",
      organisation: { name: "Company A" },
      organisation_id: input.organisationId,
      recipient_user_id: input.recipientUserId,
      title: input.title,
      type: input.type,
    });
    mocks.personFindFirst.mockResolvedValue({ email: "ava@example.com" });
    mocks.preferenceFindUnique.mockResolvedValue(null);
    mocks.publish.mockImplementation(() => {
      expect(mocks.transactionOpen).toBe(false);

      return Promise.resolve();
    });
  });

  it("delivers notifications after the account-bound default transaction commits", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      dispatchNotification(input, undefined, db)
    );
    expect(result).toMatchObject({
      ok: true,
      value: { emailQueued: true, inAppDelivered: true },
    });
    expect(mocks.poolTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object)
    );
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.persistedNotifications).toBe(1);
  });

  it("rolls back the in-app row when default dispatch cannot enqueue its email", async () => {
    mocks.emailCreate.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(
      withTestTenantResult(tenantTestAccount(input), (db) =>
        dispatchNotification(input, undefined, db)
      )
    ).resolves.toMatchObject({
      error: { code: "unknown_error" },
      ok: false,
    });
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
    expect(mocks.persistedNotifications).toBe(0);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("does not publish a caller-owned row when required email persistence fails", async () => {
    mocks.emailCreate.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(
      withTestTenantResult(tenantTestAccount(input), (db) =>
        dispatchNotification(input, {}, db)
      )
    ).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("creates in-app rows and queues email when defaults allow both", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      dispatchNotification(input, {}, db)
    );

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

    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      dispatchNotification(input, {}, db)
    );

    expect(result.ok).toBe(true);
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.emailCreate).toHaveBeenCalled();
  });

  it("suppresses realtime publication for a caller-owned transaction", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      dispatchNotification(
        input,
        {
          publishRealtime: false,
        },
        db
      )
    );

    expect(result.ok).toBe(true);
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("never queues email for null-template types", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...input,
        title: "Leave withdrawn",
        type: "leave_withdrawn",
      }),
      (db) =>
        dispatchNotification(
          { ...input, title: "Leave withdrawn", type: "leave_withdrawn" },
          {},
          db
        )
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...input,
        title: "Approval reconciliation complete",
        type: "sync_reconciliation_complete",
      }),
      (db) =>
        dispatchNotification(
          {
            ...input,
            title: "Approval reconciliation complete",
            type: "sync_reconciliation_complete",
          },
          {},
          db
        )
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
    mocks.notificationFindFirst.mockResolvedValue({
      action_url: input.actionUrl,
      body: input.body,
      clerk_org_id: input.clerkOrgId,
      created_at: new Date("2026-04-18T00:00:00Z"),
      id: "notification_1",
      organisation: { name: "Company A" },
      organisation_id: input.organisationId,
      recipient_user_id: input.recipientUserId,
      title: input.title,
      type: "leave_submitted",
    });
    mocks.count.mockResolvedValue(2);
    mocks.publish.mockResolvedValue(undefined);
    await publishPersistedNotification({
      clerkOrgId: input.clerkOrgId,
      notificationId: "notification_1",
      organisationId: input.organisationId,
    });
    expect(mocks.notificationFindFirst).toHaveBeenCalledWith({
      include: { organisation: { select: { name: true } } },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: "notification_1",
        organisation_id: input.organisationId,
      },
    });
    expect(mocks.publish).toHaveBeenCalledWith(
      { clerkOrgId: input.clerkOrgId, userId: input.recipientUserId },
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
    mocks.notificationFindFirst.mockResolvedValue(null);
    await publishPersistedNotification({
      clerkOrgId: input.clerkOrgId,
      notificationId: "rolled_back",
      organisationId: input.organisationId,
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

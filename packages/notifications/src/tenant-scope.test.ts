import type { Result } from "@repo/core";
import type { TenantDb } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  created: 0,
  failEmail: false,
  inside: false,
  publish: vi.fn(),
  readAt: null as Date | null,
  recipientLookup: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock(
  "@repo/database",
  async () => await vi.importActual("@repo/database/tenant-db")
);
vi.mock("./sse/broker", () => ({ publishNotificationEvent: state.publish }));
vi.mock("@repo/observability/error", () => ({ parseError: vi.fn() }));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  TenantMismatchError,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { dispatchNotification } from "./dispatch";
import { enqueueNotificationEmail } from "./email-queue-service";
import {
  getUnreadCount,
  invalidateUnreadCount,
  listForUser,
  listRecentUnread,
  markAllAsRead,
  markAsRead,
} from "./notification-service";
import {
  listPreferences,
  shouldDeliverToChannel,
  upsertPreference,
} from "./preferences-service";

const scope = {
  clerkOrgId: "account-A",
  organisationId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
};
const notificationId = "22222222-2222-4222-8222-222222222222";
const notificationInput = {
  ...scope,
  body: "Leave requires approval.",
  recipientUserId: scope.userId,
  title: "Leave submitted",
  type: "leave_submitted",
};
const cases: { name: string; run: (db: TenantDb) => Promise<unknown> }[] = [
  { name: "notification list", run: (db) => listForUser(scope, db) },
  {
    name: "recent unread",
    run: (db) => listRecentUnread(scope, db),
  },
  { name: "unread count", run: (db) => getUnreadCount(scope, db) },
  {
    name: "mark read",
    run: (db) => markAsRead({ ...scope, notificationId }, db),
  },
  { name: "mark all read", run: (db) => markAllAsRead(scope, db) },
  { name: "preferences", run: (db) => listPreferences(scope, db) },
  {
    name: "channel preference",
    run: (db) =>
      shouldDeliverToChannel(
        { ...scope, channel: "in_app", notificationType: "leave_submitted" },
        db
      ),
  },
  {
    name: "save preference",
    run: (db) =>
      upsertPreference(
        {
          ...scope,
          emailEnabled: true,
          inAppEnabled: true,
          notificationType: "leave_submitted",
        },
        db
      ),
  },
  {
    name: "enqueue email",
    run: (db) =>
      enqueueNotificationEmail(
        {
          ...notificationInput,
          emailTemplate: "leave_submitted",
          notificationType: "leave_submitted",
          recipientEmail: "person@example.test",
        },
        db
      ),
  },
  {
    name: "dispatch persistence",
    run: (db) =>
      dispatchNotification(notificationInput, { publishRealtime: false }, db),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  state.inside = false;
  state.created = 0;
  state.failEmail = false;
  state.readAt = null;
  state.recipientLookup.mockResolvedValue({ email: "person@example.test" });
  invalidateUnreadCount(scope);
  state.publish.mockImplementation(() => {
    expect(state.inside).toBe(false);

    return Promise.resolve();
  });
  state.transaction.mockImplementation(
    async (callback: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const before = { created: state.created, readAt: state.readAt };
      const row = () => ({
        action_url: null,
        actor_user_id: null,
        body: "Leave requires approval.",
        created_at: new Date("2026-10-01"),
        id: notificationId,
        object_id: null,
        object_type: null,
        organisation: { name: "Company A" },
        organisation_id: scope.organisationId,
        read_at: state.readAt,
        recipient_user_id: scope.userId,
        title: "Leave submitted",
        type: "leave_submitted",
      });
      // Pool substitute: only the delegates used by notification persistence are implemented.
      const tx = {
        $queryRaw: async () => [],
        notification: {
          count: async () => (state.readAt ? 0 : 1),
          create: async () => {
            state.created += 1;
            return await row();
          },
          findFirst: async () => row(),
          findMany: async () => [],
          updateMany: async () => {
            state.readAt = new Date();
            return await { count: 1 };
          },
        },
        notificationEmailQueue: {
          create: async () => {
            if (state.failEmail) {
              throw new Error("Email queue unavailable");
            }
            return await { id: "33333333-3333-4333-8333-333333333333" };
          },
        },
        notificationPreference: {
          findMany: async () => [],
          findUnique: async () => null,
          upsert: async () => ({
            email_enabled: true,
            in_app_enabled: true,
            notification_type: "leave_submitted",
          }),
        },
        person: {
          findFirst: state.recipientLookup,
          findMany: async () => [],
        },
      } as unknown as Prisma.TransactionClient;
      state.inside = true;
      try {
        return await callback(tx);
      } catch (error) {
        state.created = before.created;
        state.readAt = before.readAt;
        throw error;
      } finally {
        state.inside = false;
      }
    }
  );
});

test.each(cases)("$name reuses its entry-point scope", async ({ run }) => {
  await withTenantDb(scope.clerkOrgId, (db) => run(db));
  expect(state.transaction).toHaveBeenCalledTimes(1);
  state.transaction.mockClear();
  await withTenantDb(scope.clerkOrgId, async (db) => {
    await run(db);
    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
});

test.each(cases)("$name rejects another account's client", async ({ run }) => {
  await withTenantDb("account-B", async (db) => {
    await expect(Promise.resolve().then(() => run(db))).rejects.toBeInstanceOf(
      TenantMismatchError
    );
  });
});

test("mark-read publication waits for commit and is discarded on rollback", async () => {
  const failed = await withTenantResult(
    scope.clerkOrgId,
    async (db): Promise<Result<void, string>> => {
      await markAsRead({ ...scope, notificationId }, db);
      expect(state.publish).not.toHaveBeenCalled();
      return { error: "Abort parent operation", ok: false };
    }
  );
  expect(failed.ok).toBe(false);
  expect(state.readAt).toBeNull();
  expect(state.publish).not.toHaveBeenCalled();
  await withTenantDb(scope.clerkOrgId, async (db) => {
    await markAsRead({ ...scope, notificationId }, db);
    expect(state.publish).not.toHaveBeenCalled();
  });
  expect(state.publish).toHaveBeenCalledOnce();
});

test("default dispatch rolls back an in-app row when required email persistence fails", async () => {
  state.failEmail = true;
  await expect(
    withTestTenantResult(tenantTestAccount(notificationInput), (db) =>
      dispatchNotification(notificationInput, undefined, db)
    )
  ).resolves.toMatchObject({
    ok: false,
  });
  expect(state.created).toBe(0);
  expect(state.publish).not.toHaveBeenCalled();
});

test("transaction-local unread counts bypass a previously committed cache entry", async () => {
  await expect(
    withTestTenantResult(tenantTestAccount(scope), (db) =>
      getUnreadCount(scope, db)
    )
  ).resolves.toEqual({ ok: true, value: 1 });
  await withTenantDb(scope.clerkOrgId, async (db) => {
    await markAsRead({ ...scope, notificationId }, db);
    await expect(getUnreadCount(scope, db)).resolves.toEqual({
      ok: true,
      value: 0,
    });
  });
});

test("manager email lookup can reach another owned company while the notification keeps the record company", async () => {
  const personId = "44444444-4444-4444-8444-444444444444";
  const recordCompany = "55555555-5555-4555-8555-555555555555";
  const result = await withTestTenantResult(
    tenantTestAccount({
      ...notificationInput,
      organisationId: recordCompany,
      recipientPersonId: personId,
    }),
    (db) =>
      dispatchNotification(
        {
          ...notificationInput,
          organisationId: recordCompany,
          recipientPersonId: personId,
        },
        { publishRealtime: false },
        db
      )
  );
  expect(result.ok && result.value.emailQueued).toBe(true);
  expect(state.recipientLookup).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        clerk_org_id: scope.clerkOrgId,
        clerk_user_id: scope.userId,
        id: personId,
        organisation: expect.objectContaining({
          clerk_org_id: scope.clerkOrgId,
        }),
      }),
    })
  );
  expect(
    state.recipientLookup.mock.calls[0]?.[0].where.organisation_id
  ).toBeUndefined();
  expect(state.transaction).toHaveBeenCalledTimes(1);
});

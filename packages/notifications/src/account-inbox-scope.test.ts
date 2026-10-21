import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  failCount: false,
  preferenceStore: new Map<
    string,
    {
      notification_type: "leave_submitted";
      email_enabled: boolean;
      in_app_enabled: boolean;
    }
  >(),
  publish: vi.fn(),
  rows: [] as Array<{
    id: string;
    clerk_org_id: string;
    organisation_id: string;
    recipient_user_id: string;
    read_at: Date | null;
  }>,
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
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));

import {
  isTenantScopeActive,
  TenantMismatchError,
  withTenantDb,
} from "@repo/database";
import {
  getUnreadCount,
  listForUser,
  listRecentUnread,
  markAllAsRead,
  markAsRead,
} from "./notification-service";
import { listPreferences, upsertPreference } from "./preferences-service";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";
const notificationA = "33333333-3333-4333-8333-333333333333";
const notificationB = "44444444-4444-4444-8444-444444444444";
const input = { clerkOrgId: "account-A", userId: "manager-A" };
interface Where {
  clerk_org_id: string;
  id?: string;
  organisation_id?: string;
  read_at?: null;
  recipient_user_id?: string;
}
const matches = (row: (typeof state.rows)[number], where: Where) =>
  row.clerk_org_id === where.clerk_org_id &&
  (!where.recipient_user_id ||
    row.recipient_user_id === where.recipient_user_id) &&
  (!where.id || row.id === where.id) &&
  (!("read_at" in where) || row.read_at === null) &&
  (!where.organisation_id || row.organisation_id === where.organisation_id);
const fullRow = (row: (typeof state.rows)[number]) => ({
  ...row,
  action_url: "/plans/record",
  actor_user_id: null,
  body: "Leave request",
  created_at: new Date("2026-10-14T00:00:00Z"),
  object_id: null,
  object_type: null,
  organisation: {
    name: row.organisation_id === companyA ? "Company A" : "Company B",
  },
  title: "Leave submitted",
  type: "leave_submitted",
});
beforeEach(() => {
  vi.clearAllMocks();
  state.failCount = false;
  state.preferenceStore = new Map([
    [
      companyA,
      {
        email_enabled: false,
        in_app_enabled: true,
        notification_type: "leave_submitted",
      },
    ],
  ]);
  state.rows = [
    {
      clerk_org_id: "account-A",
      id: notificationA,
      organisation_id: companyA,
      read_at: null,
      recipient_user_id: "manager-A",
    },
    {
      clerk_org_id: "account-A",
      id: notificationB,
      organisation_id: companyB,
      read_at: null,
      recipient_user_id: "manager-A",
    },
    {
      clerk_org_id: "account-B",
      id: "foreign",
      organisation_id: companyB,
      read_at: null,
      recipient_user_id: "manager-A",
    },
    {
      clerk_org_id: "account-A",
      id: "someone-else",
      organisation_id: companyB,
      read_at: null,
      recipient_user_id: "another-user",
    },
  ];
  state.publish.mockImplementation(() => {
    expect(isTenantScopeActive()).toBe(false);

    return Promise.resolve();
  });
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const saved = state.rows.map((row) => ({ ...row }));
      // Delegate fake exercises real scope ownership and buffers rollback-visible state.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        notification: {
          count: async ({ where }: { where: Where }) => {
            if (state.failCount) {
              throw new Error("count SQL failed");
            }
            return await state.rows.filter((row) => matches(row, where)).length;
          },
          findFirst: async ({ where }: { where: Where }) => {
            const row = state.rows.find((preparedRow) =>
              matches(preparedRow, where)
            );
            return await (row ? fullRow(row) : null);
          },
          findMany: async ({ where }: { where: Where }) =>
            state.rows.filter((row) => matches(row, where)).map(fullRow),
          updateMany: async ({
            where,
            data,
          }: {
            where: Where;
            data: { read_at: Date };
          }) => {
            let count = 0;
            for (const row of state.rows) {
              if (matches(row, where)) {
                row.read_at = data.read_at;
                count += 1;
              }
            }
            return await { count };
          },
        },
        notificationPreference: {
          findMany: async ({
            where,
          }: {
            where: { organisation_id: string };
          }) => {
            const preference = state.preferenceStore.get(where.organisation_id);
            return (await preference) ? [preference] : [];
          },
          upsert: async ({
            create,
          }: {
            create: {
              organisation_id: string;
              email_enabled: boolean;
              in_app_enabled: boolean;
            };
          }) => {
            const preference = {
              email_enabled: create.email_enabled,
              in_app_enabled: create.in_app_enabled,
              notification_type: "leave_submitted" as const,
            };
            state.preferenceStore.set(create.organisation_id, preference);
            return await preference;
          },
        },
        person: { findMany: async () => [] },
      } as unknown as Prisma.TransactionClient;
      try {
        return await run(db);
      } catch (error) {
        state.rows = saved;
        throw error;
      }
    }
  );
});
test("account inbox includes A and B with provenance, excluding another account and recipient", async () => {
  await withTenantDb("account-A", async (db) => {
    const result = await listForUser(input, db);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.unreadCount).toBe(2);
    expect(
      result.value.notifications.map((item) => [
        item.organisationId,
        item.organisationName,
      ])
    ).toEqual([
      [companyA, "Company A"],
      [companyB, "Company B"],
    ]);
    expect(await getUnreadCount(input, db)).toEqual({ ok: true, value: 2 });
    expect(await listRecentUnread(input, db)).toMatchObject({
      ok: true,
      value: [{ id: notificationA }, { id: notificationB }],
    });
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test("A-employed manager can mark the B notification, with an account unread count and account stream", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({ ...input, notificationId: notificationB }),
    (db) => markAsRead({ ...input, notificationId: notificationB }, db)
  );
  expect(result).toMatchObject({
    ok: true,
    value: { notification: { organisationId: companyB }, unreadCount: 1 },
  });
  expect(state.publish).toHaveBeenCalledWith(
    input,
    expect.objectContaining({
      payload: expect.objectContaining({ unreadCount: 1 }),
      type: "notification.read",
    })
  );
});
test("mark all affects only this account recipient across both companies", async () => {
  expect(
    await withTestTenantResult(tenantTestAccount(input), (db) =>
      markAllAsRead(input, db)
    )
  ).toMatchObject({
    ok: true,
    value: { markedCount: 2, unreadCount: 0 },
  });
  expect(state.rows.filter((row) => row.read_at).map((row) => row.id)).toEqual([
    notificationA,
    notificationB,
  ]);
});
test("a SQL failure after marking rolls back the read flag and discards the live effect", async () => {
  state.failCount = true;
  await withTenantDb("account-A", async (db) => {
    await expect(
      markAsRead({ ...input, notificationId: notificationB }, db)
    ).rejects.toThrow("count SQL failed");
    throw new Error("abort parent");
  }).catch(() => undefined);
  expect(
    state.rows.find((row) => row.id === notificationB)?.read_at
  ).toBeNull();
  expect(state.publish).not.toHaveBeenCalled();
});
test("a foreign branded client is rejected before reading", async () => {
  await withTenantDb("account-B", async (db) => {
    await expect(listForUser(input, db)).rejects.toBeInstanceOf(
      TenantMismatchError
    );
  });
});

test("preferences for B remain independent from A in the account inbox", async () => {
  await withTenantDb("account-A", async (db) => {
    expect(
      (
        await upsertPreference(
          {
            ...input,
            emailEnabled: true,
            inAppEnabled: false,
            notificationType: "leave_submitted",
            organisationId: companyB,
          },
          db
        )
      ).ok
    ).toBe(true);
    const a = await listPreferences({ ...input, organisationId: companyA }, db);
    const b = await listPreferences({ ...input, organisationId: companyB }, db);
    if (!(a.ok && b.ok)) {
      throw new Error("Expected preferences");
    }
    expect(a.value.find((row) => row.type === "leave_submitted")).toMatchObject(
      { emailEnabled: false, inAppEnabled: true }
    );
    expect(b.value.find((row) => row.type === "leave_submitted")).toMatchObject(
      { emailEnabled: true, inAppEnabled: false }
    );
  });
});

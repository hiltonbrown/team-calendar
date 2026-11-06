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
  findMany: vi.fn(),
  findUnique: vi.fn(),
  poolTransaction: vi.fn(),
  upsert: vi.fn(),
}));

const client = {
  notificationPreference: {
    findMany: mocks.findMany,
    findUnique: mocks.findUnique,
    upsert: mocks.upsert,
  },
};

const { listPreferences, shouldDeliverToChannel, upsertPreference } =
  await import("./preferences-service");

const input = {
  accountId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  userId: "user_1",
};

describe("preferences-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolTransaction.mockImplementation(
      async (run: (db: unknown) => Promise<unknown>) =>
        run({ ...client, $queryRaw: vi.fn(async () => []) })
    );
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue(null);
  });

  it("loads preferences through the caller account scope", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      listPreferences(input, db)
    );
    expect(result.ok).toBe(true);
    expect(mocks.poolTransaction).toHaveBeenCalledOnce();
  });

  it("returns defaults for every registry type", async () => {
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      listPreferences(input, db)
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(11);
      expect(result.value.every((row) => row.isDefault)).toBe(true);
    }
  });

  it("uses stored preferences over defaults", async () => {
    mocks.findMany.mockResolvedValue([
      {
        email_enabled: true,
        in_app_enabled: false,
        notification_type: "leave_submitted",
      },
    ]);

    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      listPreferences(input, db)
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.value.find((row) => row.type === "leave_submitted")
      ).toMatchObject({
        emailEnabled: true,
        inAppEnabled: false,
        isDefault: false,
      });
    }
  });

  it("rejects both channels disabled", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...input,
        emailEnabled: false,
        inAppEnabled: false,
        notificationType: "leave_submitted",
      }),
      (db) =>
        upsertPreference(
          {
            ...input,
            emailEnabled: false,
            inAppEnabled: false,
            notificationType: "leave_submitted",
          },
          db
        )
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("at_least_one_channel_required");
    }
  });

  it("falls back to registry defaults for delivery checks", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...input,
        channel: "email",
        notificationType: "leave_withdrawn",
      }),
      (db) =>
        shouldDeliverToChannel(
          {
            ...input,
            channel: "email",
            notificationType: "leave_withdrawn",
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: false });
  });
});

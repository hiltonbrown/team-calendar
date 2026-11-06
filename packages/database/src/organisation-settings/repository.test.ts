import type { AccountId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantDb as withTestTenantDb } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createMany: vi.fn(),
  findFirst: vi.fn(),
  findFirstOrThrow: vi.fn(),
  scopedQuery: vi.fn((accountId: string, organisationId: string) => ({
    account_id: accountId,
    organisation_id: organisationId,
  })),
  updateMany: vi.fn(),
}));

vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (callback: (db: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [],
        organisationSettings: {
          createMany: mocks.createMany,
          findFirst: mocks.findFirst,
          findFirstOrThrow: mocks.findFirstOrThrow,
          updateMany: mocks.updateMany,
        },
      }),
  },
}));
vi.mock("../tenant-query", () => ({
  scopedQuery: mocks.scopedQuery,
}));

const { getOrCreateForOrganisation, updateForOrganisation } = await import(
  "./repository"
);

const tenant: { accountId: AccountId; organisationId: OrganisationId } = {
  accountId: "org_test_settings_repo" as AccountId,
  organisationId: "65000000-0000-4000-8000-000000000001" as OrganisationId,
};

const row = {
  account_id: tenant.accountId,
  created_at: new Date("2026-04-19T00:00:00.000Z"),
  default_feed_privacy_mode: "named" as const,
  default_leave_request_advance_days: 0,
  default_privacy_mode: "named" as const,
  feeds_include_public_holidays_default: false,
  id: "75000000-0000-4000-8000-000000000001",
  notify_managers_on_status_change: true,
  organisation_id: tenant.organisationId,
  require_decline_reason: true,
  show_declined_on_approvals: true,
  show_pending_on_calendar: true,
  updated_at: new Date("2026-04-19T00:00:00.000Z"),
};

describe("organisation-settings repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing row when present", async () => {
    mocks.findFirst.mockResolvedValue(row);

    const result = await withTestTenantDb(tenantTestAccount(tenant), (db) =>
      getOrCreateForOrganisation(tenant, db)
    );

    expect(result).toEqual(row);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a default row when missing", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findFirstOrThrow.mockResolvedValue(row);

    const result = await withTestTenantDb(tenantTestAccount(tenant), (db) =>
      getOrCreateForOrganisation(tenant, db)
    );

    expect(result).toEqual(row);
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: {
        account_id: tenant.accountId,
        organisation_id: tenant.organisationId,
      },
      skipDuplicates: true,
    });
  });

  it("is idempotent under concurrent calls", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.createMany.mockResolvedValueOnce({ count: 0 });
    mocks.createMany.mockResolvedValueOnce({ count: 1 });
    mocks.findFirstOrThrow.mockResolvedValue(row);

    const [first, second] = await Promise.all([
      withTestTenantDb(tenantTestAccount(tenant), (db) =>
        getOrCreateForOrganisation(tenant, db)
      ),
      withTestTenantDb(tenantTestAccount(tenant), (db) =>
        getOrCreateForOrganisation(tenant, db)
      ),
    ]);

    expect(first).toEqual(row);
    expect(second).toEqual(row);
    expect(mocks.findFirstOrThrow).toHaveBeenCalledTimes(2);
  });

  it("updates persisted values", async () => {
    const updated = {
      ...row,
      require_decline_reason: false as const,
    };
    mocks.findFirst.mockResolvedValue(row);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findFirstOrThrow.mockResolvedValue(updated);

    const result = await withTestTenantDb(
      tenantTestAccount({
        ...tenant,
        patch: { require_decline_reason: false },
      }),
      (db) =>
        updateForOrganisation(
          {
            ...tenant,
            patch: { require_decline_reason: false },
          },
          db
        )
    );

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { require_decline_reason: false },
      where: {
        account_id: tenant.accountId,
        organisation_id: tenant.organisationId,
      },
    });
    expect(result.require_decline_reason).toBe(false);
  });
});

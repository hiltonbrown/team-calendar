import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindMany: vi.fn(),
  tenantFindMany: vi.fn(),
}));

vi.mock("../client", () => ({
  database: {
    xeroConnection: {
      findMany: mocks.connectionFindMany,
    },
    xeroTenant: {
      findMany: mocks.tenantFindMany,
    },
  },
}));

const { findConnectionsNeedingTokenRotation, listSchedulableXeroTenants } =
  await import("./schedulable-xero-tenants");

describe("findConnectionsNeedingTokenRotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds active connections last refreshed more than 45 days ago", async () => {
    const now = new Date("2026-08-23T00:00:00.000Z");
    const lastRefreshedAt = new Date("2026-07-01T00:00:00.000Z");
    mocks.connectionFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_clerk_1",
        id: "connection-uuid-1",
        last_refreshed_at: lastRefreshedAt,
        organisation_id: "organisation-uuid-1",
      },
    ]);

    const result = await findConnectionsNeedingTokenRotation({ now });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          clerkOrgId: "org_clerk_1",
          connectionId: "connection-uuid-1",
          lastRefreshedAt,
          organisationId: "organisation-uuid-1",
        },
      ],
    });
    expect(mocks.connectionFindMany).toHaveBeenCalledWith({
      orderBy: [{ last_refreshed_at: "asc" }, { id: "asc" }],
      select: {
        clerk_org_id: true,
        id: true,
        last_refreshed_at: true,
        organisation_id: true,
      },
      where: {
        disconnected_at: null,
        OR: [
          { last_error_code: "refresh_persist_failed" },
          { last_refreshed_at: { lt: new Date("2026-07-09T00:00:00.000Z") } },
        ],
        organisation: {
          archived_at: null,
          is_active: true,
        },
        revoked_at: null,
        status: "active",
      },
    });
  });

  it("returns an internal error when the maintenance query fails", async () => {
    mocks.connectionFindMany.mockRejectedValue(new Error("database offline"));

    const result = await findConnectionsNeedingTokenRotation();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("database offline");
    }
  });
});

describe("listSchedulableXeroTenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries active, non-archived, non-paused AU Xero tenants across Clerk orgs with no token columns in select", async () => {
    const fixtureDate = new Date("2026-08-01T00:00:00.000Z");
    const databaseTenantIdA = "tenant-uuid-1";
    const databaseTenantIdB = "tenant-uuid-2";
    const providerTenantIdA = "xero-tenant-1";
    const providerTenantIdB = "xero-tenant-2";

    mocks.tenantFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_clerk_1",
        id: databaseTenantIdA,
        last_approval_state_reconciled_at: fixtureDate,
        last_leave_balances_sync_at: fixtureDate,
        last_leave_records_sync_at: fixtureDate,
        last_people_sync_at: fixtureDate,
        organisation: {
          timezone: "Australia/Sydney",
        },
        organisation_id: "org-uuid-1",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
        xero_tenant_id: providerTenantIdA,
      },
      {
        clerk_org_id: "org_clerk_2",
        id: databaseTenantIdB,
        last_approval_state_reconciled_at: null,
        last_leave_balances_sync_at: null,
        last_leave_records_sync_at: null,
        last_people_sync_at: null,
        organisation: {
          timezone: "Australia/Melbourne",
        },
        organisation_id: "org-uuid-2",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
        xero_tenant_id: providerTenantIdB,
      },
    ]);

    const result = await listSchedulableXeroTenants();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.tenants).toHaveLength(2);
    expect(result.value.tenants[0].clerkOrgId).toBe("org_clerk_1");
    expect(result.value.tenants[1].clerkOrgId).toBe("org_clerk_2");
    expect(result.value.tenants[0].databaseTenantId).toBe(databaseTenantIdA);
    expect(result.value.tenants[1].databaseTenantId).toBe(databaseTenantIdB);

    // Inspect the call to database.xeroTenant.findMany
    const [[callArgs]] = mocks.tenantFindMany.mock.calls;

    // Verify filter boundaries
    expect(callArgs.where).toEqual({
      organisation: {
        archived_at: null,
        is_active: true,
      },
      payroll_region: "AU",
      sync_paused_at: null,
      xero_connection: {
        disconnected_at: null,
        revoked_at: null,
        status: "active",
      },
    });

    // Verify token columns are NOT selected
    const selectKeys = Object.keys(callArgs.select);
    expect(selectKeys).not.toContain("xero_tenant_id");
    expect(selectKeys).not.toContain("access_token_encrypted");
    expect(selectKeys).not.toContain("refresh_token_encrypted");
    expect(selectKeys).not.toContain("access_token_iv");
    expect(selectKeys).not.toContain("refresh_token_iv");
    expect(selectKeys).not.toContain("access_token_auth_tag");
    expect(selectKeys).not.toContain("refresh_token_auth_tag");
    expect(selectKeys).not.toContain("source_payload_json");
  });

  it("handles cursor pagination properly", async () => {
    const databaseTenantIdA = "tenant-uuid-1";
    const databaseTenantIdB = "tenant-uuid-2";
    const providerTenantIdA = "xero-tenant-1";
    const providerTenantIdB = "xero-tenant-2";

    mocks.tenantFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_clerk_1",
        id: databaseTenantIdA,
        last_approval_state_reconciled_at: null,
        last_leave_balances_sync_at: null,
        last_leave_records_sync_at: null,
        last_people_sync_at: null,
        organisation: { timezone: "Australia/Sydney" },
        organisation_id: "org-uuid-1",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
        xero_tenant_id: providerTenantIdA,
      },
      {
        clerk_org_id: "org_clerk_1",
        id: databaseTenantIdB,
        last_approval_state_reconciled_at: null,
        last_leave_balances_sync_at: null,
        last_leave_records_sync_at: null,
        last_people_sync_at: null,
        organisation: { timezone: "Australia/Sydney" },
        organisation_id: "org-uuid-1",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
        xero_tenant_id: providerTenantIdB,
      },
    ]);

    const result = await listSchedulableXeroTenants({
      cursor: "tenant-uuid-0",
      limit: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.tenants).toHaveLength(1);
    expect(result.value.tenants[0].databaseTenantId).toBe(databaseTenantIdA);
    expect(result.value.nextCursor).toBe(databaseTenantIdA);

    expect(mocks.tenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "tenant-uuid-0" },
        orderBy: { id: "asc" },
        skip: 1,
        take: 2,
      })
    );
  });

  it("gracefully omits tenants with missing connection or organisation relations without throwing", async () => {
    const validTenantId = "tenant-uuid-valid";

    mocks.tenantFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_clerk_1",
        id: "tenant-uuid-missing-conn",
        last_approval_state_reconciled_at: null,
        last_leave_balances_sync_at: null,
        last_leave_records_sync_at: null,
        last_people_sync_at: null,
        organisation: { timezone: "Australia/Sydney" },
        organisation_id: "org-uuid-1",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: null,
        xero_tenant_id: "provider-1",
      },
      {
        clerk_org_id: "org_clerk_1",
        id: "tenant-uuid-missing-org",
        last_approval_state_reconciled_at: null,
        last_leave_balances_sync_at: null,
        last_leave_records_sync_at: null,
        last_people_sync_at: null,
        organisation: null,
        organisation_id: "org-uuid-2",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
        xero_tenant_id: "provider-2",
      },
      {
        clerk_org_id: "org_clerk_1",
        id: validTenantId,
        last_approval_state_reconciled_at: null,
        last_leave_balances_sync_at: null,
        last_leave_records_sync_at: null,
        last_people_sync_at: null,
        organisation: { timezone: "Australia/Sydney" },
        organisation_id: "org-uuid-3",
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
        xero_tenant_id: "provider-3",
      },
    ]);

    const result = await listSchedulableXeroTenants({ limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.tenants).toHaveLength(1);
    expect(result.value.tenants[0].databaseTenantId).toBe(validTenantId);
  });
});

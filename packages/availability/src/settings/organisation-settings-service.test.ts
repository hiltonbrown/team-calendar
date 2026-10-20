import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  getOrCreateOrganisationSettings: vi.fn(),
  updateOrganisationSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),

  getOrCreateOrganisationSettings: mocks.getOrCreateOrganisationSettings,
  updateOrganisationSettings: mocks.updateOrganisationSettings,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      auditEvent: {
        create: mocks.auditCreate,
      },
    },
  };
}

const service = await import("./organisation-settings-service");

const baseRow = {
  clerk_org_id: "org_1",
  created_at: new Date("2026-04-19T00:00:00.000Z"),
  default_feed_privacy_mode: "named" as const,
  default_leave_request_advance_days: 0,
  default_privacy_mode: "named" as const,
  feeds_include_public_holidays_default: false,
  id: "75000000-0000-4000-8000-000000000001",
  notify_managers_on_status_change: true,
  organisation_id: "00000000-0000-4000-8000-000000000001",
  require_decline_reason: true,
  show_declined_on_approvals: true,
  show_pending_on_calendar: true,
  updated_at: new Date("2026-04-19T00:00:00.000Z"),
};

describe("organisation-settings-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateOrganisationSettings.mockResolvedValue(baseRow);
    mocks.updateOrganisationSettings.mockResolvedValue(baseRow);
  });

  it("returns full defaults from getSettings", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
      }),
      (db) =>
        service.getSettings(
          {
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
          },
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        defaultPrivacyMode: "named",
        organisationId: baseRow.organisation_id,
        showPendingOnCalendar: true,
      },
    });
  });

  it("recovers on the next read after a settings load fails", async () => {
    const input = {
      clerkOrgId: "org_settings_recovery",
      organisationId: baseRow.organisation_id,
    };
    mocks.getOrCreateOrganisationSettings.mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    await expect(
      withTestTenantResult(tenantTestAccount(input), (db) =>
        service.getSettings(input, db)
      )
    ).rejects.toThrow("Database unavailable");
    expect(
      await withTestTenantResult(tenantTestAccount(input), (db) =>
        service.getSettings(input, db)
      )
    ).toMatchObject({
      ok: true,
      value: {
        organisationId: baseRow.organisation_id,
        showPendingOnCalendar: true,
      },
    });
    expect(mocks.getOrCreateOrganisationSettings).toHaveBeenCalledTimes(2);
  });

  it("isolates settings reads in separate transaction roots", async () => {
    const input = {
      clerkOrgId: "org_settings_concurrent",
      organisationId: baseRow.organisation_id,
    };
    let resolveSettings: ((row: typeof baseRow) => void) | undefined;
    const loading = new Promise<typeof baseRow>((resolve) => {
      resolveSettings = resolve;
    });
    mocks.getOrCreateOrganisationSettings.mockReturnValueOnce(loading);

    const first = withTestTenantResult(tenantTestAccount(input), (db) =>
      service.getSettings(input, db)
    );
    const second = withTestTenantResult(tenantTestAccount(input), (db) =>
      service.getSettings(input, db)
    );
    await vi.waitFor(() =>
      expect(mocks.getOrCreateOrganisationSettings).toHaveBeenCalledTimes(2)
    );
    resolveSettings?.(baseRow);

    for (const result of await Promise.all([first, second])) {
      expect(result).toMatchObject({
        ok: true,
        value: {
          organisationId: baseRow.organisation_id,
          showPendingOnCalendar: true,
        },
      });
    }
    expect(mocks.getOrCreateOrganisationSettings).toHaveBeenCalledTimes(2);
  });

  it("updates settings and writes an audit event", async () => {
    const updatedRow = {
      ...baseRow,
      notify_managers_on_status_change: false,
    };
    mocks.updateOrganisationSettings.mockResolvedValue(updatedRow);

    const result = await withTestTenantResult(
      tenantTestAccount({
        actingRole: "admin",
        actingUserId: "user_1",
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
        patch: {
          notifyManagersOnStatusChange: false,
        },
      }),
      (db) =>
        service.updateSettings(
          {
            actingRole: "admin",
            actingUserId: "user_1",
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
            patch: {
              notifyManagersOnStatusChange: false,
            },
          },
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        notifyManagersOnStatusChange: false,
      },
    });
    expect(mocks.updateOrganisationSettings).toHaveBeenCalledWith(
      {
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
        patch: {
          notify_managers_on_status_change: false,
        },
      },
      expect.any(Object)
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "organisation_settings.updated",
          after_value: expect.objectContaining({}),
          before_value: expect.objectContaining({}),
          metadata: {
            actingUserId: "user_1",
            changedKeys: ["notifyManagersOnStatusChange"],
          },
        }),
      })
    );
  });

  it("rejects unknown keys with a validation error", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        actingRole: "admin",
        actingUserId: "user_1",
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
        patch: {
          unknown: true,
        } as never,
      }),
      (db) =>
        service.updateSettings(
          {
            actingRole: "admin",
            actingUserId: "user_1",
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
            patch: {
              unknown: true,
            } as never,
          },
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
  });

  it("rejects invalid enum values", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        actingRole: "owner",
        actingUserId: "user_1",
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
        patch: {
          managerVisibilityScope: "invalid-scope",
        } as never,
      }),
      (db) =>
        service.updateSettings(
          {
            actingRole: "owner",
            actingUserId: "user_1",
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
            patch: {
              managerVisibilityScope: "invalid-scope",
            } as never,
          },
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
  });

  it("reads a legacy disabled decline-reason policy truthfully", async () => {
    mocks.getOrCreateOrganisationSettings.mockResolvedValue({
      ...baseRow,
      require_decline_reason: false,
    });

    const result = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: "org_legacy",
        organisationId: baseRow.organisation_id,
      }),
      (db) =>
        service.getSettings(
          {
            clerkOrgId: "org_legacy",
            organisationId: baseRow.organisation_id,
          },
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: { requireDeclineReason: false },
    });
  });

  it("rejects attempts to make decline reasons optional without persisting", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        actingRole: "admin",
        actingUserId: "user_1",
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
        // Test-only type escape: exercise domain validation of the legacy false value.
        patch: { requireDeclineReason: false } as never,
      }),
      (db) =>
        service.updateSettings(
          {
            actingRole: "admin",
            actingUserId: "user_1",
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
            // Test-only type escape: exercise domain validation of the legacy false value.
            patch: { requireDeclineReason: false } as never,
          },
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(mocks.updateOrganisationSettings).not.toHaveBeenCalled();
  });

  it("restores the required decline-reason policy in the default patch", () => {
    expect(service.defaultOrganisationSettingsPatch()).toMatchObject({
      requireDeclineReason: true,
    });
  });

  it.each([
    ["viewer", false],
    ["manager", false],
    ["admin", true],
    ["owner", true],
  ] as const)("authorises %s correctly", async (actingRole, expectedOk) => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        actingRole,
        actingUserId: "user_1",
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
        patch: { showPendingOnCalendar: false },
      }),
      (db) =>
        service.updateSettings(
          {
            actingRole,
            actingUserId: "user_1",
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
            patch: { showPendingOnCalendar: false },
          },
          db
        )
    );

    expect(result.ok).toBe(expectedOk);
    if (!expectedOk) {
      expect(result).toMatchObject({
        error: { code: "not_authorised" },
        ok: false,
      });
    }
  });

  it("reuses the request-scoped cache for repeated reads", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
      }),
      (db) =>
        service.getSettings(
          {
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
          },
          db
        )
    );
    const second = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: baseRow.clerk_org_id,
        organisationId: baseRow.organisation_id,
      }),
      (db) =>
        service.getSettings(
          {
            clerkOrgId: baseRow.clerk_org_id,
            organisationId: baseRow.organisation_id,
          },
          db
        )
    );

    expect(first).toEqual(second);
    expect(mocks.getOrCreateOrganisationSettings).toHaveBeenCalledTimes(2);
  });
});

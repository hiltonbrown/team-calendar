import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  getOrCreateOrganisationSettings: vi.fn(),
  updateOrganisationSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    auditEvent: {
      create: mocks.auditCreate,
    },
  },
  getOrCreateOrganisationSettings: mocks.getOrCreateOrganisationSettings,
  updateOrganisationSettings: mocks.updateOrganisationSettings,
}));

const service = await import("./organisation-settings-service");

const baseRow = {
  clerk_org_id: "org_1",
  created_at: new Date("2026-04-19T00:00:00.000Z"),
  default_feed_privacy_mode: "named" as const,
  default_leave_request_advance_days: 0,
  default_privacy_mode: "named" as const,
  feeds_include_public_holidays_default: false,
  id: "75000000-0000-4000-8000-000000000001",
  manager_visibility_scope: "direct_reports_only" as const,
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
    const result = await service.getSettings({
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        defaultPrivacyMode: "named",
        managerVisibilityScope: "direct_reports_only",
        organisationId: baseRow.organisation_id,
        showPendingOnCalendar: true,
      },
    });
  });

  it("updates settings and writes an audit event", async () => {
    const updatedRow = {
      ...baseRow,
      manager_visibility_scope: "all_team_leave" as const,
      notify_managers_on_status_change: false,
    };
    mocks.updateOrganisationSettings.mockResolvedValue(updatedRow);

    const result = await service.updateSettings({
      actingRole: "admin",
      actingUserId: "user_1",
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
      patch: {
        managerVisibilityScope: "all_team_leave",
        notifyManagersOnStatusChange: false,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        managerVisibilityScope: "all_team_leave",
        notifyManagersOnStatusChange: false,
      },
    });
    expect(mocks.updateOrganisationSettings).toHaveBeenCalledWith({
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
      patch: {
        manager_visibility_scope: "all_team_leave",
        notify_managers_on_status_change: false,
      },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "organisation_settings.updated",
          after_value: expect.objectContaining({
            managerVisibilityScope: "all_team_leave",
          }),
          before_value: expect.objectContaining({
            managerVisibilityScope: "direct_reports_only",
          }),
          metadata: {
            actingUserId: "user_1",
            changedKeys: [
              "managerVisibilityScope",
              "notifyManagersOnStatusChange",
            ],
          },
        }),
      })
    );
  });

  it("rejects unknown keys with a validation error", async () => {
    const result = await service.updateSettings({
      actingRole: "admin",
      actingUserId: "user_1",
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
      patch: {
        unknown: true,
      } as never,
    });

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
  });

  it("rejects invalid enum values", async () => {
    const result = await service.updateSettings({
      actingRole: "owner",
      actingUserId: "user_1",
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
      patch: {
        managerVisibilityScope: "invalid-scope",
      } as never,
    });

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

    const result = await service.getSettings({
      clerkOrgId: "org_legacy",
      organisationId: baseRow.organisation_id,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { requireDeclineReason: false },
    });
  });

  it("rejects attempts to make decline reasons optional without persisting", async () => {
    const result = await service.updateSettings({
      actingRole: "admin",
      actingUserId: "user_1",
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
      // Test-only type escape: exercise domain validation of the legacy false value.
      patch: { requireDeclineReason: false } as never,
    });

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
    const result = await service.updateSettings({
      actingRole,
      actingUserId: "user_1",
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
      patch: { showPendingOnCalendar: false },
    });

    expect(result.ok).toBe(expectedOk);
    if (!expectedOk) {
      expect(result).toMatchObject({
        error: { code: "not_authorised" },
        ok: false,
      });
    }
  });

  it("reuses the request-scoped cache for repeated reads", async () => {
    const first = await service.getSettings({
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
    });
    const second = await service.getSettings({
      clerkOrgId: baseRow.clerk_org_id,
      organisationId: baseRow.organisation_id,
    });

    expect(first).toEqual(second);
    expect(mocks.getOrCreateOrganisationSettings).toHaveBeenCalledTimes(1);
  });
});

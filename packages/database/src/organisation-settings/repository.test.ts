import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  findFirstOrThrow: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
  updateMany: vi.fn(),
}));

vi.mock("../client", () => ({
  database: {
    organisationSettings: {
      create: mocks.create,
      findFirst: mocks.findFirst,
      findFirstOrThrow: mocks.findFirstOrThrow,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("../tenant-query", () => ({
  scopedQuery: mocks.scopedQuery,
}));

const { getOrCreateForOrganisation, updateForOrganisation } = await import(
  "./repository"
);

const tenant: { clerkOrgId: ClerkOrgId; organisationId: OrganisationId } = {
  clerkOrgId: "org_test_settings_repo" as ClerkOrgId,
  organisationId: "65000000-0000-4000-8000-000000000001" as OrganisationId,
};

const row = {
  clerk_org_id: tenant.clerkOrgId,
  created_at: new Date("2026-04-19T00:00:00.000Z"),
  default_feed_privacy_mode: "named" as const,
  default_leave_request_advance_days: 0,
  default_privacy_mode: "named" as const,
  feeds_include_public_holidays_default: false,
  id: "75000000-0000-4000-8000-000000000001",
  manager_visibility_scope: "direct_reports_only" as const,
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

    const result = await getOrCreateForOrganisation(tenant);

    expect(result).toEqual(row);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a default row when missing", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(row);

    const result = await getOrCreateForOrganisation(tenant);

    expect(result).toEqual(row);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        organisation_id: tenant.organisationId,
      },
      select: expect.any(Object),
    });
  });

  it("is idempotent under concurrent calls", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockRejectedValueOnce(new Error("duplicate"));
    mocks.create.mockResolvedValueOnce(row);
    mocks.findFirstOrThrow.mockResolvedValue(row);

    const [first, second] = await Promise.all([
      getOrCreateForOrganisation(tenant),
      getOrCreateForOrganisation(tenant),
    ]);

    expect(first).toEqual(row);
    expect(second).toEqual(row);
    expect(mocks.findFirstOrThrow).toHaveBeenCalledTimes(1);
  });

  it("updates persisted values", async () => {
    const updated = {
      ...row,
      manager_visibility_scope: "all_team_leave" as const,
    };
    mocks.findFirst.mockResolvedValue(row);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findFirstOrThrow.mockResolvedValue(updated);

    const result = await updateForOrganisation({
      ...tenant,
      patch: { manager_visibility_scope: "all_team_leave" },
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { manager_visibility_scope: "all_team_leave" },
      where: {
        clerk_org_id: tenant.clerkOrgId,
        organisation_id: tenant.organisationId,
      },
    });
    expect(result.manager_visibility_scope).toBe("all_team_leave");
  });
});

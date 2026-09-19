import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: { person: { findMany: mocks.findMany } },
}));
vi.mock("./organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));

const { managerScopePersonIds } = await import("./manager-scope");

const input = {
  actingPersonId: "00000000-0000-4000-8000-000000000001",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000002",
};
const directReportId = "00000000-0000-4000-8000-000000000003";
const transitiveReportId = "00000000-0000-4000-8000-000000000004";

describe("managerScopePersonIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: { managerVisibilityScope: "direct_reports_only" },
    });
    mocks.findMany.mockResolvedValue([
      { id: input.actingPersonId, manager_person_id: null },
      { id: directReportId, manager_person_id: input.actingPersonId },
      { id: transitiveReportId, manager_person_id: directReportId },
    ]);
  });

  it("includes the actor by default", async () => {
    await expect(managerScopePersonIds(input)).resolves.toEqual([
      input.actingPersonId,
      directReportId,
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
      select: { id: true, manager_person_id: true },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
  });

  it("excludes the actor while retaining direct reports", async () => {
    await expect(
      managerScopePersonIds({ ...input, excludeSelf: true })
    ).resolves.toEqual([directReportId]);
  });

  it("excludes the actor while retaining transitive reports", async () => {
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: { managerVisibilityScope: "all_team_leave" },
    });

    await expect(
      managerScopePersonIds({ ...input, excludeSelf: true })
    ).resolves.toEqual([directReportId, transitiveReportId]);
  });

  it("returns no people when settings cannot be read and self is excluded", async () => {
    mocks.getSettings.mockResolvedValue({ error: {}, ok: false });

    await expect(
      managerScopePersonIds({ ...input, excludeSelf: true })
    ).resolves.toEqual([]);
  });
});

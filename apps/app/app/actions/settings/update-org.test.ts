import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  updateOrganization: vi.fn(),
  updateMany: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));
vi.mock("@repo/database", () => ({
  database: {
    organisation: {
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { updateOrg } = await import("./update-org");

const organisationId = "00000000-0000-4000-8000-000000000001";

const validInput = {
  organisationId,
  name: "Acme Restaurants",
  timezone: "Australia/Sydney",
  locale: "en-AU",
  fiscalYearStart: 7,
  reportingUnit: "hours",
  workingHoursPerDay: 7.6,
} as const;

describe("updateOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:viewer",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId: "org_1", organisationId },
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        updateOrganization: mocks.updateOrganization,
      },
    });
    mocks.updateOrganization.mockResolvedValue({});
  });

  it("rejects viewers before touching the database or Clerk", async () => {
    const result = await updateOrg(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.getActiveOrgContext).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.clerkClient).not.toHaveBeenCalled();
  });

  it("allows admins to update organisation settings", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });

    const result = await updateOrg(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { clerk_org_id: "org_1", id: organisationId },
      data: {
        fiscal_year_start: 7,
        locale: "en-AU",
        name: "Acme Restaurants",
        reporting_unit: "hours",
        timezone: "Australia/Sydney",
        working_hours_per_day: 7.6,
      },
    });
    expect(mocks.updateOrganization).toHaveBeenCalled();
  });

  it("bails out before updating Clerk when no organisation row matches", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateOrg(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.updateOrganization).not.toHaveBeenCalled();
  });
});

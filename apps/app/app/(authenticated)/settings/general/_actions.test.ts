import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  currentUser: vi.fn(),
  database: {
    auditEvent: { create: vi.fn() },
    organisation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  getActiveOrgContext: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/database", () => ({
  tenantDatabase: vi.fn(() => mocks.database),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { updateOrganisationAction } = await import("./_actions");

describe("general settings organisation actions", () => {
  const organisationId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "admin@example.com" }],
      firstName: "Admin",
      id: "user_1",
      lastName: "User",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId: "org_1", organisationId },
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.database.auditEvent.create.mockResolvedValue({});
  });

  it.each(["NZ", "UK"] as const)(
    "rejects switching an organisation to unsupported country %s",
    async (countryCode) => {
      mocks.database.organisation.findFirst.mockResolvedValue({
        country_code: "AU",
        name: "Australian Payroll",
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      });

      const result = await updateOrganisationAction({
        confirmationCountryChange: true,
        countryCode,
        organisationId,
      });

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message:
            "Team Calendar currently supports Australian Xero Payroll files only.",
        },
        ok: false,
      });
      expect(mocks.database.organisation.findFirst).toHaveBeenCalled();
      expect(mocks.database.organisation.update).not.toHaveBeenCalled();
    }
  );

  it("allows an existing NZ organisation to save its unchanged country", async () => {
    mocks.database.organisation.findFirst.mockResolvedValue({
      country_code: "NZ",
      name: "Legacy Payroll",
      region_code: "AUK",
      timezone: "Pacific/Auckland",
    });
    mocks.database.organisation.update.mockResolvedValue({
      country_code: "NZ",
      name: "Updated Legacy Payroll",
      region_code: "AUK",
      timezone: "Pacific/Auckland",
    });

    const result = await updateOrganisationAction({
      countryCode: "NZ",
      name: "Updated Legacy Payroll",
      organisationId,
      regionCode: "AUK",
      timezone: "Pacific/Auckland",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        countryCode: "NZ",
        name: "Updated Legacy Payroll",
        regionCode: "AUK",
        timezone: "Pacific/Auckland",
      },
    });
    expect(mocks.database.organisation.update).toHaveBeenCalledWith({
      data: {
        country_code: "NZ",
        name: "Updated Legacy Payroll",
        region_code: "AUK",
        timezone: "Pacific/Auckland",
      },
      select: {
        country_code: true,
        name: true,
        region_code: true,
        timezone: true,
      },
      where: { id: organisationId },
    });
  });

  it("stores a region label as its registry code", async () => {
    mocks.database.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      name: "Australian Payroll",
      region_code: null,
      timezone: "Australia/Brisbane",
    });
    mocks.database.organisation.update.mockResolvedValue({
      country_code: "AU",
      name: "Australian Payroll",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });

    const result = await updateOrganisationAction({
      organisationId,
      regionCode: "Queensland",
    });

    expect(result.ok).toBe(true);
    expect(mocks.database.organisation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ region_code: "QLD" }),
      })
    );
  });

  it("rejects a region that is not in the organisation's country", async () => {
    mocks.database.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      name: "Australian Payroll",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });

    const result = await updateOrganisationAction({
      organisationId,
      regionCode: "Scotland",
    });

    expect(result).toEqual({
      error: {
        code: "validation_error",
        message: "Choose a state or region in that country.",
      },
      ok: false,
    });
    expect(mocks.database.organisation.update).not.toHaveBeenCalled();
  });
});

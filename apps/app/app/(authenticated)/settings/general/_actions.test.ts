import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: {
    auditEvent: { create: vi.fn() },
    organisation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  getAccount: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  updateAccount: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) =>
      executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...buildTenantTestDatabase(),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return mocks.database;
}
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
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({
      email: "admin@example.com",
      id: "user_1",
      name: "Admin",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId: "org_1", organisationId },
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

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
  getAccount: mocks.getAccount,
  updateAccount: mocks.updateAccount,
}));

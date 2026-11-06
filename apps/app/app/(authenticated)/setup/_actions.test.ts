const tenantPoolMocks = vi.hoisted(() => ({
  organisationFindFirst: vi.fn((query: { where: { id?: string } }) =>
    Promise.resolve(
      query.where.id === "00000000-0000-4000-8000-000000000001"
        ? {
            country_code: "AU",
            id: "00000000-0000-4000-8000-000000000001",
            name: "Company A",
            timezone: "Australia/Brisbane",
          }
        : null
    )
  ),
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (client: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(() => Promise.resolve(1)),
        $queryRaw: vi.fn(() => Promise.resolve([])),
        organisation: {
          findFirst: tenantPoolMocks.organisationFindFirst,
          findMany: vi.fn(() =>
            Promise.resolve([
              {
                country_code: "AU",
                id: "00000000-0000-4000-8000-000000000001",
                name: "Company A",
                timezone: "Australia/Brisbane",
              },
            ])
          ),
        },
        person: {
          findFirst: vi.fn(() =>
            Promise.resolve({
              id: "person-1",
              organisation_id: "00000000-0000-4000-8000-000000000001",
            })
          ),
        },
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/account-companies")
  >("../../../../../packages/database/src/queries/account-companies")),

  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/organisations")
  >("../../../../../packages/database/src/queries/organisations")),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCurrentUserPerson: vi.fn(),
  ensureOrganisationForAccount: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  ensureCurrentUserPerson: mocks.ensureCurrentUserPerson,
  ensureOrganisationForAccount: mocks.ensureOrganisationForAccount,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const { createOrganisationAction } = await import("./_actions");

describe("setup organisation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({
      email: "admin@example.com",
      id: "user_1",
      image: "https://images.example.test/user.png",
      name: "Admin User",
    });
    mocks.ensureOrganisationForAccount.mockResolvedValue({
      accountId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
  });

  it("ensures the creator is linked to a person after setup", async () => {
    await createOrganisationAction({
      countryCode: "AU",
      name: "Team Calendar Test",
    });

    expect(mocks.ensureOrganisationForAccount).toHaveBeenCalledWith(
      {
        accountId: "org_1",
        countryCode: "AU",
        name: "Team Calendar Test",
      },
      expect.any(Object)
    );
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledWith(
      {
        accountId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
      },
      {
        avatarUrl: "https://images.example.test/user.png",
        displayName: "Admin User",
        email: "admin@example.com",
        userId: "user_1",
      },
      mocks.ensureOrganisationForAccount.mock.calls[0]?.[1]
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it.each(["NZ", "UK"] as const)(
    "rejects unsupported %s payroll regions before creating an organisation",
    async (countryCode) => {
      const result = await createOrganisationAction({
        countryCode,
        name: "Team Calendar Test",
      });

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message:
            "Team Calendar currently supports Australian Xero Payroll files only.",
        },
        ok: false,
      });
      expect(mocks.ensureOrganisationForAccount).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    }
  );
});

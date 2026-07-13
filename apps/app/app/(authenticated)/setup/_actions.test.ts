import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  ensureCurrentUserPerson: vi.fn(),
  ensureOrganisationForClerk: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  ensureCurrentUserPerson: mocks.ensureCurrentUserPerson,
  ensureOrganisationForClerk: mocks.ensureOrganisationForClerk,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const { createOrganisationAction } = await import("./_actions");

describe("setup organisation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgId: "org_1", orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "admin@example.com" }],
      firstName: "Admin",
      id: "user_1",
      imageUrl: "https://img.clerk.com/user.png",
      lastName: "User",
    });
    mocks.ensureOrganisationForClerk.mockResolvedValue({
      clerkOrgId: "org_1",
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

    expect(mocks.ensureOrganisationForClerk).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      countryCode: "AU",
      name: "Team Calendar Test",
    });
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
      },
      {
        avatarUrl: "https://img.clerk.com/user.png",
        clerkUserId: "user_1",
        displayName: "Admin User",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
      }
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it.each([
    "NZ",
    "UK",
  ] as const)("rejects unsupported %s payroll regions before creating an organisation", async (countryCode) => {
    const result = await createOrganisationAction({
      countryCode,
      name: "Team Calendar Test",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message:
          "Team Calendar currently supports Australian Xero Payroll files only.",
      },
    });
    expect(mocks.ensureOrganisationForClerk).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultOrganisation: vi.fn(),
  getActiveOrgContext: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  requireOrg: vi.fn(),
  resolveAccountCompanies: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@repo/auth/helpers", () => ({
  requireOrg: mocks.requireOrg,
}));

vi.mock("@repo/database/queries/account-companies", () => ({
  resolveAccountCompanies: mocks.resolveAccountCompanies,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("./ensure-default-organisation", () => ({
  ensureDefaultOrganisation: mocks.ensureDefaultOrganisation,
}));

vi.mock("./get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { requireActiveOrgPageContext } = await import(
  "./require-active-org-page-context"
);

const clerkOrgId = "org_test_cookie_state";
const organisationId = "00000000-0000-4000-8000-000000000100";

describe("requireActiveOrgPageContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves missing org from Clerk cookie state without redirecting", async () => {
    mocks.requireOrg.mockResolvedValue(clerkOrgId);
    mocks.resolveAccountCompanies.mockResolvedValue([
      {
        countryCode: "AU",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: organisationId,
        name: "Alpha",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    await expect(requireActiveOrgPageContext()).resolves.toEqual({
      clerkOrgId,
      organisationId,
      orgQueryValue: null,
      orgSource: "clerk_cookie",
    });
    expect(mocks.getActiveOrgContext).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("validates explicit org query values", async () => {
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: {
        clerkOrgId,
        organisationId,
      },
    });

    await expect(requireActiveOrgPageContext(organisationId)).resolves.toEqual({
      clerkOrgId,
      organisationId,
      orgQueryValue: organisationId,
      orgSource: "query",
    });
    expect(mocks.requireOrg).not.toHaveBeenCalled();
  });

  it("returns notFound for explicit out-of-scope org values", async () => {
    mocks.getActiveOrgContext.mockResolvedValue({
      error: { code: "not_found", message: "Organisation not found" },
      ok: false,
    });

    await expect(requireActiveOrgPageContext(organisationId)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("returns notFound without creating a company when the account has none", async () => {
    mocks.requireOrg.mockResolvedValue(clerkOrgId);
    mocks.resolveAccountCompanies.mockResolvedValue([]);
    await expect(requireActiveOrgPageContext()).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(mocks.ensureDefaultOrganisation).not.toHaveBeenCalled();
  });
});

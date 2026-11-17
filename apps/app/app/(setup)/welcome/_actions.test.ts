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
  captureOnboardingEvent: vi.fn(),
  completeMemberWelcome: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  completeMemberWelcome: mocks.completeMemberWelcome,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
vi.mock("@/lib/server/onboarding-analytics", () => ({
  captureOnboardingEvent: mocks.captureOnboardingEvent,
}));

const { completeWelcomeAction } = await import("./_actions");
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("completeWelcomeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "viewer" });
    mocks.getCurrentUser.mockResolvedValue({ id: "user_m" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId: "org_1", organisationId },
    });
    mocks.completeMemberWelcome.mockResolvedValue({
      ok: true,
      value: undefined,
    });
  });

  it("marks the welcome as seen for the member and records it", async () => {
    expect(
      await completeWelcomeAction({ organisationId, skipped: true })
    ).toEqual({ ok: true, value: { redirectTo: "/" } });
    expect(mocks.completeMemberWelcome).toHaveBeenCalledWith(
      {
        accountId: "org_1",
        actingRole: "viewer",
        organisationId,
        userId: "user_m",
      },
      expect.any(Object)
    );
    expect(mocks.captureOnboardingEvent).toHaveBeenCalledWith({
      distinctId: "user_m",
      event: "Member Welcome Completed",
      properties: { skipped: true },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses requests outside the active organisation", async () => {
    tenantPoolMocks.organisationFindFirst.mockResolvedValueOnce(null);
    expect(
      await completeWelcomeAction({ organisationId, skipped: false })
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(mocks.completeMemberWelcome).not.toHaveBeenCalled();
  });

  it("reports a save failure without recording analytics", async () => {
    mocks.completeMemberWelcome.mockResolvedValue({
      error: { code: "not_found", message: "Person not found." },
      ok: false,
    });
    expect(
      await completeWelcomeAction({ organisationId, skipped: false })
    ).toMatchObject({ error: { code: "unknown_error" }, ok: false });
    expect(mocks.captureOnboardingEvent).not.toHaveBeenCalled();
  });
});

import { withTenantDb as withTestTenantDb } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feedCount: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  organisationFindFirst: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/availability", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
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
  return {
    feed: { count: mocks.feedCount },
    organisation: { findFirst: mocks.organisationFindFirst },
  };
}

const { loadOnboardingState } = await import("./load-onboarding-state");
const input = {
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

describe("loadOnboardingState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.organisationFindFirst.mockResolvedValue({ country_code: "AU" });
    mocks.feedCount.mockResolvedValue(1);
  });

  it("lists only holidays and the feed when Xero is connected", async () => {
    const state = await withTestTenantDb(tenantTestAccount(input), (db) =>
      loadOnboardingState(input, db)
    );
    expect(state.steps.map((step) => step.id)).toEqual(["holidays", "feed"]);
    expect(state).toMatchObject({
      completedRequiredCount: 2,
      isComplete: true,
      requiredCount: 2,
    });
  });

  it("never lists the profile or people steps the wizard owns", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    const state = await withTestTenantDb(tenantTestAccount(input), (db) =>
      loadOnboardingState(input, db)
    );
    const ids = state.steps.map((step) => step.id as string);
    expect(ids).not.toContain("profile");
    expect(ids).not.toContain("people");
  });

  it("offers connecting Xero to a manual-only organisation", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    const state = await withTestTenantDb(tenantTestAccount(input), (db) =>
      loadOnboardingState(input, db)
    );
    expect(state.steps.find((step) => step.id === "xero")).toMatchObject({
      ctaLabel: "Connect Xero",
      status: "optional",
    });
  });

  it.each([
    [
      "unavailable",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    ["reauthorisation_required", "Xero access needs to be renewed."],
  ] as const)(
    "explains a connection that needs attention (%s)",
    async (xeroState, message) => {
      mocks.getXeroConnectionStateForScope.mockResolvedValue(
        xeroState === "unavailable"
          ? { error: { code: "state_unavailable" }, ok: false }
          : { ok: true, value: { state: xeroState } }
      );
      const state = await withTestTenantDb(tenantTestAccount(input), (db) =>
        loadOnboardingState(input, db)
      );
      expect(state.steps.find((step) => step.id === "xero")).toMatchObject({
        ctaLabel: "Review Xero",
        description: message,
      });
    }
  );

  it("marks the first unfinished step as next", async () => {
    mocks.organisationFindFirst.mockResolvedValue({ country_code: "XX" });
    mocks.feedCount.mockResolvedValue(0);
    const state = await withTestTenantDb(tenantTestAccount(input), (db) =>
      loadOnboardingState(input, db)
    );
    expect(state.steps.map((step) => step.status)).toEqual(["next", "pending"]);
    expect(state.isComplete).toBe(false);
  });

  it("scopes every count to the tenant", async () => {
    await withTestTenantDb(tenantTestAccount(input), (db) =>
      loadOnboardingState(input, db)
    );
    expect(mocks.feedCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        clerk_org_id: "org_1",
        organisation_id: input.organisationId,
      }),
    });
    expect(mocks.organisationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          id: input.organisationId,
        }),
      })
    );
  });
});

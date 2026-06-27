import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBillingOverview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  UNLIMITED: -1,
  getBillingOverview: mocks.getBillingOverview,
}));

const { getBillingSummary, getBillingSummaryForDashboard } = await import(
  "./billing-service"
);

const baseInput = {
  actingRole: "owner" as const,
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

function overview(
  usage: Array<{ current: number; limit: number; limitType: string }>
) {
  return {
    ok: true,
    value: {
      billingInterval: "month",
      cancelAtPeriodEnd: false,
      clerkPlanKey: "premium",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      planName: "Premium",
      seatsPurchased: 10,
      status: "active",
      usage,
    },
  };
}

describe("billing-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBillingOverview.mockResolvedValue(
      overview([
        { current: 42, limit: 50, limitType: "seats" },
        { current: 1, limit: -1, limitType: "feeds" },
        { current: 1, limit: 2, limitType: "payroll_entities" },
      ])
    );
  });

  it("maps the catalogue-backed overview to plan and usage", async () => {
    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: {
        isOverLimit: false,
        plan: {
          key: "premium",
          label: "Premium",
          seatsPurchased: 10,
          status: "active",
        },
      },
    });
    if (result.ok) {
      const seats = result.value.usage.find((u) => u.metricKey === "seats");
      const feeds = result.value.usage.find((u) => u.metricKey === "feeds");
      expect(seats).toMatchObject({
        currentValue: 42,
        label: "People",
        limit: 50,
      });
      // Unlimited dimensions surface as a null limit.
      expect(feeds?.limit).toBeNull();
    }
  });

  it("rejects non-owners", async () => {
    const result = await getBillingSummary({
      ...baseInput,
      actingRole: "admin",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "not_authorised" },
    });
  });

  it("returns subscription_not_found when no overview exists", async () => {
    mocks.getBillingOverview.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "none" },
    });

    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "subscription_not_found" },
    });
  });

  it("flags over-limit metrics", async () => {
    mocks.getBillingOverview.mockResolvedValue(
      overview([{ current: 51, limit: 50, limitType: "seats" }])
    );

    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: { isOverLimit: true },
    });
  });

  it("returns dashboard summary for admins with locked visibility", async () => {
    const result = await getBillingSummaryForDashboard({
      ...baseInput,
      actingRole: "admin",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { hasUpgradeFlow: false, visibleToAdmin: false },
    });
  });

  it("returns dashboard summary for owners with billing visibility", async () => {
    const result = await getBillingSummaryForDashboard(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: { hasUpgradeFlow: true, visibleToAdmin: true },
    });
  });
});

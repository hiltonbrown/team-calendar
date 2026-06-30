import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlanLimits: vi.fn(),
  getSubscriptionForOrg: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: { $queryRaw: mocks.queryRaw },
  getPlanDefinition: (key: string) => ({
    name: `${key.charAt(0).toUpperCase()}${key.slice(1)}`,
  }),
  getPlanLimits: mocks.getPlanLimits,
  getSubscriptionForOrg: mocks.getSubscriptionForOrg,
  limitTypes: ["payroll_entities", "seats", "feeds"],
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

describe("billing-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSubscriptionForOrg.mockResolvedValue({
      clerk_org_id: "org_1",
      current_period_end: new Date("2026-05-01T00:00:00.000Z"),
      plan_key: "premium",
      status: "active",
    });
    mocks.getPlanLimits.mockResolvedValue({
      feeds: -1,
      payroll_entities: 2,
      seats: 50,
    });
    mocks.queryRaw.mockResolvedValue([
      { current_value: 1, metric_key: "payroll_entities" },
      { current_value: 8, metric_key: "seats" },
    ]);
  });

  it("returns plan, usage, and over-limit state", async () => {
    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: {
        hasContactFlow: true,
        hasUpgradeFlow: true,
        isOverLimit: false,
        plan: {
          key: "premium",
          label: "Premium",
          status: "active",
        },
      },
    });
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

  it("defaults to the basic plan when no subscription row exists", async () => {
    mocks.getSubscriptionForOrg.mockResolvedValue(null);
    mocks.getPlanLimits.mockResolvedValue({
      feeds: 2,
      payroll_entities: 1,
      seats: 10,
    });

    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: { plan: { key: "basic", label: "Basic", status: "active" } },
    });
  });

  it("flags over-limit metrics", async () => {
    mocks.getPlanLimits.mockResolvedValue({
      feeds: 2,
      payroll_entities: 1,
      seats: 10,
    });
    mocks.queryRaw.mockResolvedValue([
      { current_value: 5, metric_key: "feeds" },
    ]);

    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: { isOverLimit: true },
    });
  });

  it("treats an unlimited (-1) limit as never over-limit", async () => {
    mocks.queryRaw.mockResolvedValue([
      { current_value: 9999, metric_key: "feeds" },
    ]);

    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({ ok: true, value: { isOverLimit: false } });
  });

  it("returns dashboard summary for admins with locked visibility", async () => {
    const result = await getBillingSummaryForDashboard({
      ...baseInput,
      actingRole: "admin",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        hasUpgradeFlow: false,
        visibleToAdmin: false,
      },
    });
  });

  it("returns dashboard summary for owners with billing visibility", async () => {
    const result = await getBillingSummaryForDashboard(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: {
        hasUpgradeFlow: true,
        visibleToAdmin: true,
      },
    });
  });
});

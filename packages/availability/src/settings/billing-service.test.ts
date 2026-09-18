import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthoritativeUsageCount: vi.fn(),
  getPlanLimits: vi.fn(),
  getSubscriptionForOrg: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  getAuthoritativeUsageCount: mocks.getAuthoritativeUsageCount,
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
    mocks.getAuthoritativeUsageCount.mockImplementation(
      (_clerkOrgId: string, limitType: string) =>
        Promise.resolve({ feeds: 0, payroll_entities: 1, seats: 8 }[limitType])
    );
  });

  it("returns plan, authoritative usage, and over-limit state", async () => {
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
    expect(result.ok && result.value.usage).toEqual([
      {
        currentValue: 1,
        label: "Payroll entities",
        limit: 2,
        metricKey: "payroll_entities",
        unit: "payroll entities",
      },
      {
        currentValue: 8,
        label: "Seats",
        limit: 50,
        metricKey: "seats",
        unit: "seats",
      },
      {
        currentValue: 0,
        label: "Feeds",
        limit: null,
        metricKey: "feeds",
        unit: "feeds",
      },
    ]);
    expect(mocks.getAuthoritativeUsageCount.mock.calls).toEqual([
      ["org_1", "payroll_entities"],
      ["org_1", "seats"],
      ["org_1", "feeds"],
    ]);
  });

  it("allows admins", async () => {
    const result = await getBillingSummary({
      ...baseInput,
      actingRole: "admin",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { hasContactFlow: true, hasUpgradeFlow: true },
    });
  });

  it("rejects roles below admin", async () => {
    const result = await getBillingSummary({
      ...baseInput,
      actingRole: "viewer",
    });

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
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
    mocks.getAuthoritativeUsageCount.mockImplementation(
      (_clerkOrgId: string, limitType: string) =>
        Promise.resolve({ feeds: 5, payroll_entities: 1, seats: 10 }[limitType])
    );

    const result = await getBillingSummary(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: { isOverLimit: true },
    });
  });

  it("treats an unlimited (-1) limit as never over-limit", async () => {
    mocks.getAuthoritativeUsageCount.mockImplementation(
      (_clerkOrgId: string, limitType: string) =>
        Promise.resolve(
          { feeds: 9999, payroll_entities: 1, seats: 8 }[limitType]
        )
    );

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

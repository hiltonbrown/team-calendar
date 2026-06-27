import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSubscriptionForOrg: vi.fn(),
  getPlanLimits: vi.fn(),
  getUsageCounter: vi.fn(),
  has: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@repo/database", () => ({
  UNLIMITED: -1,
  getSubscriptionForOrg: mocks.getSubscriptionForOrg,
  getPlanLimits: mocks.getPlanLimits,
  getUsageCounter: mocks.getUsageCounter,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

const { withinLimit, hasFeature } = await import("./entitlements");

const ORG = "org_test";
const ORGANISATION = "11111111-1111-4111-8111-111111111111";

// Catalogue limits for the plans exercised below. Values mirror PLAN_CATALOGUE;
// the seed is the source of truth, these are the expected numbers.
const BASIC = { feeds: 2, payroll_entities: 1, seats: 10 };
const PREMIUM = { feeds: -1, payroll_entities: 2, seats: 50 };

function onPlan(planKey: string, limits: Record<string, number>) {
  mocks.getSubscriptionForOrg.mockResolvedValue({
    clerk_plan_key: planKey,
    plan_key: planKey,
  });
  mocks.getPlanLimits.mockResolvedValue(limits);
}

describe("withinLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the next unit below the limit", async () => {
    onPlan("basic", BASIC);
    mocks.getUsageCounter.mockResolvedValue(9);

    const result = await withinLimit(ORG, ORGANISATION, "seats");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(true);
      expect(result.value.limit).toBe(10);
    }
  });

  it("blocks the 11th seat on basic (at the limit)", async () => {
    onPlan("basic", BASIC);
    mocks.getUsageCounter.mockResolvedValue(10);

    const result = await withinLimit(ORG, ORGANISATION, "seats");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(false);
      expect(result.value.current).toBe(10);
    }
  });

  it("blocks the 3rd feed on basic", async () => {
    onPlan("basic", BASIC);
    mocks.getUsageCounter.mockResolvedValue(2);

    const result = await withinLimit(ORG, ORGANISATION, "feeds");

    expect(result.ok && result.value.allowed).toBe(false);
  });

  it("allows unlimited feeds on premium (-1)", async () => {
    onPlan("premium", PREMIUM);
    mocks.getUsageCounter.mockResolvedValue(999);

    const result = await withinLimit(ORG, ORGANISATION, "feeds");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(true);
      expect(result.value.limit).toBe(-1);
    }
  });

  it("blocks the 51st seat on premium", async () => {
    onPlan("premium", PREMIUM);
    mocks.getUsageCounter.mockResolvedValue(50);

    const result = await withinLimit(ORG, ORGANISATION, "seats");

    expect(result.ok && result.value.allowed).toBe(false);
  });

  it("fails open when no subscription is configured", async () => {
    mocks.getSubscriptionForOrg.mockResolvedValue(null);
    mocks.getUsageCounter.mockResolvedValue(42);

    const result = await withinLimit(ORG, ORGANISATION, "payroll_entities");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(true);
    }
  });

  it("requires tenant context", async () => {
    const result = await withinLimit("", ORGANISATION, "seats");
    expect(result.ok).toBe(false);
  });
});

describe("hasFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when Clerk reports the feature", async () => {
    mocks.has.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ has: mocks.has });

    await expect(hasFeature("analytics")).resolves.toBe(true);
    expect(mocks.has).toHaveBeenCalledWith({ feature: "analytics" });
  });

  it("returns false when Clerk does not", async () => {
    mocks.has.mockReturnValue(false);
    mocks.auth.mockResolvedValue({ has: mocks.has });

    await expect(hasFeature("priority_support")).resolves.toBe(false);
  });
});

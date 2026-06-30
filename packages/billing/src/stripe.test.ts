import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  PLAN_CATALOGUE: [
    { plan_key: "basic", priceId: "price_basic" },
    { plan_key: "premium", priceId: "price_premium" },
    { plan_key: "enterprise", priceId: null },
  ],
  getSubscriptionForOrg: vi.fn(),
}));

const { STRIPE_API_VERSION, getStripe, resolvePlanKey } = await import(
  "./stripe"
);

describe("STRIPE_API_VERSION", () => {
  it("pins the tested account API version", () => {
    expect(STRIPE_API_VERSION).toBe("2025-11-17.clover");
  });
});

describe("resolvePlanKey", () => {
  it("maps a known price id to its plan key", () => {
    expect(resolvePlanKey("price_premium")).toEqual({
      ok: true,
      value: "premium",
    });
  });

  it("returns a bad_request error for an unknown price id", () => {
    const result = resolvePlanKey("price_unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad_request");
    }
  });
});

describe("getStripe", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalKey;
    }
  });

  it("returns an internal error when the secret key is not configured", () => {
    const result = getStripe();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("internal");
    }
  });
});

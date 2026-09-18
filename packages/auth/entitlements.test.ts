import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasFeature, withinLimit } from "./entitlements";

const mocks = vi.hoisted(() => ({
  getAuthoritativeUsageCount: vi.fn(),
  getPlanFeatures: vi.fn(),
  getPlanLimits: vi.fn(),
  getSubscriptionForOrg: vi.fn(),
  hasUnresolvedStripeEventForOrg: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  getAuthoritativeUsageCount: mocks.getAuthoritativeUsageCount,
  getPlanFeatures: mocks.getPlanFeatures,
  getPlanLimits: mocks.getPlanLimits,
  getSubscriptionForOrg: mocks.getSubscriptionForOrg,
  hasUnresolvedStripeEventForOrg: mocks.hasUnresolvedStripeEventForOrg,
}));

describe("entitlements", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    mocks.hasUnresolvedStripeEventForOrg.mockResolvedValue(false);
  });

  describe("withinLimit", () => {
    it("allows usage when current usage is strictly less than limit", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(5);

      const result = await withinLimit("org_123", "org_entity_123", "seats");

      expect(result).toEqual({
        ok: true,
        value: { allowed: true, current: 5, limit: 10 },
      });
    });

    it("denies usage when current usage equals limit", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(10);

      const result = await withinLimit("org_123", "org_entity_123", "seats");

      expect(result).toEqual({
        ok: true,
        value: { allowed: false, current: 10, limit: 10 },
      });
    });

    it("denies usage when current usage exceeds limit", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(11);

      const result = await withinLimit("org_123", "org_entity_123", "seats");

      expect(result).toEqual({
        ok: true,
        value: { allowed: false, current: 11, limit: 10 },
      });
    });

    it("allows usage when limit is -1 (unlimited)", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "enterprise",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: -1 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(999_999);

      const result = await withinLimit("org_123", "org_entity_123", "seats");

      expect(result).toEqual({
        ok: true,
        value: { allowed: true, current: 999_999, limit: -1 },
      });
    });

    it("uses authoritative usage when the reporting counter is absent", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(7);

      const result = await withinLimit("org_123", "org_entity_123", "seats");

      expect(result).toEqual({
        ok: true,
        value: { allowed: true, current: 7, limit: 10 },
      });
    });

    it("reads usage through the supplied transaction client", async () => {
      const usageClient = { person: { count: vi.fn() } };
      mocks.getSubscriptionForOrg.mockResolvedValue(null);
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(4);

      const result = await withinLimit(
        "org_123",
        "org_entity_123",
        "seats",
        // The mock only needs an identity because the database helper is mocked.
        usageClient as never
      );

      expect(result).toMatchObject({
        ok: true,
        value: { allowed: true, current: 4, limit: 10 },
      });
      expect(mocks.getAuthoritativeUsageCount).toHaveBeenCalledWith(
        "org_123",
        "seats",
        usageClient
      );
    });

    it("returns error result when getPlanLimits throws", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanLimits.mockImplementation(() => {
        throw new Error("Database error");
      });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      const result = await withinLimit("org_123", "org_entity_123", "seats");

      expect(result).toEqual({
        error: {
          code: "internal",
          message: "Failed to check billing limits.",
        },
        ok: false,
      });
    });
  });

  describe("activePlanKey resolution", () => {
    it("resolves to premium for active subscription with premium plan key", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("premium");
    });

    it("falls back to basic in paid mode while a newer billing event is unresolved", async () => {
      vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "paid");
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
        stripe_event_created_at: new Date("2026-09-18T00:00:00Z"),
      });
      mocks.hasUnresolvedStripeEventForOrg.mockResolvedValue(true);
      mocks.getPlanLimits.mockReturnValue({ seats: 5 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("basic");
      expect(mocks.hasUnresolvedStripeEventForOrg).toHaveBeenCalledWith(
        "org_123",
        new Date("2026-09-18T00:00:00Z")
      );
    });

    it("keeps early-access entitlement behaviour during billing repair", async () => {
      vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "early_access");
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
        stripe_event_created_at: new Date("2026-09-18T00:00:00Z"),
      });
      mocks.hasUnresolvedStripeEventForOrg.mockResolvedValue(true);
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("premium");
      expect(mocks.hasUnresolvedStripeEventForOrg).not.toHaveBeenCalled();
    });

    it("resolves to premium for trialing subscription with premium plan key", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "trialing",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 10 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("premium");
    });

    it("falls back to basic for canceled subscription", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "canceled",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 5 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("basic");
    });

    it("falls back to basic for unrecognised plan key", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "enterprise_legacy",
        status: "active",
      });
      mocks.getPlanLimits.mockReturnValue({ seats: 5 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("basic");
    });

    it("falls back to basic when organisation has no subscription", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue(null);
      mocks.getPlanLimits.mockReturnValue({ seats: 5 });
      mocks.getAuthoritativeUsageCount.mockResolvedValue(0);

      await withinLimit("org_123", "org_entity_123", "seats");

      expect(mocks.getPlanLimits).toHaveBeenCalledWith("basic");
    });
  });

  describe("hasFeature", () => {
    it("returns feature flag value for resolved plan", async () => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        plan_key: "premium",
        status: "active",
      });
      mocks.getPlanFeatures.mockReturnValue({
        analytics: true,
        priority_support: false,
      });

      const result = await hasFeature("org_123", "analytics");

      expect(mocks.getPlanFeatures).toHaveBeenCalledWith("premium");
      expect(result).toEqual({ ok: true, value: true });
    });

    it("returns error result when dependency throws", async () => {
      mocks.getSubscriptionForOrg.mockRejectedValue(
        new Error("Connection error")
      );

      const result = await hasFeature("org_123", "analytics");

      expect(result).toEqual({
        error: {
          code: "internal",
          message: "Failed to check billing features.",
        },
        ok: false,
      });
    });
  });
});

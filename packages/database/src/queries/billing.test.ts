import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthoritativeUsageType } from "./billing";

const mocks = vi.hoisted(() => ({
  feedCount: vi.fn(),
  organisationCount: vi.fn(),
  personCount: vi.fn(),
  queryRaw: vi.fn(),
  xeroConnectionCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  database: {
    $queryRaw: mocks.queryRaw,
    feed: { count: mocks.feedCount },
    organisation: { count: mocks.organisationCount },
    person: { count: mocks.personCount },
    xeroConnection: { count: mocks.xeroConnectionCount },
  },
}));

const {
  getAuthoritativeUsageCount,
  getFailedStripeEventsForOperators,
  getUnresolvedStripeEventsForOrg,
  hasUnresolvedStripeEventForOrg,
  isStripeEventProcessed,
  lockPlanLimitMutations,
  recordStripeEventFailure,
} = await import("./billing");

const usageCases = [
  ["seats", "personCount", 8],
  ["feeds", "feedCount", 2],
  ["payroll_entities", "organisationCount", 1],
  ["organisations", "organisationCount", 1],
  ["connections", "xeroConnectionCount", 1],
] satisfies ReadonlyArray<
  readonly [AuthoritativeUsageType, keyof typeof mocks, number]
>;

describe("authoritative billing usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(usageCases)(
    "counts %s from authoritative rows",
    async (usageType, mock, count) => {
      mocks[mock].mockResolvedValue(count);

      await expect(
        getAuthoritativeUsageCount("org_123", usageType)
      ).resolves.toBe(count);
    }
  );

  it("counts only active, unarchived people", async () => {
    mocks.personCount.mockResolvedValue(3);

    await getAuthoritativeUsageCount("org_123", "seats");

    expect(mocks.personCount).toHaveBeenCalledWith({
      where: {
        archived_at: null,
        clerk_org_id: "org_123",
        is_active: true,
      },
    });
  });

  it("counts only active, unarchived feeds", async () => {
    mocks.feedCount.mockResolvedValue(2);

    await getAuthoritativeUsageCount("org_123", "feeds");

    expect(mocks.feedCount).toHaveBeenCalledWith({
      where: {
        archived_at: null,
        clerk_org_id: "org_123",
        status: "active",
      },
    });
  });

  it("counts only active, unarchived organisations", async () => {
    mocks.organisationCount.mockResolvedValue(1);

    await getAuthoritativeUsageCount("org_123", "payroll_entities");

    expect(mocks.organisationCount).toHaveBeenCalledWith({
      where: {
        archived_at: null,
        clerk_org_id: "org_123",
        is_active: true,
      },
    });
  });

  it("counts only active Xero connections", async () => {
    mocks.xeroConnectionCount.mockResolvedValue(1);

    await getAuthoritativeUsageCount("org_123", "connections");

    expect(mocks.xeroConnectionCount).toHaveBeenCalledWith({
      where: {
        clerk_org_id: "org_123",
        disconnected_at: null,
        revoked_at: null,
        status: "active",
      },
    });
  });

  it("takes a transaction-scoped advisory lock using the Clerk Organisation", async () => {
    mocks.queryRaw.mockResolvedValue([{ acquired: "" }]);

    await lockPlanLimitMutations(
      // The raw-query mock is the complete surface used by the lock helper.
      { $queryRaw: mocks.queryRaw } as never,
      "org_123"
    );

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("Stripe event receipt health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only treats completed or ignored receipts as processed", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ stripe_event_id: "evt_processed" }]);

    await expect(isStripeEventProcessed("evt_failed")).resolves.toBe(false);
    await expect(isStripeEventProcessed("evt_processed")).resolves.toBe(true);
  });

  it("reports a newer unresolved event for a known organisation", async () => {
    mocks.queryRaw.mockResolvedValue([{ exists: true }]);

    await expect(
      hasUnresolvedStripeEventForOrg(
        "org_123",
        new Date("2026-09-18T00:00:00Z")
      )
    ).resolves.toBe(true);
  });

  it("returns safe operator receipt summaries", async () => {
    const attemptedAt = new Date("2026-09-19T00:00:00.000Z");
    mocks.queryRaw.mockResolvedValue([
      {
        error_category: "provider_fetch",
        last_attempted_at: attemptedAt,
        stripe_event_id: "evt_operator",
      },
    ]);

    await expect(getUnresolvedStripeEventsForOrg("org_123")).resolves.toEqual([
      {
        errorCategory: "provider_fetch",
        eventId: "evt_operator",
        lastAttemptedAt: attemptedAt,
      },
    ]);
  });

  it.each([
    [1, true],
    [2, true],
    [3, false],
    [4, true],
  ])(
    "throttles operator alerts at attempt %i",
    async (attemptCount, expected) => {
      mocks.queryRaw.mockResolvedValue([{ attempt_count: attemptCount }]);
      await expect(
        recordStripeEventFailure({
          clerkOrgId: "org_123",
          errorCategory: "provider_fetch",
          eventCreatedAt: new Date("2026-09-19T00:00:00.000Z"),
          eventId: "evt_operator",
          stripeCustomerId: "cus_123",
          type: "invoice.paid",
        })
      ).resolves.toBe(expected);
    }
  );

  it("includes unmatched failed events in the operator view", async () => {
    const attemptedAt = new Date("2026-09-19T00:00:00.000Z");
    mocks.queryRaw.mockResolvedValue([
      {
        clerk_org_id: null,
        error_category: "invalid_payload",
        last_attempted_at: attemptedAt,
        stripe_event_id: "evt_unmatched",
      },
    ]);

    await expect(getFailedStripeEventsForOperators()).resolves.toEqual([
      {
        clerkOrgId: null,
        errorCategory: "invalid_payload",
        eventId: "evt_unmatched",
        lastAttemptedAt: attemptedAt,
      },
    ]);
  });
});

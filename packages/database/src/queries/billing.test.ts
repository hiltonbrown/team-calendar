import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantDb as withTestTenantDb } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";
import type { AuthoritativeUsageType } from "./billing";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  feedCount: vi.fn(),
  organisationCount: vi.fn(),
  personCount: vi.fn(),
  queryRaw: vi.fn(),
  scopeTransaction: vi.fn(),
  xeroConnectionCount: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $queryRaw: mocks.queryRaw,
    $transaction: async (callback: (db: unknown) => Promise<unknown>) => {
      mocks.scopeTransaction();
      return await callback({
        $executeRaw: mocks.executeRaw,
        $queryRaw: async (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) =>
          strings[0]?.includes("set_config")
            ? []
            : mocks.queryRaw(strings, ...values),
        feed: { count: mocks.feedCount },
        organisation: { count: mocks.organisationCount },
        person: { count: mocks.personCount },
        xeroConnection: { count: mocks.xeroConnectionCount },
      });
    },
  },
}));
vi.mock("../system-client", () => ({
  systemDatabase: { $executeRaw: mocks.executeRaw, $queryRaw: mocks.queryRaw },
}));
const {
  getAuthoritativeUsageCount,
  getSubscriptionForAccount,
  getFirstActiveOrganisationIdForAccount,
  getUsageCounter,
  getFailedStripeEventsForOperators,
  getUnresolvedStripeEventsForAccount,
  hasUnresolvedStripeEventForAccount,
  isStripeEventProcessed,
  lockPlanLimitMutations,
  recordStripeEventFailure,
  upsertSubscriptionFromWebhook,
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
        withTestTenantDb(tenantTestAccount("org_123"), (db) =>
          getAuthoritativeUsageCount("org_123", usageType, db)
        )
      ).resolves.toBe(count);
    }
  );
  it("counts only active, unarchived people", async () => {
    mocks.personCount.mockResolvedValue(3);
    await withTestTenantDb(tenantTestAccount("org_123"), (db) =>
      getAuthoritativeUsageCount("org_123", "seats", db)
    );
    expect(mocks.personCount).toHaveBeenCalledWith({
      where: {
        account_id: "org_123",
        archived_at: null,
        is_active: true,
      },
    });
  });
  it("counts only active, unarchived feeds", async () => {
    mocks.feedCount.mockResolvedValue(2);
    await withTestTenantDb(tenantTestAccount("org_123"), (db) =>
      getAuthoritativeUsageCount("org_123", "feeds", db)
    );
    expect(mocks.feedCount).toHaveBeenCalledWith({
      where: {
        account_id: "org_123",
        archived_at: null,
        status: "active",
      },
    });
  });
  it("counts only active, unarchived organisations", async () => {
    mocks.organisationCount.mockResolvedValue(1);
    await withTestTenantDb(tenantTestAccount("org_123"), (db) =>
      getAuthoritativeUsageCount("org_123", "payroll_entities", db)
    );
    expect(mocks.organisationCount).toHaveBeenCalledWith({
      where: {
        account_id: "org_123",
        archived_at: null,
        is_active: true,
      },
    });
  });
  it("counts only active Xero connections", async () => {
    mocks.xeroConnectionCount.mockResolvedValue(1);
    await withTestTenantDb(tenantTestAccount("org_123"), (db) =>
      getAuthoritativeUsageCount("org_123", "connections", db)
    );
    expect(mocks.xeroConnectionCount).toHaveBeenCalledWith({
      where: {
        account_id: "org_123",
        disconnected_at: null,
        status: "active",
      },
    });
  });
  it("takes a transaction-scoped advisory lock using the Account", async () => {
    mocks.queryRaw.mockResolvedValue([{ acquired: "" }]);
    await withTenantDb("org_123", (db) =>
      lockPlanLimitMutations("org_123", db)
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
      hasUnresolvedStripeEventForAccount(
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
    await expect(
      getUnresolvedStripeEventsForAccount("org_123")
    ).resolves.toEqual([
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
          accountId: "org_123",
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
        account_id: null,
        error_category: "invalid_payload",
        last_attempted_at: attemptedAt,
        stripe_event_id: "evt_unmatched",
      },
    ]);
    await expect(getFailedStripeEventsForOperators()).resolves.toEqual([
      {
        accountId: null,
        errorCategory: "invalid_payload",
        eventId: "evt_unmatched",
        lastAttemptedAt: attemptedAt,
      },
    ]);
  });
});
describe("subscription mirror ordering", () => {
  it("passes an explicit authoritative tie fence into the atomic upsert", async () => {
    mocks.executeRaw.mockResolvedValue(1);
    await withTestTenantDb(
      tenantTestAccount({
        accountId: "org_123",
        authoritativeTie: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: null,
        endedAt: new Date("2026-09-19T00:00:00.000Z"),
        planKey: "basic",
        status: "canceled",
        stripeCustomerId: "cus_123",
        stripeEventCreatedAt: new Date("2026-09-19T00:00:00.000Z"),
        stripeSubscriptionId: "sub_123",
      }),
      (db) =>
        upsertSubscriptionFromWebhook(
          {
            accountId: "org_123",
            authoritativeTie: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: null,
            endedAt: new Date("2026-09-19T00:00:00.000Z"),
            planKey: "basic",
            status: "canceled",
            stripeCustomerId: "cus_123",
            stripeEventCreatedAt: new Date("2026-09-19T00:00:00.000Z"),
            stripeSubscriptionId: "sub_123",
          },
          db
        )
    );
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.executeRaw.mock.calls[0]).toContain(true);
  });
});

const { withTenantDb, TenantMismatchError } = await import("../tenant-db");
const scopeCases: {
  name: string;
  run: (db: import("../tenant-db").TenantDb) => Promise<unknown>;
}[] = [
  {
    name: "subscription",
    run: (db) => getSubscriptionForAccount("account-A", db),
  },
  {
    name: "active organisation",
    run: (db) => getFirstActiveOrganisationIdForAccount("account-A", db),
  },
  {
    name: "usage counter",
    run: (db) => getUsageCounter("account-A", "seats", db),
  },
  {
    name: "authoritative count",
    run: (db) => getAuthoritativeUsageCount("account-A", "seats", db),
  },
  {
    name: "subscription mirror",
    run: (db) =>
      upsertSubscriptionFromWebhook(
        {
          accountId: "account-A",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          endedAt: null,
          planKey: "basic",
          status: "active",
          stripeCustomerId: "customer-1",
          stripeEventCreatedAt: new Date("2026-10-01"),
          stripeSubscriptionId: "subscription-1",
        },
        db
      ),
  },
];

describe("billing tenant scope expansion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.personCount.mockResolvedValue(0);
  });
  it.each(scopeCases)("$name reuses an entry-point scope", async ({ run }) => {
    const independent = await withTenantDb("account-A", (db) => run(db));
    expect(mocks.scopeTransaction).toHaveBeenCalledTimes(1);
    mocks.scopeTransaction.mockClear();
    const shared = await withTenantDb("account-A", async (db) => {
      const value = await run(db);
      expect(mocks.scopeTransaction).toHaveBeenCalledTimes(1);
      return value;
    });
    expect(shared).toEqual(independent);
  });
  it.each(scopeCases)(
    "$name rejects a client for another account",
    async ({ run }) => {
      await withTenantDb("account-B", async (db) => {
        await expect(
          Promise.resolve().then(() => run(db))
        ).rejects.toBeInstanceOf(TenantMismatchError);
      });
    }
  );
});

it("plan mutation locks validate and reuse their caller transaction", async () => {
  mocks.scopeTransaction.mockClear();
  await withTenantDb("account-A", async (db) => {
    await lockPlanLimitMutations("account-A", db);
    expect(mocks.scopeTransaction).toHaveBeenCalledTimes(1);
    await expect(
      lockPlanLimitMutations("account-B", db)
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });
});

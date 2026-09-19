// biome-ignore-all lint/style/useFilenamingConvention: Integration test co-located beside other database integration suites.
import type { PlanKey } from "@repo/core";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/billing.integration.test.ts"
);

const { database } = await import("./index.js");
const {
  getSubscriptionForOrg,
  getSubscriptionForStripeCustomer,
  isStripeEventProcessed,
  recordStripeEvent,
  recordStripeEventFailure,
  upsertSubscriptionFromWebhook,
} = await import("./src/queries/billing.js");
const testClerkOrgIdA = fixture.tenants[0]?.clerkOrgId as string;
const testClerkOrgIdB = fixture.tenants[1]?.clerkOrgId as string;
const testClerkOrgIds = [testClerkOrgIdA, testClerkOrgIdB] as const;

const testEventIds = [
  fixture.globalKey("stripe_event", 0),
  fixture.globalKey("stripe_event", 1),
  fixture.globalKey("stripe_event", 2),
  fixture.globalKey("stripe_event", 3),
  fixture.globalKey("stripe_event", 4),
] as const;
// These manifest-owned keys intentionally avoid the production catalogue while
// exercising the same database path, whose public API is typed to catalogue keys.
const fixturePlanKey = (index: number) =>
  fixture.globalKey("plan_key", index) as PlanKey;
const planKeys = {
  basic: fixturePlanKey(0),
  enterprise: fixturePlanKey(2),
  premium: fixturePlanKey(1),
} as const;

const cleanTestData = async () => {
  await database.clerkOrgSubscription.deleteMany({
    where: { clerk_org_id: { in: [...testClerkOrgIds] } },
  });
  await database.stripeEvent.deleteMany({
    where: { stripe_event_id: { in: [...testEventIds] } },
  });
  await database.planLimit.deleteMany({
    where: {
      plan_id: {
        in: [0, 1, 2].map((index) => fixture.globalKey("plan_id", index)),
      },
    },
  });
  await database.plan.deleteMany({
    where: { plan_key: { in: Object.values(planKeys) } },
  });
};

beforeEach(async () => {
  await cleanTestData();
  await database.plan.createMany({
    data: Object.entries(planKeys).map(([name, planKey], index) => ({
      id: fixture.globalKey("plan_id", index),
      key: planKey,
      name: `Release fixture ${name}`,
      plan_key: planKey,
    })),
  });
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("billing queries integration", () => {
  test("replaying an older stripe_event_created_at does not overwrite the existing subscription row", async () => {
    const originalEventTime = new Date("2026-08-20T12:00:00.000Z");
    const olderEventTime = new Date("2026-08-19T12:00:00.000Z");

    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdA,
      currentPeriodEnd: new Date("2026-09-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.premium,
      status: "active",
      stripeCustomerId: "cus_066_1",
      stripeEventCreatedAt: originalEventTime,
      stripeSubscriptionId: "sub_066_1",
    });

    const initial = await getSubscriptionForOrg(testClerkOrgIdA);
    expect(initial).toMatchObject({
      cancel_at_period_end: false,
      clerk_org_id: testClerkOrgIdA,
      plan_key: planKeys.premium,
      status: "active",
      stripe_customer_id: "cus_066_1",
      stripe_subscription_id: "sub_066_1",
    });

    const directRows = await database.$queryRaw<
      Array<{ plan_key: string; stripe_subscription_id: string }>
    >`
      SELECT plan_key, stripe_subscription_id
      FROM clerk_org_subscriptions
      WHERE clerk_org_id = ${testClerkOrgIdA}
    `;
    expect(directRows[0]?.plan_key).toBe(planKeys.premium);
    expect(directRows[0]?.stripe_subscription_id).toBe("sub_066_1");

    // Replay an older event (e.g. out-of-order webhook that would downgrade to basic)
    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: true,
      clerkOrgId: testClerkOrgIdA,
      currentPeriodEnd: new Date("2026-09-19T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.basic,
      status: "past_due",
      stripeCustomerId: "cus_066_older",
      stripeEventCreatedAt: olderEventTime,
      stripeSubscriptionId: "sub_066_older",
    });

    const afterReplay = await getSubscriptionForOrg(testClerkOrgIdA);
    expect(afterReplay).toMatchObject({
      cancel_at_period_end: false,
      clerk_org_id: testClerkOrgIdA,
      plan_key: planKeys.premium,
      status: "active",
      stripe_customer_id: "cus_066_1",
      stripe_subscription_id: "sub_066_1",
    });
  });

  test("a newer event wins over the existing subscription row", async () => {
    const originalEventTime = new Date("2026-08-20T12:00:00.000Z");
    const newerEventTime = new Date("2026-08-21T12:00:00.000Z");

    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdA,
      currentPeriodEnd: new Date("2026-09-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.basic,
      status: "active",
      stripeCustomerId: "cus_066_1",
      stripeEventCreatedAt: originalEventTime,
      stripeSubscriptionId: "sub_066_1",
    });

    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdA,
      currentPeriodEnd: new Date("2026-10-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.enterprise,
      status: "active",
      stripeCustomerId: "cus_066_1",
      stripeEventCreatedAt: newerEventTime,
      stripeSubscriptionId: "sub_066_enterprise",
    });

    const updated = await getSubscriptionForOrg(testClerkOrgIdA);
    expect(updated).toMatchObject({
      clerk_org_id: testClerkOrgIdA,
      plan_key: planKeys.enterprise,
      status: "active",
      stripe_subscription_id: "sub_066_enterprise",
    });
  });

  test("null stripe_event_created_at on either side updates correctly (IS NULL fallback branches)", async () => {
    // 1. Initial row with null stripe_event_created_at
    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdB,
      currentPeriodEnd: new Date("2026-09-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.basic,
      status: "active",
      stripeCustomerId: "cus_066_null_1",
      stripeEventCreatedAt: null,
      stripeSubscriptionId: "sub_066_null_1",
    });

    const initial = await getSubscriptionForOrg(testClerkOrgIdB);
    expect(initial).toMatchObject({
      plan_key: planKeys.basic,
      stripe_subscription_id: "sub_066_null_1",
    });

    // 2. Incoming event with non-null timestamp updates row where existing timestamp IS NULL
    const datedEventTime = new Date("2026-08-20T12:00:00.000Z");
    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdB,
      currentPeriodEnd: new Date("2026-09-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.premium,
      status: "active",
      stripeCustomerId: "cus_066_null_1",
      stripeEventCreatedAt: datedEventTime,
      stripeSubscriptionId: "sub_066_dated",
    });

    const afterDated = await getSubscriptionForOrg(testClerkOrgIdB);
    expect(afterDated).toMatchObject({
      plan_key: planKeys.premium,
      stripe_subscription_id: "sub_066_dated",
    });

    // 3. Incoming event with null timestamp updates row where incoming timestamp IS NULL
    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: true,
      clerkOrgId: testClerkOrgIdB,
      currentPeriodEnd: new Date("2026-10-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.enterprise,
      status: "active",
      stripeCustomerId: "cus_066_null_1",
      stripeEventCreatedAt: null,
      stripeSubscriptionId: "sub_066_null_fallback",
    });

    const afterNullFallback = await getSubscriptionForOrg(testClerkOrgIdB);
    expect(afterNullFallback).toMatchObject({
      cancel_at_period_end: true,
      plan_key: planKeys.enterprise,
      stripe_subscription_id: "sub_066_null_fallback",
    });
  });

  test("recordStripeEvent called twice with the same id produces exactly one row (dedupe key)", async () => {
    const eventId = "evt_test_066_billing_dup";

    await recordStripeEvent(eventId, "customer.subscription.updated");
    await recordStripeEvent(eventId, "customer.subscription.updated");

    const rows = await database.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    expect(Number(rows[0]?.count)).toBe(1);
  });

  test("isStripeEventProcessed flips from false to true after recording", async () => {
    const eventId = "evt_test_066_billing_flip";

    expect(await isStripeEventProcessed(eventId)).toBe(false);

    await recordStripeEvent(eventId, "invoice.paid");

    expect(await isStripeEventProcessed(eventId)).toBe(true);
  });

  test("getSubscriptionForStripeCustomer returns null when customer is unbound", async () => {
    const nonExistent =
      await getSubscriptionForStripeCustomer("cus_non_existent");
    expect(nonExistent).toBeNull();
  });

  test("getSubscriptionForStripeCustomer resolves subscription by stripe customer id across organisations", async () => {
    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdA,
      currentPeriodEnd: new Date("2026-09-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.basic,
      status: "active",
      stripeCustomerId: "cus_test_org_a",
      stripeEventCreatedAt: new Date("2026-08-20T12:00:00.000Z"),
      stripeSubscriptionId: "sub_test_org_a",
    });

    await upsertSubscriptionFromWebhook({
      cancelAtPeriodEnd: false,
      clerkOrgId: testClerkOrgIdB,
      currentPeriodEnd: new Date("2026-09-20T12:00:00.000Z"),
      endedAt: null,
      planKey: planKeys.premium,
      status: "active",
      stripeCustomerId: "cus_test_org_b",
      stripeEventCreatedAt: new Date("2026-08-20T12:00:00.000Z"),
      stripeSubscriptionId: "sub_test_org_b",
    });

    const subA = await getSubscriptionForStripeCustomer("cus_test_org_a");
    expect(subA).toMatchObject({
      clerk_org_id: testClerkOrgIdA,
      plan_key: planKeys.basic,
      stripe_customer_id: "cus_test_org_a",
      stripe_subscription_id: "sub_test_org_a",
    });

    const subB = await getSubscriptionForStripeCustomer("cus_test_org_b");
    expect(subB).toMatchObject({
      clerk_org_id: testClerkOrgIdB,
      plan_key: planKeys.premium,
      stripe_customer_id: "cus_test_org_b",
      stripe_subscription_id: "sub_test_org_b",
    });
  });

  test("a failed receipt remains retryable and is repaired in place", async () => {
    const eventId = "evt_test_066_billing_repair";
    const context = {
      clerkOrgId: testClerkOrgIdA,
      eventCreatedAt: new Date("2026-09-19T00:00:00.000Z"),
      stripeCustomerId: "cus_repair",
    };

    await recordStripeEventFailure({
      ...context,
      errorCategory: "provider_fetch",
      eventId,
      type: "invoice.paid",
    });
    expect(await isStripeEventProcessed(eventId)).toBe(false);

    await recordStripeEvent(eventId, "invoice.paid", context);
    expect(await isStripeEventProcessed(eventId)).toBe(true);

    const receipt = await database.stripeEvent.findUniqueOrThrow({
      where: { stripe_event_id: eventId },
    });
    expect(receipt).toMatchObject({
      attempt_count: 2,
      clerk_org_id: testClerkOrgIdA,
      delivery_state: "processed",
      error_category: null,
      stripe_customer_id: "cus_repair",
    });
    expect(receipt.processed_at).toBeInstanceOf(Date);
  });

  test("a late failing duplicate cannot downgrade a completed receipt", async () => {
    const eventId = "evt_test_066_billing_dup";
    const context = {
      clerkOrgId: testClerkOrgIdA,
      eventCreatedAt: new Date("2026-09-19T00:00:00.000Z"),
      stripeCustomerId: "cus_duplicate",
    };
    await recordStripeEvent(eventId, "customer.subscription.updated", context);
    await recordStripeEventFailure({
      ...context,
      errorCategory: "processing_exception",
      eventId,
      type: "customer.subscription.updated",
    });

    const receipt = await database.stripeEvent.findUniqueOrThrow({
      where: { stripe_event_id: eventId },
    });
    expect(receipt.delivery_state).toBe("processed");
    expect(receipt.error_category).toBeNull();
    expect(await isStripeEventProcessed(eventId)).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getFirstActiveOrganisationIdForClerkOrg: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve()),
  isStripeEventProcessed: vi.fn(),
  recordStripeEvent: vi.fn(() => Promise.resolve()),
  resolvePlanKey: vi.fn(),
  upsertSubscriptionFromWebhook: vi.fn(() => Promise.resolve()),
}));

vi.mock("@repo/billing", () => ({
  constructEvent: mocks.constructEvent,
  resolvePlanKey: mocks.resolvePlanKey,
}));
vi.mock("@repo/database", () => ({
  getFirstActiveOrganisationIdForClerkOrg:
    mocks.getFirstActiveOrganisationIdForClerkOrg,
  isStripeEventProcessed: mocks.isStripeEventProcessed,
  recordStripeEvent: mocks.recordStripeEvent,
  upsertSubscriptionFromWebhook: mocks.upsertSubscriptionFromWebhook,
}));
vi.mock("@repo/jobs", () => ({
  inngest: { send: mocks.inngestSend },
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/env", () => ({
  env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));

const { POST } = await import("./route");

function webhookRequest() {
  return new Request("http://localhost/webhooks/payments", {
    body: "{}",
    headers: { "stripe-signature": "sig" },
    method: "POST",
  });
}

function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
    created: 1_700_000_100,
    data: {
      object: {
        cancel_at_period_end: false,
        current_period_end: 1_700_000_000,
        customer: "cus_1",
        id: "sub_1",
        items: { data: [{ price: { id: "price_basic" } }] },
        metadata: { clerk_org_id: "org_1" },
        status: "active",
        ...overrides,
      },
    },
  };
}

describe("Stripe payments webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirstActiveOrganisationIdForClerkOrg.mockResolvedValue(
      "30000000-0000-4000-8000-000000000001"
    );
    mocks.isStripeEventProcessed.mockResolvedValue(false);
    mocks.resolvePlanKey.mockReturnValue({ ok: true, value: "basic" });
  });

  it("returns 400 when the signature cannot be verified", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: false,
      error: {
        code: "bad_request",
        message: "Invalid Stripe webhook signature.",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(400);
    expect(mocks.isStripeEventProcessed).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
  });

  it("skips events that have already been processed", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.isStripeEventProcessed.mockResolvedValue(true);

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
  });

  it("mirrors subscription events and records the event after processing", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        planKey: "basic",
        status: "active",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      })
    );
    expect(mocks.inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "recount-usage",
        data: expect.objectContaining({
          organisationId: "30000000-0000-4000-8000-000000000001",
        }),
      })
    );
    expect(mocks.recordStripeEvent).toHaveBeenCalledWith(
      "evt_1",
      "customer.subscription.updated"
    );

    // The event must only be recorded once the mirror write has completed, so
    // a failure mid-processing leaves the event un-recorded for Stripe to retry.
    const mirrorOrder =
      mocks.upsertSubscriptionFromWebhook.mock.invocationCallOrder[0];
    const recordOrder = mocks.recordStripeEvent.mock.invocationCallOrder[0];
    expect(recordOrder).toBeGreaterThan(mirrorOrder);
  });

  it("does not mirror when the price maps to no known plan", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.resolvePlanKey.mockReturnValue({
      ok: false,
      error: { code: "bad_request", message: "Unknown Stripe price." },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("ignores subscription events missing clerk_org_id metadata", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({ metadata: null }),
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("passes event.created as stripeEventCreatedAt into the subscription mirror", async () => {
    const eventCreatedSeconds = 1_700_000_100;
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });

    await POST(webhookRequest());

    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventCreatedAt: new Date(eventCreatedSeconds * 1000),
      })
    );
  });

  it("passes a later event.created for a newer event (newer-wins path)", async () => {
    const newerCreatedSeconds = 1_700_001_000;
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: { ...subscriptionEvent(), created: newerCreatedSeconds },
    });

    await POST(webhookRequest());

    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventCreatedAt: new Date(newerCreatedSeconds * 1000),
        status: "active",
        planKey: "basic",
      })
    );
  });

  it("passes an earlier event.created for an older event (stale-event path)", async () => {
    // The route always threads the timestamp through; the DB guard decides whether
    // to apply the write. This test confirms the older timestamp reaches the upsert
    // so the guard can compare it.
    const olderCreatedSeconds = 1_699_999_000;
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: { ...subscriptionEvent(), created: olderCreatedSeconds },
    });

    await POST(webhookRequest());

    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventCreatedAt: new Date(olderCreatedSeconds * 1000),
      })
    );
  });
});

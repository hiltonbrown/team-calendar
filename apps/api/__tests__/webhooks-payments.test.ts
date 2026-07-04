import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getFirstActiveOrganisationIdForClerkOrg: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve()),
  isStripeEventProcessed: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
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
  log: { error: mocks.logError, info: mocks.logInfo, warn: mocks.logWarn },
}));
vi.mock("@/env", () => ({
  env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));

const { POST } = await import("../app/webhooks/payments/route");

function webhookRequest() {
  return new Request("http://localhost/webhooks/payments", {
    body: "raw",
    headers: { "stripe-signature": "sig" },
    method: "POST",
  });
}

function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
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

  it("1. returns 400 and records nothing when the signature cannot be verified", async () => {
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

  it("2. returns 200 without reprocessing a duplicate event", async () => {
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

  it("3. mirrors a subscription.updated event, sends recount-usage with organisationId, and records the event", async () => {
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

    expect(mocks.inngestSend).toHaveBeenCalledOnce();
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      data: {
        clerkOrgId: "org_1",
        organisationId: "30000000-0000-4000-8000-000000000001",
      },
      name: "recount-usage",
    });

    expect(mocks.recordStripeEvent).toHaveBeenCalledWith(
      "evt_1",
      "customer.subscription.updated"
    );
  });

  it("4. skips a subscription event failing schema validation, logs an error, and still records the event", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        id: "evt_bad",
        type: "customer.subscription.updated",
        data: { object: { not: "a subscription" } },
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.logError).toHaveBeenCalledWith(
      "Stripe subscription event failed validation and was skipped.",
      expect.objectContaining({
        eventId: "evt_bad",
        eventType: "customer.subscription.updated",
      })
    );
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    // Deterministic parse failures are not retried: the event is still
    // recorded so Stripe does not redeliver it.
    expect(mocks.recordStripeEvent).toHaveBeenCalledWith(
      "evt_bad",
      "customer.subscription.updated"
    );
  });

  it("5. skips a subscription event missing clerk_org_id metadata and logs an error", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({ metadata: null }),
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.logError).toHaveBeenCalledWith(
      "Stripe subscription event missing clerk_org_id metadata.",
      expect.objectContaining({ stripeSubscriptionId: "sub_1" })
    );
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it("6. logs an unhandled event type at info level and still records it", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        id: "evt_charge",
        type: "charge.succeeded",
        data: { object: {} },
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.logInfo).toHaveBeenCalledWith(
      "Stripe event type not handled.",
      expect.objectContaining({
        eventId: "evt_charge",
        eventType: "charge.succeeded",
      })
    );
    expect(mocks.recordStripeEvent).toHaveBeenCalledWith(
      "evt_charge",
      "charge.succeeded"
    );
  });

  it("7. propagates the error and does not record the event when the mirror write rejects", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.upsertSubscriptionFromWebhook.mockRejectedValueOnce(
      new Error("database unavailable")
    );

    await expect(POST(webhookRequest())).rejects.toThrow(
      "database unavailable"
    );

    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
  });
});

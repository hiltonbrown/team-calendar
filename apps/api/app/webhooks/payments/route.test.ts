import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getFirstActiveOrganisationIdForClerkOrg: vi.fn(),
  getSubscriptionForOrg: vi.fn(),
  getSubscriptionForStripeCustomer: vi.fn(),
  getSubscriptionForStripeSubscription: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve()),
  isStripeEventProcessed: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  recordStripeEvent: vi.fn(() => Promise.resolve()),
  recordStripeEventFailure: vi.fn(async (): Promise<boolean> => false),
  recordStripeEventIgnored: vi.fn(() => Promise.resolve()),
  resolvePlanKey: vi.fn(),
  retrieveStripeSubscription: vi.fn(),
  upsertSubscriptionFromWebhook: vi.fn((input: unknown) =>
    Promise.resolve(input)
  ),
}));

vi.mock("@repo/billing", () => ({
  constructEvent: mocks.constructEvent,
  resolvePlanKey: mocks.resolvePlanKey,
  retrieveStripeSubscription: mocks.retrieveStripeSubscription,
}));
vi.mock("@repo/database", () => ({
  getFirstActiveOrganisationIdForClerkOrg:
    mocks.getFirstActiveOrganisationIdForClerkOrg,
  getSubscriptionForOrg: mocks.getSubscriptionForOrg,
  getSubscriptionForStripeCustomer: mocks.getSubscriptionForStripeCustomer,
  getSubscriptionForStripeSubscription:
    mocks.getSubscriptionForStripeSubscription,
  isStripeEventProcessed: mocks.isStripeEventProcessed,
  recordStripeEvent: mocks.recordStripeEvent,
  recordStripeEventFailure: mocks.recordStripeEventFailure,
  recordStripeEventIgnored: mocks.recordStripeEventIgnored,
  upsertSubscriptionFromWebhook: mocks.upsertSubscriptionFromWebhook,
}));
vi.mock("@repo/jobs", () => ({
  inngest: { send: mocks.inngestSend },
}));
vi.mock("@repo/jobs/src/client", () => ({
  inngest: { send: mocks.inngestSend },
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError, info: mocks.logInfo, warn: mocks.logWarn },
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
    id: "evt_1",
    type: "customer.subscription.updated",
  };
}

describe("Stripe payments webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirstActiveOrganisationIdForClerkOrg.mockResolvedValue(
      "30000000-0000-4000-8000-000000000001"
    );
    mocks.getSubscriptionForOrg.mockResolvedValue(null);
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue(null);
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue(null);
    mocks.isStripeEventProcessed.mockResolvedValue(false);
    mocks.resolvePlanKey.mockReturnValue({ ok: true, value: "basic" });
    mocks.retrieveStripeSubscription.mockResolvedValue({
      ok: true,
      value: subscriptionEvent().data.object,
    });
  });

  it("returns 400 when the signature cannot be verified", async () => {
    mocks.constructEvent.mockReturnValue({
      error: {
        code: "bad_request",
        message: "Invalid Stripe webhook signature.",
      },
      ok: false,
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
        data: expect.objectContaining({
          organisationId: "30000000-0000-4000-8000-000000000001",
        }),
        name: "recount-usage",
      })
    );
    expect(mocks.recordStripeEvent).toHaveBeenCalledWith(
      "evt_1",
      "customer.subscription.updated",
      expect.objectContaining({ clerkOrgId: "org_1" })
    );

    // The event must only be recorded once the mirror write has completed, so
    // a failure mid-processing leaves the event un-recorded for Stripe to retry.
    const [mirrorOrder] =
      mocks.upsertSubscriptionFromWebhook.mock.invocationCallOrder;
    const [recordOrder] = mocks.recordStripeEvent.mock.invocationCallOrder;
    expect(recordOrder).toBeGreaterThan(mirrorOrder);
  });

  it("rejects with a non-2xx retryable response when metadata org is already bound to a different customer", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({
        customer: "cus_different",
        metadata: { clerk_org_id: "org_1" },
      }),
    });
    mocks.getSubscriptionForOrg.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_1",
      current_period_end: null,
      ended_at: null,
      plan_key: "basic",
      status: "active",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: "sub_existing",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "tenant_conflict" })
    );
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(
      "Stripe subscription tenant cross-check conflict detected.",
      expect.objectContaining({
        metadataOrgId: "org_1",
        resolvedClerkOrgId: null,
        stripeCustomerId: "cus_different",
      })
    );
  });

  it("rejects with a non-2xx retryable response when event customer is already bound to a different org", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({
        customer: "cus_1",
        metadata: { clerk_org_id: "org_different" },
      }),
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_bound_to_cus_1",
      current_period_end: null,
      ended_at: null,
      plan_key: "basic",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_bound",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(
      "Stripe subscription tenant cross-check conflict detected.",
      expect.objectContaining({
        metadataOrgId: "org_different",
        resolvedClerkOrgId: "org_bound_to_cus_1",
        stripeCustomerId: "cus_1",
      })
    );
  });

  it("succeeds when org and customer bindings match existing records", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({
        customer: "cus_1",
        metadata: { clerk_org_id: "org_1" },
      }),
    });
    mocks.getSubscriptionForOrg.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_1",
      current_period_end: null,
      ended_at: null,
      plan_key: "basic",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_1",
      current_period_end: null,
      ended_at: null,
      plan_key: "basic",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
    expect(mocks.recordStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("succeeds when org exists with null stripe_customer_id and customer is unbound", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({
        customer: "cus_1",
        metadata: { clerk_org_id: "org_1" },
      }),
    });
    mocks.getSubscriptionForOrg.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_1",
      current_period_end: null,
      ended_at: null,
      plan_key: "basic",
      status: "active",
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue(null);
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue(null);

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
    expect(mocks.recordStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects with a non-2xx retryable response when invoice event has a tenant/customer conflict", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: {
          object: {
            subscription: {
              cancel_at_period_end: false,
              current_period_end: 1_700_000_000,
              customer: "cus_1",
              id: "sub_1",
              items: { data: [{ price: { id: "price_basic" } }] },
              metadata: { clerk_org_id: "org_conflict" },
              status: "active",
            },
          },
        },
        id: "evt_inv_1",
        type: "invoice.paid",
      },
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_other",
      current_period_end: null,
      ended_at: null,
      plan_key: "basic",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_other",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
  });

  it("retrieves an authoritative subscription for an unexpanded invoice reference", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { subscription: "sub_1" } },
        id: "evt_invoice_reference",
        type: "invoice.paid",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveStripeSubscription).toHaveBeenCalledWith("sub_1");
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledTimes(1);
  });

  it("ignores a valid one-off invoice with no subscription", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { subscription: null } },
        id: "evt_invoice_once",
        type: "invoice.paid",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveStripeSubscription).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventIgnored).toHaveBeenCalledWith(
      "evt_invoice_once",
      "invoice.paid",
      new Date(1_700_000_100 * 1000)
    );
  });

  it("retrieves an authoritative subscription for checkout completion", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: {
          object: {
            customer: "cus_1",
            metadata: { clerk_org_id: "org_1" },
            subscription: "sub_1",
          },
        },
        id: "evt_checkout",
        type: "checkout.session.completed",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveStripeSubscription).toHaveBeenCalledWith("sub_1");
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledTimes(1);
  });

  it("does not mirror when the price maps to no known plan", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.resolvePlanKey.mockReturnValue({
      error: { code: "bad_request", message: "Unknown Stripe price." },
      ok: false,
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "unknown_price" })
    );
  });

  it("fails subscription events missing clerk_org_id metadata for retry", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({ metadata: null }),
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "invalid_payload" })
    );
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

  it.each([
    ["active then cancelled", ["active", "canceled"]],
    ["cancelled then active", ["canceled", "active"]],
  ] as const)(
    "uses the authoritative cancelled snapshot for equal-second events arriving %s",
    async (_label, arrivalOrder) => {
      const event = subscriptionEvent();
      for (const [index, status] of arrivalOrder.entries()) {
        mocks.constructEvent.mockReturnValueOnce({
          ok: true,
          value: {
            ...event,
            data: {
              object: {
                ...event.data.object,
                cancel_at_period_end: status === "canceled",
                status,
              },
            },
            id: `evt_equal_${index}`,
          },
        });
      }
      mocks.getSubscriptionForStripeSubscription.mockResolvedValue({
        clerk_org_id: "org_1",
        stripe_event_created_at: new Date(event.created * 1000),
      });
      mocks.retrieveStripeSubscription.mockResolvedValue({
        ok: true,
        value: {
          ...event.data.object,
          cancel_at_period_end: true,
          ended_at: 1_700_000_100,
          status: "canceled",
        },
      });

      const firstResponse = await POST(webhookRequest());
      const secondResponse = await POST(webhookRequest());

      expect([firstResponse.status, secondResponse.status]).toEqual([200, 200]);
      expect(mocks.retrieveStripeSubscription).toHaveBeenCalledTimes(2);
      expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledTimes(2);
      for (const [mirrored] of mocks.upsertSubscriptionFromWebhook.mock.calls) {
        expect(mirrored).toEqual(
          expect.objectContaining({
            authoritativeTie: true,
            cancelAtPeriodEnd: true,
            status: "canceled",
            stripeEventCreatedAt: new Date(1_700_000_100 * 1000),
          })
        );
      }
    }
  );

  it("authoritatively reconciles an equal-second insert collision before marking the event processed", async () => {
    const event = subscriptionEvent();
    mocks.constructEvent.mockReturnValue({ ok: true, value: event });
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue(null);
    mocks.upsertSubscriptionFromWebhook
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    mocks.retrieveStripeSubscription.mockResolvedValue({
      ok: true,
      value: {
        ...event.data.object,
        cancel_at_period_end: true,
        ended_at: 1_700_000_100,
        status: "canceled",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveStripeSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        authoritativeTie: true,
        cancelAtPeriodEnd: true,
        status: "canceled",
      })
    );
    expect(mocks.recordStripeEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordStripeEventFailure).not.toHaveBeenCalled();
  });

  it("fails an equal-second insert collision when Stripe cannot provide the authoritative snapshot", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue(null);
    mocks.upsertSubscriptionFromWebhook.mockResolvedValueOnce(0);
    mocks.retrieveStripeSubscription.mockResolvedValue({
      error: "Stripe unavailable",
      ok: false,
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: "provider_fetch" })
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
        planKey: "basic",
        status: "active",
        stripeEventCreatedAt: new Date(newerCreatedSeconds * 1000),
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

  it("records a failed receipt for invalid consumed subscription data", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { not: "a subscription" } },
        id: "evt_bad",
        type: "customer.subscription.updated",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.logError).toHaveBeenCalledWith(
      "Stripe subscription event failed validation and was skipped.",
      expect.objectContaining({
        eventId: "evt_bad",
        eventType: "customer.subscription.updated",
      })
    );
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: "invalid_payload",
        eventId: "evt_bad",
      })
    );
  });

  it("records an unsupported event type as intentionally ignored", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: {} },
        id: "evt_charge",
        type: "charge.succeeded",
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
    expect(mocks.recordStripeEventIgnored).toHaveBeenCalledWith(
      "evt_charge",
      "charge.succeeded",
      new Date(1_700_000_100 * 1000)
    );
  });

  it("records a retryable failure when the mirror write rejects", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.upsertSubscriptionFromWebhook.mockRejectedValueOnce(
      new Error("database unavailable")
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEvent).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        errorCategory: "processing_exception",
        stripeCustomerId: "cus_1",
      })
    );
  });

  it("emits a safe operator alert when the receipt throttle opens", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.resolvePlanKey.mockReturnValue({
      error: { code: "bad_request", message: "Unknown Stripe price." },
      ok: false,
    });
    mocks.recordStripeEventFailure.mockResolvedValueOnce(true);

    await POST(webhookRequest());

    expect(mocks.logError).toHaveBeenCalledWith(
      "Stripe event delivery requires operator attention.",
      { errorCategory: "unknown_price", eventId: "evt_1" }
    );
  });

  it("assigns conflicting metadata failures to the verified customer tenant", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({ metadata: { clerk_org_id: "org_foreign" } }),
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_verified",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_1",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_verified",
        errorCategory: "tenant_conflict",
        stripeCustomerId: "cus_1",
      })
    );
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it("uses a known customer binding when subscription metadata is absent", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent({ metadata: null }),
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_verified",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_1",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ clerkOrgId: "org_verified" })
    );
  });

  it("assigns provider retrieval failures through the stored subscription binding", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { subscription: "sub_known" } },
        id: "evt_fetch",
        type: "invoice.paid",
      },
    });
    mocks.retrieveStripeSubscription.mockResolvedValue({
      error: { code: "internal", message: "unavailable" },
      ok: false,
    });
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_verified",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_known",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_known",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_verified",
        errorCategory: "provider_fetch",
        stripeCustomerId: "cus_known",
      })
    );
  });

  it("assigns malformed payload failures through a minimally parsed known customer", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { customer: "cus_known", status: 42 } },
        id: "evt_malformed",
        type: "customer.subscription.updated",
      },
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_verified",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_known",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_known",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_verified",
        errorCategory: "invalid_payload",
        stripeCustomerId: "cus_known",
      })
    );
  });

  it("rejects an unclassified empty invoice instead of ignoring it", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: {} },
        id: "evt_empty_invoice",
        type: "invoice.paid",
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEventIgnored).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: "invalid_payload",
        eventId: "evt_empty_invoice",
      })
    );
  });

  it("preserves stored tenant identity when authoritative subscription validation fails", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { subscription: "sub_known" } },
        id: "evt_invalid_authoritative",
        type: "invoice.paid",
      },
    });
    mocks.retrieveStripeSubscription.mockResolvedValue({
      ok: true,
      value: { id: "sub_known" },
    });
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_verified",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_known",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_known",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_verified",
        errorCategory: "invalid_payload",
        stripeCustomerId: "cus_known",
      })
    );
  });

  it("fails closed when customer and subscription bindings resolve to different tenants", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: subscriptionEvent(),
    });
    mocks.getSubscriptionForStripeCustomer.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_customer",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_1",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_customer",
    });
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_subscription",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_other",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_1",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: null,
        errorCategory: "tenant_conflict",
      })
    );
  });

  it("matches a malformed subscription object through its own stored subscription id", async () => {
    mocks.constructEvent.mockReturnValue({
      ok: true,
      value: {
        created: 1_700_000_100,
        data: { object: { id: "sub_known", status: 42 } },
        id: "evt_malformed_subscription",
        type: "customer.subscription.updated",
      },
    });
    mocks.getSubscriptionForStripeSubscription.mockResolvedValue({
      cancel_at_period_end: false,
      clerk_org_id: "org_verified",
      current_period_end: null,
      ended_at: null,
      plan_key: "premium",
      status: "active",
      stripe_customer_id: "cus_known",
      stripe_event_created_at: null,
      stripe_subscription_id: "sub_known",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.getSubscriptionForStripeSubscription).toHaveBeenCalledWith(
      "sub_known"
    );
    expect(mocks.recordStripeEventFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_verified",
        errorCategory: "invalid_payload",
        stripeCustomerId: "cus_known",
      })
    );
  });
});

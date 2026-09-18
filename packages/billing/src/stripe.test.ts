import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  eventRetrieve: vi.fn(),
  getSubscriptionForOrg: vi.fn(),
  subscriptionRetrieve: vi.fn(),
}));
const CHECKOUT_IDEMPOTENCY_KEY = /^team-calendar:checkout:[a-f0-9]{64}$/;

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  getSubscriptionForOrg: mocks.getSubscriptionForOrg,
  PLAN_CATALOGUE: [
    { plan_key: "basic", priceId: "price_basic" },
    { plan_key: "premium", priceId: "price_premium" },
    { plan_key: "enterprise", priceId: null },
  ],
}));
vi.mock("stripe", () => ({
  default: class Stripe {
    checkout = { sessions: { create: mocks.checkoutCreate } };
    events = { retrieve: mocks.eventRetrieve };
    subscriptions = { retrieve: mocks.subscriptionRetrieve };
  },
}));

const {
  STRIPE_API_VERSION,
  createCheckoutSession,
  getStripe,
  resolvePlanKey,
  retrieveStripeEvent,
  retrieveStripeSubscription,
} = await import("./stripe");

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

describe("createCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_checkout");
    vi.stubEnv(
      "STRIPE_CHECKOUT_SUCCESS_URL",
      "https://app.example/settings/billing?checkout=success"
    );
    vi.stubEnv(
      "STRIPE_CHECKOUT_CANCEL_URL",
      "https://app.example/settings/billing?checkout=cancelled"
    );
    mocks.checkoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.example/session",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["active", "trialing", "incomplete", "past_due"])(
    "rejects a new checkout for an existing %s subscription",
    async (status) => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        status,
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing",
      });

      const result = await createCheckoutSession("org_existing", "basic");

      expect(result).toEqual({
        error: {
          code: "conflict",
          message:
            "This organisation already has a subscription. Manage it in the billing portal.",
        },
        ok: false,
      });
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    }
  );

  it("fails closed when a non-terminal mirror is awaiting its Stripe subscription id", async () => {
    mocks.getSubscriptionForOrg.mockResolvedValue({
      status: "active",
      stripe_customer_id: "cus_existing",
      stripe_subscription_id: null,
    });

    const result = await createCheckoutSession("org_existing", "basic");

    expect(result.ok).toBe(false);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it.each(["canceled", "incomplete_expired"])(
    "creates Checkout for a terminal %s subscription and reuses its customer",
    async (status) => {
      mocks.getSubscriptionForOrg.mockResolvedValue({
        status,
        stripe_customer_id: "cus_returning",
        stripe_subscription_id: "sub_terminal",
      });

      await expect(
        createCheckoutSession("org_returning", "premium")
      ).resolves.toEqual({
        ok: true,
        value: "https://checkout.stripe.example/session",
      });

      expect(mocks.checkoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "cus_returning" }),
        {
          idempotencyKey: expect.stringMatching(CHECKOUT_IDEMPOTENCY_KEY),
        }
      );
    }
  );

  it("creates Checkout when no subscription exists", async () => {
    mocks.getSubscriptionForOrg.mockResolvedValue(null);

    await expect(createCheckoutSession("org_new", "basic")).resolves.toEqual({
      ok: true,
      value: "https://checkout.stripe.example/session",
    });

    expect(mocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: undefined }),
      { idempotencyKey: expect.any(String) }
    );
  });

  it("uses one stable idempotency key for concurrent requests for the same transition", async () => {
    mocks.getSubscriptionForOrg.mockResolvedValue(null);

    await Promise.all([
      createCheckoutSession("org_concurrent", "basic"),
      createCheckoutSession("org_concurrent", "basic"),
    ]);

    const firstOptions = mocks.checkoutCreate.mock.calls[0]?.[1];
    const secondOptions = mocks.checkoutCreate.mock.calls[1]?.[1];
    expect(firstOptions?.idempotencyKey).toBe(secondOptions?.idempotencyKey);
  });

  it("uses distinct idempotency keys for distinct requested plans", async () => {
    mocks.getSubscriptionForOrg.mockResolvedValue(null);

    await createCheckoutSession("org_concurrent", "basic");
    await createCheckoutSession("org_concurrent", "premium");

    expect(mocks.checkoutCreate.mock.calls[0]?.[1]?.idempotencyKey).not.toBe(
      mocks.checkoutCreate.mock.calls[1]?.[1]?.idempotencyKey
    );
  });
});

describe("authoritative Stripe retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_replay");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("retrieves an event by exact provider ID", async () => {
    mocks.eventRetrieve.mockResolvedValue({ id: "evt_1" });

    await expect(retrieveStripeEvent("evt_1")).resolves.toEqual({
      ok: true,
      value: { id: "evt_1" },
    });
    expect(mocks.eventRetrieve).toHaveBeenCalledWith("evt_1");
  });

  it("returns a safe failure when subscription retrieval fails", async () => {
    mocks.subscriptionRetrieve.mockRejectedValue(new Error("provider detail"));

    const result = await retrieveStripeSubscription("sub_1");

    expect(result).toEqual({
      error: {
        code: "internal",
        message: "Stripe subscription retrieval failed.",
      },
      ok: false,
    });
  });
});

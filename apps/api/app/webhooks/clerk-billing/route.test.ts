import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchRecountUsage: vi.fn(),
  organisationFindFirst: vi.fn(),
  upsertSubscriptionFromWebhook: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@repo/database", () => ({
  database: {
    organisation: { findFirst: mocks.organisationFindFirst },
  },
  upsertSubscriptionFromWebhook: mocks.upsertSubscriptionFromWebhook,
}));
vi.mock("@repo/jobs", () => ({
  dispatchRecountUsage: mocks.dispatchRecountUsage,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/env", () => ({
  env: { CLERK_BILLING_WEBHOOK_SECRET: "whsec_test" },
}));
vi.mock("svix", () => ({
  Webhook: class {
    verify = mocks.verify;
  },
}));
vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "svix-header-value" }),
}));

const { POST, mapSubscriptionEvent } = await import("./route");

// Clerk period_end is Unix milliseconds.
const PERIOD_END_MS = 1_900_000_000_000;

function subscriptionEvent(
  overrides: { plan_period?: "month" | "annual"; status?: string } = {}
) {
  return {
    type: "subscription.created",
    data: {
      payer: { organization_id: "org_billing" },
      status: overrides.status ?? "active",
      items: [
        {
          status: "active",
          plan: { slug: "premium" },
          plan_period: overrides.plan_period ?? "month",
          period_end: PERIOD_END_MS,
        },
      ],
    },
  };
}

function request(body: unknown): Request {
  return new Request("https://api.test/webhooks/clerk-billing", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("mapSubscriptionEvent", () => {
  it("maps a monthly event with a millisecond period_end", () => {
    const mapped = mapSubscriptionEvent(subscriptionEvent().data as never);
    expect(mapped).toEqual({
      billingInterval: "month",
      cancelAtPeriodEnd: false,
      clerkOrgId: "org_billing",
      clerkPlanKey: "premium",
      currentPeriodEnd: new Date(PERIOD_END_MS),
      status: "active",
    });
  });

  it("maps Clerk's annual plan period to the year DB enum", () => {
    const mapped = mapSubscriptionEvent(
      subscriptionEvent({ plan_period: "annual" }).data as never
    );
    expect(mapped?.billingInterval).toBe("year");
  });

  it("derives cancellation from a canceled status", () => {
    const mapped = mapSubscriptionEvent(
      subscriptionEvent({ status: "canceled" }).data as never
    );
    expect(mapped?.status).toBe("canceled");
    expect(mapped?.cancelAtPeriodEnd).toBe(true);
  });
});

describe("POST /webhooks/clerk-billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertSubscriptionFromWebhook.mockResolvedValue({
      ok: true,
      value: {},
    });
    mocks.organisationFindFirst.mockResolvedValue({ id: "org-uuid" });
    mocks.dispatchRecountUsage.mockResolvedValue({ ok: true, value: {} });
  });

  it("returns 400 when Svix verification fails", async () => {
    mocks.verify.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await POST(request(subscriptionEvent()));

    expect(response.status).toBe(400);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it("returns 400 on a malformed payload for a handled type", async () => {
    mocks.verify.mockReturnValue({ type: "subscription.created", data: {} });

    const response = await POST(request({ nonsense: true }));

    expect(response.status).toBe(400);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it("ignores unhandled event types with a 200", async () => {
    mocks.verify.mockReturnValue({
      type: "subscriptionItem.freeTrialEnding",
      data: {},
    });

    const response = await POST(request({}));

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it("handles a past-due event and mirrors the subscription", async () => {
    const event = subscriptionEvent({ status: "past_due" });
    event.type = "subscription.pastDue";
    mocks.verify.mockReturnValue(event);

    const response = await POST(request({}));

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ clerkOrgId: "org_billing", status: "past_due" })
    );
    expect(mocks.dispatchRecountUsage).toHaveBeenCalledWith({
      clerkOrgId: "org_billing",
      organisationId: "org-uuid",
    });
  });
});

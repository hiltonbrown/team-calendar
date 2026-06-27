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

const { POST, mapBillingEvent } = await import("./route");

function subscriptionEvent() {
  return {
    type: "subscription.created",
    data: {
      payer: { organization_id: "org_billing" },
      status: "active",
      items: [
        {
          status: "active",
          plan: { slug: "premium" },
          plan_period: "month",
          period_end: 1_900_000_000,
          cancel_at_period_end: false,
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

describe("mapBillingEvent", () => {
  it("maps a subscription event to the mirror shape", () => {
    const mapped = mapBillingEvent(subscriptionEvent() as never);
    expect(mapped).toEqual({
      billingInterval: "month",
      cancelAtPeriodEnd: false,
      clerkOrgId: "org_billing",
      clerkPlanKey: "premium",
      currentPeriodEnd: new Date(1_900_000_000 * 1000),
      status: "active",
    });
  });

  it("marks a deleted subscription as cancelled", () => {
    const event = subscriptionEvent();
    event.type = "subscription.deleted";
    const mapped = mapBillingEvent(event as never);
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

  it("returns 400 on a malformed payload", async () => {
    mocks.verify.mockReturnValue({ type: "subscription.created", data: {} });

    const response = await POST(request({ nonsense: true }));

    expect(response.status).toBe(400);
    expect(mocks.upsertSubscriptionFromWebhook).not.toHaveBeenCalled();
  });

  it("mirrors the subscription and enqueues a recount on a valid event", async () => {
    mocks.verify.mockReturnValue(subscriptionEvent());

    const response = await POST(request(subscriptionEvent()));

    expect(response.status).toBe(200);
    expect(mocks.upsertSubscriptionFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_billing",
        clerkPlanKey: "premium",
      })
    );
    expect(mocks.dispatchRecountUsage).toHaveBeenCalledWith({
      clerkOrgId: "org_billing",
      organisationId: "org-uuid",
    });
  });
});

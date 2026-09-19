import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverStripeEvent: vi.fn(),
  retrieveStripeEvent: vi.fn(),
}));

vi.mock("@repo/billing", () => ({
  retrieveStripeEvent: mocks.retrieveStripeEvent,
}));
vi.mock("../../apps/api/lib/stripe-event-delivery.js", () => ({
  deliverStripeEvent: mocks.deliverStripeEvent,
}));

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.argv = ["bun", "replay-stripe-event.ts", "evt_verified", "--confirm"];
  mocks.retrieveStripeEvent.mockResolvedValue({
    ok: true,
    value: {
      created: 1_700_000_000,
      data: { object: { id: "sub_1" } },
      id: "evt_verified",
      type: "customer.subscription.updated",
    },
  });
  mocks.deliverStripeEvent.mockResolvedValue({
    alreadyComplete: false,
    ok: true,
    status: 200,
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

describe("Stripe event replay CLI", () => {
  it("retrieves the exact provider event and sends it through shared delivery", async () => {
    await import("./replay-stripe-event.js");

    expect(mocks.retrieveStripeEvent).toHaveBeenCalledWith("evt_verified");
    expect(mocks.deliverStripeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_verified" })
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
      "Stripe event evt_verified replay completed.\n"
    );
  });

  it("rejects an invocation without explicit confirmation before provider access", async () => {
    process.argv = ["bun", "replay-stripe-event.ts", "evt_verified"];

    await expect(import("./replay-stripe-event.js")).rejects.toThrow(
      "Usage: replay-stripe-event <evt_...> --confirm"
    );
    expect(mocks.retrieveStripeEvent).not.toHaveBeenCalled();
  });
});

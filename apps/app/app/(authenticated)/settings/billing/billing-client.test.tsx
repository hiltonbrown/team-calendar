// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ startCheckout: vi.fn(), startPortal: vi.fn() }));
vi.mock("@repo/next-config/launch-mode", () => ({
  isEarlyAccess: () => false,
}));

const { BillingClient } = await import("./billing-client");

afterEach(cleanup);

describe("BillingClient recovery status", () => {
  it("shows safe failed Stripe event identifiers and categories to billing operators", () => {
    render(
      <BillingClient
        summary={{
          billingSyncUnhealthy: true,
          failedStripeEvents: [
            {
              errorCategory: "provider_fetch",
              eventId: "evt_operator_1",
              lastAttemptedAt: new Date("2026-09-19T00:00:00.000Z"),
            },
          ],
          hasContactFlow: false,
          hasUpgradeFlow: true,
          isOverLimit: false,
          plan: {
            currentPeriodEnd: null,
            key: "basic",
            label: "Basic",
            seatsPurchased: 1,
            status: "active",
          },
          usage: [],
        }}
      />
    );

    expect(screen.getByText("evt_operator_1: provider_fetch")).toBeDefined();
  });
});

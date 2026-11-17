// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startCheckout: vi.fn(),
  startPortal: vi.fn(),
}));

vi.mock("./actions", () => ({
  startCheckout: mocks.startCheckout,
  startPortal: mocks.startPortal,
}));
vi.mock("@repo/next-config/launch-mode", () => ({
  isEarlyAccess: () => false,
}));

const { BillingClient } = await import("./billing-client");

afterEach(cleanup);

const baseSummary = {
  billingSyncUnhealthy: false,
  failedStripeEvents: [],
  hasContactFlow: false,
  hasUpgradeFlow: true,
  isOverLimit: false,
  plan: {
    currentPeriodEnd: null,
    key: "basic" as const,
    label: "Basic",
    seatsPurchased: 1,
    status: "active",
  },
  usage: [],
};

describe("BillingClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recovery status", () => {
    it("shows safe failed Stripe event identifiers and categories to billing operators", () => {
      render(
        <BillingClient
          summary={{
            ...baseSummary,
            billingSyncUnhealthy: true,
            failedStripeEvents: [
              {
                errorCategory: "provider_fetch",
                eventId: "evt_operator_1",
                lastAttemptedAt: new Date("2026-09-19T00:00:00.000Z"),
              },
            ],
          }}
        />
      );

      expect(screen.getByText("evt_operator_1: provider_fetch")).toBeDefined();
    });
  });

  describe("action error display", () => {
    it("renders returned error when portal creation fails", async () => {
      mocks.startPortal.mockResolvedValue({
        error: { code: "forbidden", message: "Permission denied" },
        ok: false,
      });

      render(<BillingClient summary={baseSummary} />);

      fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toContain(
          "Permission denied"
        );
      });
    });

    it("renders returned error when checkout creation fails", async () => {
      mocks.startCheckout.mockResolvedValue({
        error: { code: "bad_request", message: "Stripe error occurred" },
        ok: false,
      });

      render(<BillingClient summary={baseSummary} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Upgrade to Premium" })
      );

      await waitFor(() => {
        expect(screen.getByRole("alert").textContent).toContain(
          "Stripe error occurred"
        );
      });
    });
  });
});

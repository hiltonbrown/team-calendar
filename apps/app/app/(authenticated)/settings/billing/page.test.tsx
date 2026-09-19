import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recoveryMessagePattern = /Billing changes are still being reconciled/;

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  currentUser: vi.fn(),
  getBillingSummary: vi.fn(),
  getActivationDashboardSummary: vi.fn(),
  getSubscriptionForOrg: vi.fn(),
  getUnresolvedStripeEventsForOrg: vi.fn(),
  hasUnresolvedStripeEventForOrg: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  startCheckout: vi.fn(),
  startPortal: vi.fn(),
}));
vi.mock("@repo/auth/helpers", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@repo/auth/server", () => ({
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  getBillingSummary: mocks.getBillingSummary,
}));
vi.mock("@repo/database", () => ({
  database: { auditEvent: { create: mocks.auditCreate } },
  getActivationDashboardSummary: mocks.getActivationDashboardSummary,
  getSubscriptionForOrg: mocks.getSubscriptionForOrg,
  getUnresolvedStripeEventsForOrg: mocks.getUnresolvedStripeEventsForOrg,
  hasUnresolvedStripeEventForOrg: mocks.hasUnresolvedStripeEventForOrg,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));

const Page = (await import("./page")).default;

const organisationId = "00000000-0000-4000-8000-000000000001";
const summary = {
  hasContactFlow: false,
  hasUpgradeFlow: true,
  isOverLimit: false,
  plan: {
    currentPeriodEnd: null,
    key: "pro",
    label: "Pro",
    seatsPurchased: 12,
    status: "active",
  },
  usage: [],
};

describe("BillingPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageRole.mockResolvedValue(undefined);
    mocks.requireRole.mockResolvedValue(true);
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "owner@example.com" }],
      firstName: "Owner",
      id: "user_1",
      lastName: "User",
    });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
    });
    mocks.getBillingSummary.mockResolvedValue({ ok: true, value: summary });
    mocks.getActivationDashboardSummary.mockResolvedValue({
      failures: { stripeDeliveries: 0, syncRecords: 0, xeroWrites: 0 },
      milestones: {
        feedAccessed: false,
        firstLeaveApproved: false,
        firstLeaveSubmitted: false,
        initialSyncCompleted: false,
        organisationProvisioned: true,
        xeroConnected: false,
      },
    });
    mocks.getSubscriptionForOrg.mockResolvedValue(null);
    mocks.getUnresolvedStripeEventsForOrg.mockResolvedValue([]);
    mocks.hasUnresolvedStripeEventForOrg.mockResolvedValue(false);
  });

  it("shows a paid-mode recovery state for unresolved billing events", async () => {
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "paid");
    mocks.hasUnresolvedStripeEventForOrg.mockResolvedValue(true);
    mocks.getUnresolvedStripeEventsForOrg.mockResolvedValue([
      {
        errorCategory: "provider_fetch",
        eventId: "evt_operator_1",
        lastAttemptedAt: new Date("2026-09-19T00:00:00.000Z"),
      },
    ]);

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(recoveryMessagePattern)).toBeDefined();
    expect(screen.getByText("evt_operator_1: provider_fetch")).toBeDefined();
  });

  it("requires admin access", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("org:admin");
  });

  it("denies managers and below when the role guard rejects", async () => {
    mocks.requirePageRole.mockRejectedValue(new Error("Permission denied"));

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "Permission denied"
    );
    expect(mocks.getBillingSummary).not.toHaveBeenCalled();
  });

  it("renders the owner billing view when the user is an owner", async () => {
    mocks.requireRole.mockResolvedValue(true);

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getBillingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "owner" })
    );
    expect(
      screen.queryByText("Billing actions are managed by the account owner.")
    ).toBeNull();
  });

  it("renders the billing view for admins as the admin role", async () => {
    mocks.requireRole.mockResolvedValue(false);

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getBillingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "admin" })
    );
  });
});

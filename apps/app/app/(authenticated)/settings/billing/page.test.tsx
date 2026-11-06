import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recoveryMessagePattern = /Billing changes are still being reconciled/;

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  getActivationDashboardSummary: vi.fn(),
  getBillingSummary: vi.fn(),
  getCurrentUser: vi.fn(),
  getSubscriptionForAccount: vi.fn(),
  getUnresolvedStripeEventsForAccount: vi.fn(),
  hasPermission: vi.fn(),
  hasUnresolvedStripeEventForAccount: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePagePermission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  startCheckout: vi.fn(),
  startPortal: vi.fn(),
}));
vi.mock("@repo/auth/helpers", () => ({
  hasPermission: mocks.hasPermission,
  requireAccount: vi.fn(async () => "org_1"),
}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@repo/availability", () => ({
  getBillingSummary: mocks.getBillingSummary,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) =>
      executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...buildTenantTestDatabase(),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  getActivationDashboardSummary: mocks.getActivationDashboardSummary,
  getSubscriptionForAccount: mocks.getSubscriptionForAccount,
  getUnresolvedStripeEventsForAccount:
    mocks.getUnresolvedStripeEventsForAccount,
  hasUnresolvedStripeEventForAccount: mocks.hasUnresolvedStripeEventForAccount,
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return { auditEvent: { create: mocks.auditCreate } };
}
vi.mock("@/lib/auth/require-page-permission", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
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
    mocks.requirePagePermission.mockResolvedValue(undefined);
    mocks.hasPermission.mockResolvedValue(true);
    mocks.getCurrentUser.mockResolvedValue({
      email: "owner@example.com",
      id: "user_1",
      name: "Owner",
    });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      accountId: "org_1",
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
    mocks.getSubscriptionForAccount.mockResolvedValue(null);
    mocks.getUnresolvedStripeEventsForAccount.mockResolvedValue([]);
    mocks.hasUnresolvedStripeEventForAccount.mockResolvedValue(false);
  });

  it("shows a paid-mode recovery state for unresolved billing events", async () => {
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "paid");
    mocks.hasUnresolvedStripeEventForAccount.mockResolvedValue(true);
    mocks.getUnresolvedStripeEventsForAccount.mockResolvedValue([
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

    expect(mocks.requirePagePermission).toHaveBeenCalledWith({
      billing: ["read"],
    });
  });

  it("denies managers and below when the role guard rejects", async () => {
    mocks.requirePagePermission.mockRejectedValue(
      new Error("Permission denied")
    );

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "Permission denied"
    );
    expect(mocks.getBillingSummary).not.toHaveBeenCalled();
  });

  it("renders the owner billing view when the user is an owner", async () => {
    mocks.hasPermission.mockResolvedValue(true);

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getBillingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "owner" }),
      expect.any(Object)
    );
    expect(
      screen.queryByText("Billing actions are managed by the account owner.")
    ).toBeNull();
  });

  it("renders the billing view for admins as the admin role", async () => {
    mocks.hasPermission.mockResolvedValue(false);

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getBillingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "admin" }),
      expect.any(Object)
    );
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  auth: vi.fn(),
  currentUser: vi.fn(),
  getBillingSummary: vi.fn(),
  getBillingSummaryForDashboard: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  getBillingSummary: mocks.getBillingSummary,
  getBillingSummaryForDashboard: mocks.getBillingSummaryForDashboard,
}));
vi.mock("@repo/database", () => ({
  database: { auditEvent: { create: mocks.auditCreate } },
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
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "admin@example.com" }],
      firstName: "Admin",
      id: "user_1",
      lastName: "User",
    });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
    });
    mocks.getBillingSummaryForDashboard.mockResolvedValue({
      ok: true,
      value: { ...summary, visibleToAdmin: true },
    });
    mocks.getBillingSummary.mockResolvedValue({ ok: true, value: summary });
  });

  it("requires admin access and renders a locked admin view", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("org:admin");
    expect(mocks.getBillingSummaryForDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "admin" })
    );
    expect(
      screen.getByText("Billing actions are managed by the account owner.")
    ).toBeDefined();
  });

  it("uses the owner billing service for owners", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:owner" });

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getBillingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ actingRole: "owner" })
    );
    expect(
      screen.queryByText("Billing actions are managed by the account owner.")
    ).toBeNull();
  });
});

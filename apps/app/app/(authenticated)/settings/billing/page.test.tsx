import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  currentUser: vi.fn(),
  getBillingSummary: vi.fn(),
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

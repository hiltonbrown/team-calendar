import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  currentUser: vi.fn(),
  getBillingOverview: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/database", () => ({
  database: { auditEvent: { create: mocks.auditCreate } },
  getBillingOverview: mocks.getBillingOverview,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));

const Page = (await import("./page")).default;

const UNLIMITED_PATTERN = /Unlimited/;

const organisationId = "00000000-0000-4000-8000-000000000001";
const overview = {
  billingInterval: "month",
  cancelAtPeriodEnd: false,
  clerkPlanKey: "premium",
  currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
  planName: "Premium",
  seatsPurchased: 10,
  status: "active",
  usage: [
    { current: 8, limit: 50, limitType: "seats" },
    { current: 3, limit: -1, limitType: "feeds" },
  ],
};

describe("BillingPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageRole.mockResolvedValue(undefined);
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
    mocks.getBillingOverview.mockResolvedValue({ ok: true, value: overview });
  });

  it("requires owner access", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("org:owner");
  });

  it("denies non-owners when the role guard rejects", async () => {
    mocks.requirePageRole.mockRejectedValue(new Error("Permission denied"));

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "Permission denied"
    );
    expect(mocks.getBillingOverview).not.toHaveBeenCalled();
  });

  it("renders the live plan name and an unlimited dimension", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.getBillingOverview).toHaveBeenCalledWith("org_1");
    expect(screen.getByText("Premium")).toBeDefined();
    expect(screen.getByText(UNLIMITED_PATTERN)).toBeDefined();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getXeroConnectionStateForScope: vi.fn(),
  personFindFirst: vi.fn(),
  resolveDashboardRole: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/availability", () => ({
  createDashboardCache: () => ({}),
  getAdminView: vi.fn(),
  getEmployeeView: vi.fn(),
  getManagerView: vi.fn(),
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
  resolveDashboardRole: mocks.resolveDashboardRole,
}));
vi.mock("@repo/database", () => ({
  database: { person: { findFirst: mocks.personFindFirst } },
  scopedQuery: (clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  }),
}));
vi.mock("@/components/dashboard/admin-empty-view", () => ({
  AdminEmptyView: ({
    xeroConnectionState,
  }: {
    xeroConnectionState: string;
  }) => <div>Admin empty {xeroConnectionState}</div>,
}));
vi.mock("@/components/dashboard/viewer-view", () => ({
  ViewerView: () => <div>Viewer view</div>,
}));

const { DashboardBody } = await import("./dashboard-body");
const ONBOARDING_SURFACE = /Getting started|Dismiss onboarding/;
const props = {
  clerkOrgId: "org_1" as never,
  organisationId: "00000000-0000-4000-8000-000000000001" as never,
  orgQueryValue: null,
  orgRole: "org:admin",
  userId: "user_1",
};

describe("DashboardBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue(null);
  });

  it("shows an unlinked admin the empty view with the Xero state and no onboarding panel", async () => {
    mocks.resolveDashboardRole.mockResolvedValue({ ok: true, value: "admin" });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    render(await DashboardBody(props));
    expect(screen.getByText("Admin empty not_connected")).toBeTruthy();
    expect(screen.queryByText(ONBOARDING_SURFACE)).toBeNull();
  });

  it("does not look up Xero for an unlinked member", async () => {
    mocks.resolveDashboardRole.mockResolvedValue({ ok: true, value: "viewer" });
    render(await DashboardBody({ ...props, orgRole: "org:viewer" }));
    expect(screen.getByText("Viewer view")).toBeTruthy();
    expect(mocks.getXeroConnectionStateForScope).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personFindFirst: vi.fn(),
  resolveDashboardRole: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/availability", () => ({
  createDashboardCache: () => ({}),
  getAdminView: vi.fn(),
  getEmployeeView: vi.fn(),
  getManagerView: vi.fn(),
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
  AdminEmptyView: () => <div>Admin empty view</div>,
}));
vi.mock("@/components/dashboard/viewer-view", () => ({
  ViewerView: () => <div>Viewer view</div>,
}));

const { DashboardBody } = await import("./dashboard-body");
const ONBOARDING_SURFACE = /Getting started|Dismiss onboarding|Setup/;
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

  it("shows an unlinked admin the empty view with no onboarding panel", async () => {
    mocks.resolveDashboardRole.mockResolvedValue({ ok: true, value: "admin" });
    const { container } = render(await DashboardBody(props));
    expect(screen.getByText("Admin empty view")).toBeTruthy();
    expect(container.textContent).not.toMatch(ONBOARDING_SURFACE);
  });

  it("shows an unlinked member the viewer view", async () => {
    mocks.resolveDashboardRole.mockResolvedValue({ ok: true, value: "viewer" });
    render(await DashboardBody({ ...props, orgRole: "org:viewer" }));
    expect(screen.getByText("Viewer view")).toBeTruthy();
  });
});

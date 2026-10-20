import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personFindFirst: vi.fn(),
  resolveDashboardRole: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/availability", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../packages/availability/src/dashboard/timeline-week")
  >("../../../../packages/availability/src/dashboard/timeline-week")),
  createDashboardCache: () => ({}),
  getAdminView: vi.fn(),
  getCalendarRange: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: {
        companies: [{ id: companyId, name: "Company A", timezone: "UTC" }],
        days: [],
        people: [],
        range: {
          end: new Date("2026-10-19T00:00:00Z"),
          start: new Date("2026-10-12T00:00:00Z"),
          timezone: "UTC",
        },
        totalPeopleInScope: 0,
        truncated: false,
        view: "week",
        xeroConnectionState: "not_connected",
        xeroSyncFailedCount: 0,
      },
    })
  ),
  getDashboardApprovalQueue: vi.fn(() =>
    Promise.resolve({ data: { count: 0, rows: [] }, status: "ready" })
  ),
  getEmployeeView: vi.fn(),
  getManagerView: vi.fn(),
  resolveDashboardRole: mocks.resolveDashboardRole,
  selectCalendarCompanies: vi.fn((_input, companies) => ({
    ok: true,
    value: companies,
  })),
}));
vi.mock("../../../../packages/database/src/tenant-client", () => ({
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
  ...(await vi.importActual<
    typeof import("../../../../packages/database/src/queries/account-companies")
  >("../../../../packages/database/src/queries/account-companies")),
  scopedQuery: (clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  }),
  ...(await vi.importActual<
    typeof import("../../../../packages/database/src/tenant-db")
  >("../../../../packages/database/src/tenant-db")),
}));
function buildTenantTestDatabase() {
  return {
    organisation: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            country_code: "AU",
            id: companyId,
            name: "Company A",
            timezone: "UTC",
          },
        ])
      ),
    },
    person: { findFirst: mocks.personFindFirst },
  };
}
vi.mock("@/components/dashboard/admin-empty-view", () => ({
  AdminEmptyView: () => <div>Admin empty view</div>,
}));
vi.mock("@/components/dashboard/viewer-view", () => ({
  ViewerView: () => <div>Viewer view</div>,
}));

const { DashboardBody } = await import("./dashboard-body");
const ONBOARDING_SURFACE = /Getting started|Dismiss onboarding|Setup/;
const companyId = "00000000-0000-4000-8000-000000000001";
const props = {
  clerkOrgId: "org_1" as never,
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

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({ subscribe: () => () => undefined }),
}));

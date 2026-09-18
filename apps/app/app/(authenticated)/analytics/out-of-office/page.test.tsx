import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregateOutOfOffice: vi.fn(),
  auth: vi.fn(),
  currentUser: vi.fn(),
  database: { organisation: { findFirst: vi.fn() } },
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
  resolveDateRange: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  aggregateOutOfOffice: mocks.aggregateOutOfOffice,
  resolveDateRange: mocks.resolveDateRange,
}));
vi.mock("@repo/database", () => ({ database: mocks.database }));
vi.mock("@/lib/auth/require-page-role", () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("../analytics-filters", () => ({
  AnalyticsFilters: ({ personType }: { personType: string }) => (
    <div>People: {personType}</div>
  ),
}));
vi.mock("./ooo-days-by-type-chart", () => ({
  OooDaysByTypeChart: () => <div>Type chart</div>,
}));
vi.mock("./ooo-days-monthly-chart", () => ({
  OooDaysMonthlyChart: () => <div>Monthly chart</div>,
}));

const Page = (await import("./page")).default;

describe("OutOfOfficePage", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: "user-1" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org-1",
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    mocks.database.organisation.findFirst.mockResolvedValue({
      timezone: "UTC",
    });
    mocks.resolveDateRange.mockReturnValue({
      ok: true,
      value: {
        end: new Date("2027-01-01T00:00:00.000Z"),
        label: "2026",
        start: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    mocks.aggregateOutOfOffice.mockResolvedValue({
      ok: true,
      value: report(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("passes the URL person type into the scoped aggregation", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          org: "00000000-0000-4000-8000-000000000001",
          personType: "employee",
          preset: "this_year",
        }),
      })
    );

    expect(mocks.aggregateOutOfOffice).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org-1",
        filters: {
          includeArchivedPeople: false,
          personType: "employee",
        },
        organisationId: "00000000-0000-4000-8000-000000000001",
      })
    );
    expect(screen.getByText("People: employee")).toBeDefined();
  });

  it("fails closed to all people for an unsupported value", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({ personType: "director" }),
      })
    );

    expect(mocks.aggregateOutOfOffice).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          includeArchivedPeople: false,
          personType: "all",
        },
      })
    );
  });
});

function report() {
  return {
    dataFreshness: {
      generatedAt: new Date("2026-08-30T00:00:00.000Z"),
      recordCount: 1,
    },
    oooDaysByTypeMonthly: {
      months: ["2026-08"],
      series: [{ recordType: "wfh", values: [2] }],
    },
    oooTypeDonut: [
      { days: 2, label: "WFH", percentage: 100, recordType: "wfh" },
    ],
    range: {
      end: new Date("2027-01-01T00:00:00.000Z"),
      label: "2026",
      start: new Date("2026-01-01T00:00:00.000Z"),
    },
    summaryStats: {
      averageDaysPerPersonWithOoo: 2,
      mostCommonOooType: "wfh",
      mostCommonOooTypeDays: 2,
      peopleInScope: 1,
      peopleWithOooInPeriod: 1,
      totalOooDays: 2,
      totalRecords: 1,
    },
  };
}

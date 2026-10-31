vi.mock("@repo/auth/helpers", () => ({
  requireAccount: () => Promise.resolve("org_1"),
}));

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregateOutOfOffice: vi.fn(),
  database: { organisation: { findFirst: vi.fn() } },
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePagePermission: vi.fn(),
  resolveDateRange: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  aggregateOutOfOffice: mocks.aggregateOutOfOffice,
  resolveDateRange: mocks.resolveDateRange,
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
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return mocks.database;
}
vi.mock("@/lib/auth/require-page-permission", () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  requirePagePermission: mocks.requirePagePermission,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
  resolveActiveOrgPageContext: mocks.requireActiveOrgPageContext,
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
    mocks.getSession.mockResolvedValue({ role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      accountId: "org_1",
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
        accountId: "org_1",
        filters: {
          includeArchivedPeople: false,
          personType: "employee",
        },
        organisationId: "00000000-0000-4000-8000-000000000001",
      }),
      expect.any(Object)
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
      }),
      expect.any(Object)
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

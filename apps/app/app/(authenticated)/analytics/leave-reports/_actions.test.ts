import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: {
    organisation: { findFirst: vi.fn() },
  },
  exportAnalyticsToCsv: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  listLeaveReportRecordsForDrilldown: vi.fn(),
  resolveDateRange: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  exportAnalyticsToCsv: mocks.exportAnalyticsToCsv,
  listLeaveReportRecordsForDrilldown: mocks.listLeaveReportRecordsForDrilldown,
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
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { exportLeaveReportsCsvAction } = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const accountId = "org_123";
const userId = "user_456";

describe("analytics leave-reports server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_123", role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId, organisationId },
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
    mocks.listLeaveReportRecordsForDrilldown.mockResolvedValue({
      ok: true,
      value: { nextCursor: null, records: [] },
    });
    mocks.exportAnalyticsToCsv.mockReturnValue("name,leave_type\nJohn,Annual");
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.getCurrentUser.mockResolvedValue(null);

      const result = await exportLeaveReportsCsvAction({
        organisationId,
        preset: "this_year",
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to export the leave report.",
        },
        ok: false,
      });
    });

    it("rejects non-manager/admin/owner roles", async () => {
      mocks.getSession.mockResolvedValue({
        accountId: "org_123",
        role: "viewer",
      });

      const result = await exportLeaveReportsCsvAction({
        organisationId,
        preset: "this_year",
      });

      expect(result.ok).toBe(false);
    });

    it("rejects malformed input", async () => {
      const result = await exportLeaveReportsCsvAction({
        organisationId: "not-a-uuid",
        preset: "this_year",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
    });

    it("scopes organisation lookup to account_id and organisation_id", async () => {
      await exportLeaveReportsCsvAction({
        organisationId,
        preset: "this_year",
      });

      expect(mocks.database.organisation.findFirst).toHaveBeenCalledWith({
        select: { timezone: true },
        where: {
          account_id: accountId,
          archived_at: null,
          id: organisationId,
        },
      });
    });
  });

  describe("action specific functionality", () => {
    it("exports CSV report successfully", async () => {
      const result = await exportLeaveReportsCsvAction({
        organisationId,
        preset: "this_year",
      });

      expect(result).toEqual({
        ok: true,
        value: {
          csvContent: "name,leave_type\nJohn,Annual",
          filename: "leave-report-2026-01-01-to-2026-12-31.csv",
        },
      });
      expect(mocks.listLeaveReportRecordsForDrilldown).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          actingUserId: userId,
          organisationId,
          role: "admin",
        }),
        expect.any(Object)
      );
    });

    it.each([
      ["this_month", "2026-08-01", "2026-08-31"],
      ["last_month", "2026-07-01", "2026-07-31"],
      ["this_quarter", "2026-07-01", "2026-09-30"],
      ["last_quarter", "2026-04-01", "2026-06-30"],
      ["this_year", "2026-01-01", "2026-12-31"],
      ["last_year", "2025-01-01", "2025-12-31"],
      ["last_12_months", "2025-08-31", "2026-08-30"],
    ] as const)(
      "exports the %s preset with its resolved filename",
      async (preset, start, inclusiveEnd) => {
        const exclusiveEnd = new Date(`${inclusiveEnd}T00:00:00.000Z`);
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
        mocks.resolveDateRange.mockReturnValueOnce({
          ok: true,
          value: {
            end: exclusiveEnd,
            label: preset,
            start: new Date(`${start}T00:00:00.000Z`),
          },
        });

        const result = await exportLeaveReportsCsvAction({
          organisationId,
          preset,
        });

        expect(mocks.resolveDateRange).toHaveBeenCalledWith({
          customEnd: undefined,
          customStart: undefined,
          preset,
          timezone: "UTC",
        });
        if (!result.ok) {
          throw new Error("Expected the export to succeed.");
        }
        expect(result.value.filename).toBe(
          `leave-report-${start}-to-${inclusiveEnd}.csv`
        );
      }
    );

    it("threads a custom range into the export", async () => {
      mocks.resolveDateRange.mockReturnValueOnce({
        ok: true,
        value: {
          end: new Date("2026-04-01T00:00:00.000Z"),
          label: "1 Mar – 31 Mar 2026",
          start: new Date("2026-03-01T00:00:00.000Z"),
        },
      });
      const result = await exportLeaveReportsCsvAction({
        from: "2026-03-01",
        organisationId,
        preset: "custom",
        to: "2026-03-31",
      });
      expect(mocks.resolveDateRange).toHaveBeenCalledWith({
        customEnd: "2026-03-31",
        customStart: "2026-03-01",
        preset: "custom",
        timezone: "UTC",
      });
      if (!result.ok) {
        throw new Error("Expected the export to succeed.");
      }
      expect(result.value.filename).toBe(
        "leave-report-2026-03-01-to-2026-03-31.csv"
      );
    });

    it("formats resolved boundaries in the organisation timezone", async () => {
      mocks.database.organisation.findFirst.mockResolvedValue({
        id: organisationId,
        timezone: "Australia/Sydney",
      });
      mocks.resolveDateRange.mockReturnValueOnce({
        ok: true,
        value: {
          end: new Date("2026-08-31T14:00:00.000Z"),
          label: "August 2026",
          start: new Date("2026-07-31T14:00:00.000Z"),
        },
      });

      const result = await exportLeaveReportsCsvAction({
        organisationId,
        preset: "this_month",
      });

      if (!result.ok) {
        throw new Error("Expected the export to succeed.");
      }
      expect(result.value.filename).toBe(
        "leave-report-2026-08-01-to-2026-08-31.csv"
      );
    });
  });
});

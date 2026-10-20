import type { ClerkOrgId, OrganisationId } from "@repo/core";
import type { TenantDb } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ reads: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),
  scopedQuery: (account: string, company: string) => ({
    clerk_org_id: account,
    organisation_id: company,
  }),
}));
vi.mock("@repo/feeds", () => ({ materialiseAvailabilityPublication: vi.fn() }));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import { loadWizardInputs } from "../onboarding/wizard-state";
import { listAvailabilityRecords } from "../records/manual-records-service";
import {
  aggregateLeaveReports,
  listLeaveReportRecordsForDrilldown,
} from "./leave-reports-service";
import {
  aggregateOutOfOffice,
  listOutOfOfficeRecordsForDrilldown,
} from "./out-of-office-service";
import { tenantAggregationCache } from "./tenant-request-cache";

const clerkOrgId = "account-A" as ClerkOrgId;
const organisationId = "11111111-1111-4111-8111-111111111111" as OrganisationId;
const input = {
  actingUserId: "user-1",
  clerkOrgId,
  dateRange: {
    end: new Date("2027-01-01"),
    label: "2026",
    start: new Date("2026-01-01"),
  },
  organisationId,
  role: "owner" as const,
};
const cases: { name: string; run: (db: TenantDb) => Promise<unknown> }[] = [
  {
    name: "leave aggregate",
    run: (db) =>
      aggregateLeaveReports({ ...input, includePublicHolidays: false }, db),
  },
  {
    name: "leave drilldown",
    run: (db) =>
      listLeaveReportRecordsForDrilldown(
        { ...input, includePublicHolidays: false },
        db
      ),
  },
  {
    name: "out-of-office aggregate",
    run: (db) => aggregateOutOfOffice(input, db),
  },
  {
    name: "out-of-office drilldown",
    run: (db) => listOutOfOfficeRecordsForDrilldown(input, db),
  },
  {
    name: "manual record list",
    run: (db) =>
      listAvailabilityRecords({ clerkOrgId, organisationId }, undefined, db),
  },
  {
    name: "wizard input",
    run: (db) =>
      loadWizardInputs({ clerkOrgId, organisationId, userId: "user-1" }, db),
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  state.reads.mockResolvedValue([]);
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // The fake delegates provide empty datasets through the real tenant scope issuer.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: { findMany: state.reads },
        organisation: { findFirst: async () => null },
        person: { findFirst: async () => null, findMany: state.reads },
        xeroConnection: { findFirst: async () => null },
        xeroPersonMatch: { count: async () => 0 },
      } as unknown as Prisma.TransactionClient;
      return await run(db);
    }
  );
});
test.each(cases)(
  "$name opens one scope or reuses the caller's scope",
  async ({ run }) => {
    await withTenantDb(clerkOrgId, (db) => run(db));
    expect(state.transaction).toHaveBeenCalledTimes(1);
    state.transaction.mockClear();
    await withTenantDb(clerkOrgId, async (db) => {
      await run(db);
      expect(state.transaction).toHaveBeenCalledTimes(1);
    });
  }
);
test.each(cases)(
  "$name rejects a foreign client before reading",
  async ({ run }) => {
    await expect(
      withTenantDb("account-B", (db) => run(db))
    ).rejects.toBeInstanceOf(TenantMismatchError);
    expect(state.reads).not.toHaveBeenCalled();
  }
);
test("analytics memoisation cannot carry an uncommitted snapshot to another request", async () => {
  let captured: TenantDb | undefined;
  await withTenantDb(clerkOrgId, (db) => {
    captured = db;
    tenantAggregationCache(clerkOrgId, db).set("dataset", ["uncommitted row"]);

    return Promise.resolve();
  });
  await withTenantDb(clerkOrgId, (db) => {
    expect(
      tenantAggregationCache(clerkOrgId, db).get("dataset")
    ).toBeUndefined();

    return Promise.resolve();
  });
  if (!captured) {
    throw new Error("Expected captured client");
  }
  expect(() => tenantAggregationCache(clerkOrgId, captured)).toThrow(
    TenantMismatchError
  );
});

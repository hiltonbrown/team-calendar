import type { ClerkOrgId, OrganisationId } from "@repo/core";
import type { TenantDb } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const state = vi.hoisted(() => ({
  failAudit: false,
  preferences: 0,
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => {
  const core = await vi.importActual<
    typeof import("../../../database/src/tenant-db")
  >("../../../database/src/tenant-db");
  return {
    ...core,
    loadHolidayResolutionData: (
      input: { clerkOrgId: string; from: string; to: string },
      db: Parameters<typeof core.assertTenantDb>[0]
    ) => {
      core.assertTenantDb(db, input.clerkOrgId);
      return Promise.resolve({
        customHolidays: [],
        from: input.from,
        locations: [],
        organisation: { countryCode: "AU", regionCode: null },
        preferences: [],
        to: input.to,
      });
    },
    scopedQuery: (account: string, company: string) => ({
      clerk_org_id: account,
      organisation_id: company,
    }),
  };
});

import { TenantMismatchError, withTenantDb } from "@repo/database";
import {
  exportCsv,
  getEventDetail,
  listEvents,
} from "../settings/audit-log-service";
import {
  listTeamCoverageMinimums,
  updateTeamCoverageMinimum,
} from "../team-coverage/team-coverage-minimums";
import { hidePublicHoliday, restorePublicHoliday } from "./holiday-preferences";
import { addCustomHoliday, deleteCustomHoliday } from "./holiday-service";
import {
  loadHolidaySettings,
  resolvePublicHolidays,
} from "./resolve-public-holidays";

// These fixture identifiers are valid account/company ids, branded at this test boundary.
const clerkOrgId = "account-A" as ClerkOrgId;
const organisationId = "11111111-1111-4111-8111-111111111111" as OrganisationId;
const holidayId = "22222222-2222-4222-8222-222222222222";
const scope = { clerkOrgId, organisationId };
const actor = {
  ...scope,
  actingRole: "owner" as const,
  actingUserId: "user-1",
};
const holidayRange = { ...scope, from: "2026-01-01", to: "2026-12-31" };
const cases: { name: string; run: (db: TenantDb) => Promise<unknown> }[] = [
  {
    name: "holiday resolution",
    run: (db) => resolvePublicHolidays(holidayRange, undefined, db),
  },
  {
    name: "holiday settings",
    run: (db) => loadHolidaySettings(holidayRange, undefined, db),
  },
  {
    name: "add custom holiday",
    run: (db) =>
      addCustomHoliday(
        {
          ...scope,
          appliesToAllJurisdictions: true,
          countryCode: null,
          date: new Date("2026-10-15"),
          name: "Custom day",
          regionCode: null,
          userId: "user-1",
        },
        db
      ),
  },
  {
    name: "delete custom holiday",
    run: (db) => deleteCustomHoliday(clerkOrgId, organisationId, holidayId, db),
  },
  {
    name: "hide custom holiday",
    run: (db) =>
      hidePublicHoliday(
        { ...actor, holidayKey: `custom:${holidayId}`, locationId: null },
        db
      ),
  },
  {
    name: "restore custom holiday",
    run: (db) =>
      restorePublicHoliday(
        { ...actor, holidayKey: `custom:${holidayId}`, locationId: null },
        db
      ),
  },
  { name: "audit list", run: (db) => listEvents(actor, db) },
  {
    name: "audit detail",
    run: (db) => getEventDetail({ ...actor, eventId: holidayId }, db),
  },
  { name: "audit export", run: (db) => exportCsv(actor, db) },
  { name: "coverage list", run: (db) => listTeamCoverageMinimums(actor, db) },
  {
    name: "coverage mutation",
    run: (db) =>
      updateTeamCoverageMinimum(
        { ...actor, minimum: null, teamId: holidayId },
        db
      ),
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  state.failAudit = false;
  state.preferences = 0;
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const before = state.preferences;
      // Pool fake models atomic preference/audit persistence through the real scope implementation.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        auditEvent: {
          count: async () => 0,
          create: async () => {
            if (state.failAudit) {
              throw new Error("Injected audit failure");
            }
            return await { id: holidayId };
          },
          findFirst: async () => null,
          findMany: async () => [],
        },
        publicHoliday: {
          create: async () => ({ id: holidayId }),
          delete: async () => ({ id: holidayId }),
          findFirst: async () => ({
            default_classification: "non_working",
            id: holidayId,
            name: "Custom day",
          }),
        },
        publicHolidayPreference: {
          createMany: async () => {
            state.preferences += 1;
            return await { count: 1 };
          },
          deleteMany: async () => ({ count: 0 }),
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
        },
        team: { findMany: async () => [] },
      } as unknown as Prisma.TransactionClient;
      try {
        return await run(db);
      } catch (error) {
        state.preferences = before;
        throw error;
      }
    }
  );
});
test.each(cases)(
  "$name opens one scope or reuses the caller scope",
  async ({ run }) => {
    await withTenantDb(scope.clerkOrgId, (db) => run(db));
    expect(state.transaction).toHaveBeenCalledTimes(1);
    state.transaction.mockClear();
    await withTenantDb(clerkOrgId, async (db) => {
      await run(db);
      expect(state.transaction).toHaveBeenCalledTimes(1);
    });
  }
);
test.each(cases)("$name rejects a foreign client", async ({ run }) => {
  await expect(
    withTenantDb("account-B", (db) => run(db))
  ).rejects.toBeInstanceOf(TenantMismatchError);
});
test("holiday preference audit failure rolls back the insertion", async () => {
  state.failAudit = true;
  const result = withTestTenantResult(
    tenantTestAccount({
      ...actor,
      holidayKey: `custom:${holidayId}`,
      locationId: null,
    }),
    (db) =>
      hidePublicHoliday(
        {
          ...actor,
          holidayKey: `custom:${holidayId}`,
          locationId: null,
        },
        db
      )
  );
  await expect(result).rejects.toThrow("Injected audit failure");
  expect(state.preferences).toBe(0);
});

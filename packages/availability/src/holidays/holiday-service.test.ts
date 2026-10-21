import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({
  publicHoliday: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
  publicHolidayPreference: { deleteMany: vi.fn() },
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),

  scopedQuery: vi.fn((clerk: string, organisation: string) => ({
    clerk_org_id: clerk,
    organisation_id: organisation,
  })),
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...database,
  };
}

import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it } from "vitest";
import { addCustomHoliday, deleteCustomHoliday } from "./holiday-service";

const clerkOrgId = "org_123" as ClerkOrgId;
const organisationId = "123e4567-e89b-12d3-a456-426614174000" as OrganisationId;
const base = {
  appliesToAllJurisdictions: false,
  clerkOrgId,
  countryCode: "AU",
  date: new Date("2026-03-02T00:00:00.000Z"),
  name: "Founders Day",
  organisationId,
  regionCode: "QLD",
  userId: "user_123",
};

describe("holiday-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
    vi.mocked(database.publicHoliday.create).mockResolvedValue({
      id: "h-1",
    } as never);
  });

  describe("addCustomHoliday", () => {
    it("stores a custom holiday with its own country and region", async () => {
      const result = await withTestTenantResult(tenantTestAccount(base), (db) =>
        addCustomHoliday(base, db)
      );
      expect(result).toEqual({ ok: true, value: { id: "h-1" } });
      expect(database.publicHoliday.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerk_org_id: clerkOrgId,
          country_code: "AU",
          holiday_date: new Date("2026-03-02T00:00:00.000Z"),
          holiday_type: "custom",
          name: "Founders Day",
          organisation_id: organisationId,
          region_code: "QLD",
          source: "manual",
        }),
        select: { id: true },
      });
    });

    it("applies everywhere when the holiday covers all jurisdictions", async () => {
      await withTestTenantResult(
        tenantTestAccount({
          ...base,
          appliesToAllJurisdictions: true,
          countryCode: null,
          regionCode: null,
        }),
        (db) =>
          addCustomHoliday(
            {
              ...base,
              appliesToAllJurisdictions: true,
              countryCode: null,
              regionCode: null,
            },
            db
          )
      );
      expect(database.publicHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            country_code: "CUSTOM",
            region_code: null,
          }),
        })
      );
    });

    it("rejects unsupported countries and regions from another country", async () => {
      expect(
        await withTestTenantResult(
          tenantTestAccount({ ...base, countryCode: "US", regionCode: null }),
          (db) =>
            addCustomHoliday(
              { ...base, countryCode: "US", regionCode: null },
              db
            )
        )
      ).toMatchObject({
        error: { code: "bad_request" },
        ok: false,
      });
      expect(
        await withTestTenantResult(
          tenantTestAccount({ ...base, regionCode: "SCT" }),
          (db) => addCustomHoliday({ ...base, regionCode: "SCT" }, db)
        )
      ).toMatchObject({
        error: { code: "bad_request" },
        ok: false,
      });
      expect(database.publicHoliday.create).not.toHaveBeenCalled();
    });

    it("rejects a duplicate name and date within the organisation", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "existing",
      } as never);
      const result = await withTestTenantResult(tenantTestAccount(base), (db) =>
        addCustomHoliday(base, db)
      );
      expect(result).toMatchObject({ error: { code: "conflict" }, ok: false });
      expect(
        vi.mocked(database.publicHoliday.findFirst).mock.calls[0]?.[0]?.where
      ).toMatchObject({
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
        source: "manual",
        source_remote_id: "custom:2026-03-02:founders day",
      });
    });
  });

  describe("deleteCustomHoliday", () => {
    it("deletes the holiday and its preferences within the organisation", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "h-1",
      } as never);
      const result = await withTestTenantResult(
        tenantTestAccount(clerkOrgId),
        (db) => deleteCustomHoliday(clerkOrgId, organisationId, "h-1", db)
      );
      expect(result).toEqual({ ok: true, value: { id: "h-1" } });
      expect(database.publicHolidayPreference.deleteMany).toHaveBeenCalledWith({
        where: {
          clerk_org_id: clerkOrgId,
          holiday_key: "custom:h-1",
          organisation_id: organisationId,
        },
      });
      expect(database.publicHoliday.delete).toHaveBeenCalledWith({
        where: {
          clerk_org_id: clerkOrgId,
          id: "h-1",
          organisation_id: organisationId,
        },
      });
    });

    it("returns not_found for holidays outside the organisation", async () => {
      const result = await withTestTenantResult(
        tenantTestAccount(clerkOrgId),
        (db) => deleteCustomHoliday(clerkOrgId, organisationId, "h-x", db)
      );
      expect(result).toMatchObject({ error: { code: "not_found" }, ok: false });
      expect(database.publicHoliday.delete).not.toHaveBeenCalled();
    });
  });
});

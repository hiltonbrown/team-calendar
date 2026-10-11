import { vi } from "vitest";

vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({
  publicHoliday: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
  publicHolidayPreference: { deleteMany: vi.fn() },
}));
vi.mock("@repo/database", () => ({
  scopedQuery: vi.fn((clerk: string, organisation: string) => ({
    clerk_org_id: clerk,
    organisation_id: organisation,
  })),
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return database;
  }),
  tenantTransaction: vi.fn(
    async (
      accountId: string,
      callback: (client: typeof database) => Promise<unknown>
    ) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return await callback(database);
    }
  ),
}));

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
      const result = await addCustomHoliday(base);
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
      await addCustomHoliday({
        ...base,
        appliesToAllJurisdictions: true,
        countryCode: null,
        regionCode: null,
      });
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
        await addCustomHoliday({ ...base, countryCode: "US", regionCode: null })
      ).toMatchObject({
        error: { code: "bad_request" },
        ok: false,
      });
      expect(
        await addCustomHoliday({ ...base, regionCode: "SCT" })
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
      const result = await addCustomHoliday(base);
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
      const result = await deleteCustomHoliday(
        clerkOrgId,
        organisationId,
        "h-1"
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
      const result = await deleteCustomHoliday(
        clerkOrgId,
        organisationId,
        "h-x"
      );
      expect(result).toMatchObject({ error: { code: "not_found" }, ok: false });
      expect(database.publicHoliday.delete).not.toHaveBeenCalled();
    });
  });
});

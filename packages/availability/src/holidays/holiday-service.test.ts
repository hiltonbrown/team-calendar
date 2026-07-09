// vi.mock calls are hoisted to the top by Vitest's transformer.
// We must mock all @repo/database paths before any static imports.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database/generated/enums", () => ({}));
vi.mock("@repo/database/generated/client", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    organisation: {
      findFirst: vi.fn(),
    },
    publicHoliday: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    publicHolidayJurisdiction: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  // scopedQuery must always return an object so spread works; use mockImplementation
  // rather than mockReturnValue so it survives vi.clearAllMocks (which only clears calls).
  scopedQuery: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("./nager-client", () => ({
  getPublicHolidays: vi.fn(),
}));

import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { database } from "@repo/database";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addCustomHoliday,
  deleteCustomHoliday,
  ensureDefaultPublicHolidaysForOrganisation,
  importForJurisdiction,
  restoreHoliday,
  suppressHoliday,
} from "./holiday-service";
import { getPublicHolidays } from "./nager-client";

describe("holiday-service", () => {
  const mockClerkOrgId = "org_123" as ClerkOrgId;
  const mockOrgId = "123e4567-e89b-12d3-a456-426614174000" as OrganisationId;
  const mockUserId = "user_123";

  beforeEach(() => {
    // Reset call history without clearing mock implementations.
    vi.clearAllMocks();
    vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue({
      id: "jurisdiction_123",
    } as never);
    vi.mocked(database.publicHolidayJurisdiction.update).mockResolvedValue({
      id: "jurisdiction_123",
    } as never);
    vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
      id: "jurisdiction_123",
    } as never);
    vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
    vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
      id: "holiday_123",
    } as never);
  });

  describe("importForJurisdiction", () => {
    it("imports globals and skips regional holidays when region is null", async () => {
      vi.mocked(getPublicHolidays).mockResolvedValue({
        ok: true,
        value: [
          {
            date: "2026-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            countryCode: "AU",
            fixed: true,
            global: true,
            counties: null,
            launchYear: null,
            types: ["Public"],
          },
          {
            date: "2026-08-12",
            localName: "Ekka",
            name: "Royal Queensland Show",
            countryCode: "AU",
            fixed: false,
            global: false,
            counties: ["AU-QLD"],
            launchYear: null,
            types: ["Public"],
          },
        ],
      });

      const result = await importForJurisdiction({
        clerkOrgId: mockClerkOrgId,
        countryCode: "AU",
        organisationId: mockOrgId,
        regionCode: null,
        userId: mockUserId,
        year: 2026,
      });

      expect(result.ok).toBe(true);
      expect(database.publicHoliday.upsert).toHaveBeenCalledTimes(1);
      expect(getPublicHolidays).toHaveBeenCalledWith("AU", 2026);
    });

    it("imports global and matching regional holidays for prefixed county codes", async () => {
      vi.mocked(getPublicHolidays).mockResolvedValue({
        ok: true,
        value: [
          {
            date: "2026-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            countryCode: "AU",
            fixed: true,
            global: true,
            counties: null,
            launchYear: null,
            types: ["Public"],
          },
          {
            date: "2026-08-12",
            localName: "Ekka",
            name: "Royal Queensland Show",
            countryCode: "AU",
            fixed: false,
            global: false,
            counties: ["AU-QLD"],
            launchYear: null,
            types: ["Public"],
          },
          {
            date: "2026-10-05",
            localName: "Labour Day",
            name: "Labour Day",
            countryCode: "AU",
            fixed: false,
            global: false,
            counties: ["AU-NSW"],
            launchYear: null,
            types: ["Public"],
          },
        ],
      });

      const result = await importForJurisdiction({
        clerkOrgId: mockClerkOrgId,
        countryCode: "AU",
        organisationId: mockOrgId,
        regionCode: "QLD",
        userId: mockUserId,
        year: 2026,
      });

      expect(result.ok).toBe(true);
      expect(database.publicHoliday.upsert).toHaveBeenCalledTimes(2);
      expect(database.publicHoliday.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          create: expect.objectContaining({
            source_remote_id: "AU:QLD:2026-08-12:royal queensland show",
          }),
        })
      );
    });

    it("uses GB when fetching UK holidays while persisting UK country code", async () => {
      vi.mocked(getPublicHolidays).mockResolvedValue({
        ok: true,
        value: [
          {
            date: "2026-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            countryCode: "GB",
            fixed: true,
            global: true,
            counties: null,
            launchYear: null,
            types: ["Bank"],
          },
        ],
      });

      const result = await importForJurisdiction({
        clerkOrgId: mockClerkOrgId,
        countryCode: "UK",
        organisationId: mockOrgId,
        regionCode: null,
        userId: mockUserId,
        year: 2026,
      });

      expect(result.ok).toBe(true);
      expect(getPublicHolidays).toHaveBeenCalledWith("GB", 2026);
      expect(database.publicHoliday.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ country_code: "UK" }),
        })
      );
      expect(database.publicHolidayJurisdiction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ updated_by_user_id: mockUserId }),
        })
      );
    });
  });

  describe("addCustomHoliday", () => {
    it("should create a custom holiday when it does not exist", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.create).mockResolvedValue({
        id: "holiday_123",
      } as never);

      const result = await addCustomHoliday({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
        jurisdictionId: null,
        name: "Test Holiday",
        date: new Date("2024-12-25"),
        recursAnnually: false,
        appliesToAllJurisdictions: true,
        userId: mockUserId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("holiday_123");
      }
      expect(database.publicHoliday.create).toHaveBeenCalled();
    });

    it("should return conflict error if holiday already exists", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "existing_id",
      } as never);

      const result = await addCustomHoliday({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
        jurisdictionId: null,
        name: "Test Holiday",
        date: new Date("2024-12-25"),
        recursAnnually: false,
        appliesToAllJurisdictions: true,
        userId: mockUserId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("conflict");
      }
    });
  });

  describe("suppressHoliday", () => {
    it("should archive the holiday", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "holiday_123",
      } as never);
      vi.mocked(database.publicHoliday.update).mockResolvedValue({
        id: "holiday_123",
      } as never);

      const result = await suppressHoliday(
        mockClerkOrgId,
        mockOrgId,
        "holiday_123",
        mockUserId
      );

      expect(result.ok).toBe(true);
      expect(database.publicHoliday.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ archived_at: expect.any(Date) }),
        })
      );
    });

    it("should return not found if holiday does not exist", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);

      const result = await suppressHoliday(
        mockClerkOrgId,
        mockOrgId,
        "holiday_123",
        mockUserId
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_found");
      }
    });
  });

  describe("restoreHoliday", () => {
    it("should un-archive the holiday", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "holiday_123",
      } as never);
      vi.mocked(database.publicHoliday.update).mockResolvedValue({
        id: "holiday_123",
      } as never);

      const result = await restoreHoliday(
        mockClerkOrgId,
        mockOrgId,
        "holiday_123",
        mockUserId
      );

      expect(result.ok).toBe(true);
      expect(database.publicHoliday.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ archived_at: null }),
        })
      );
    });
  });

  describe("deleteCustomHoliday", () => {
    it("should delete a manual holiday", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "holiday_123",
        source: "manual",
      } as never);

      const result = await deleteCustomHoliday(
        mockClerkOrgId,
        mockOrgId,
        "holiday_123"
      );

      expect(result.ok).toBe(true);
      expect(database.publicHoliday.delete).toHaveBeenCalledWith({
        where: { id: "holiday_123" },
      });
    });

    it("should reject deleting a nager-imported holiday", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue({
        id: "holiday_123",
        source: "nager",
      } as never);

      const result = await deleteCustomHoliday(
        mockClerkOrgId,
        mockOrgId,
        "holiday_123"
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("forbidden");
      }
      expect(database.publicHoliday.delete).not.toHaveBeenCalled();
    });
  });

  describe("ensureDefaultPublicHolidaysForOrganisation", () => {
    it("imports current and next year when no nager rows exist", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
      vi.mocked(database.organisation.findFirst).mockResolvedValue({
        country_code: "AU",
        region_code: null,
      } as never);
      vi.mocked(database.publicHoliday.count).mockResolvedValue(0);
      vi.mocked(getPublicHolidays).mockResolvedValue({
        ok: true,
        value: [
          {
            date: "2026-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            countryCode: "AU",
            fixed: true,
            global: true,
            counties: null,
            launchYear: null,
            types: ["Public"],
          },
        ],
      });

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.importedYears).toEqual([2026, 2027]);
      }
      expect(getPublicHolidays).toHaveBeenCalledWith("AU", 2026);
      expect(getPublicHolidays).toHaveBeenCalledWith("AU", 2027);
      vi.useRealTimers();
    });

    it("skips years that already have nager rows including archived records", async () => {
      vi.mocked(database.organisation.findFirst).mockResolvedValue({
        country_code: "AU",
        region_code: null,
      } as never);
      vi.mocked(database.publicHoliday.count)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      vi.mocked(getPublicHolidays).mockResolvedValue({
        ok: true,
        value: [
          {
            date: "2027-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            countryCode: "AU",
            fixed: true,
            global: true,
            counties: null,
            launchYear: null,
            types: ["Public"],
          },
        ],
      });

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
        years: [2026, 2027],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.skippedYears).toEqual([2026]);
        expect(result.value.importedYears).toEqual([2027]);
      }
      expect(database.publicHoliday.count).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            country_code: "AU",
            region_code: null,
            source: "nager",
          }),
        })
      );
      expect(getPublicHolidays).toHaveBeenCalledTimes(1);
      expect(getPublicHolidays).toHaveBeenCalledWith("AU", 2027);
    });

    it("returns not_found when organisation is missing", async () => {
      vi.mocked(database.organisation.findFirst).mockResolvedValue(null);

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
        years: [2026],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_found");
      }
    });

    it("uses the system actor when userId is absent", async () => {
      vi.mocked(database.organisation.findFirst).mockResolvedValue({
        country_code: "AU",
        region_code: null,
      } as never);
      vi.mocked(database.publicHoliday.count).mockResolvedValue(0);
      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(getPublicHolidays).mockResolvedValue({
        ok: true,
        value: [
          {
            date: "2026-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            countryCode: "AU",
            fixed: true,
            global: true,
            counties: null,
            launchYear: null,
            types: ["Public"],
          },
        ],
      });

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
        years: [2026],
      });

      expect(result.ok).toBe(true);
      expect(database.publicHolidayJurisdiction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            created_by_user_id: "system:default-public-holidays",
            updated_by_user_id: "system:default-public-holidays",
          }),
        })
      );
    });
  });
});

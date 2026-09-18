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
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    publicHolidayJurisdiction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  // scopedQuery must always return an object so spread works; use mockImplementation
  // rather than mockReturnValue so it survives vi.clearAllMocks (which only clears calls).
  scopedQuery: vi.fn().mockImplementation(() => ({})),
}));

const nagerMock = vi.hoisted(() => ({
  getPublicHolidays: vi.fn(),
}));
vi.mock("./nager-client", () => nagerMock);

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

describe("holiday-service", () => {
  const mockClerkOrgId = "org_123" as ClerkOrgId;
  const mockOrgId = "123e4567-e89b-12d3-a456-426614174000" as OrganisationId;
  const mockUserId = "user_123";

  beforeEach(() => {
    // Reset call history without clearing mock implementations.
    vi.clearAllMocks();
  });

  describe("addCustomHoliday", () => {
    it("should create a custom holiday when it does not exist", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.create).mockResolvedValue({
        id: "holiday_123",
      } as never);

      const result = await addCustomHoliday({
        appliesToAllJurisdictions: true,
        clerkOrgId: mockClerkOrgId,
        date: new Date("2024-12-25"),
        jurisdictionId: null,
        name: "Test Holiday",
        organisationId: mockOrgId,
        recursAnnually: false,
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
        appliesToAllJurisdictions: true,
        clerkOrgId: mockClerkOrgId,
        date: new Date("2024-12-25"),
        jurisdictionId: null,
        name: "Test Holiday",
        organisationId: mockOrgId,
        recursAnnually: false,
        userId: mockUserId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("conflict");
      }
    });

    it("creates a jurisdiction-scoped holiday for an active scoped jurisdiction", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        { id: "jurisdiction_123" } as never
      );
      vi.mocked(database.publicHoliday.create).mockResolvedValue({
        id: "holiday_123",
      } as never);

      const result = await addCustomHoliday({
        appliesToAllJurisdictions: false,
        clerkOrgId: mockClerkOrgId,
        date: new Date("2024-12-25"),
        jurisdictionId: "jurisdiction_123",
        name: "State holiday",
        organisationId: mockOrgId,
        recursAnnually: false,
        userId: mockUserId,
      });

      expect(result.ok).toBe(true);
      expect(database.publicHolidayJurisdiction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "jurisdiction_123" }),
        })
      );
    });

    it("rejects a jurisdiction outside the active organisation", async () => {
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );

      const result = await addCustomHoliday({
        appliesToAllJurisdictions: false,
        clerkOrgId: mockClerkOrgId,
        date: new Date("2024-12-25"),
        jurisdictionId: "jurisdiction_other",
        name: "State holiday",
        organisationId: mockOrgId,
        recursAnnually: false,
        userId: mockUserId,
      });

      expect(result).toMatchObject({
        error: { code: "bad_request" },
        ok: false,
      });
      expect(database.publicHoliday.create).not.toHaveBeenCalled();
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

  describe("importForJurisdiction", () => {
    beforeEach(() => {
      nagerMock.getPublicHolidays.mockReset();
    });

    it("AU with regionCode: null imports a global holiday and skips an AU-QLD holiday", async () => {
      nagerMock.getPublicHolidays.mockResolvedValue({
        ok: true,
        value: [
          {
            counties: null,
            countryCode: "AU",
            date: "2026-01-01",
            fixed: true,
            global: true,
            localName: "New Year's Day",
            name: "New Year's Day",
            types: ["Public"],
          },
          {
            counties: ["AU-QLD"],
            countryCode: "AU",
            date: "2026-04-25",
            fixed: true,
            global: false,
            localName: "Anzac Day",
            name: "Anzac Day",
            types: ["Public"],
          },
        ],
      });

      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
        id: "jur_123",
      } as never);
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
        id: "hol_1",
      } as never);

      const result = await importForJurisdiction({
        clerkOrgId: mockClerkOrgId,
        countryCode: "AU",
        organisationId: mockOrgId,
        regionCode: null,
        userId: mockUserId,
        year: 2026,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.importedCount).toBe(1);
        expect(result.value.skippedCount).toBe(0);
      }
      expect(nagerMock.getPublicHolidays).toHaveBeenCalledWith("AU", 2026);
      expect(database.publicHoliday.upsert).toHaveBeenCalledTimes(1);
    });

    it("AU with regionCode: QLD imports a global holiday and an AU-QLD holiday, but skips AU-NSW", async () => {
      nagerMock.getPublicHolidays.mockResolvedValue({
        ok: true,
        value: [
          {
            counties: null,
            countryCode: "AU",
            date: "2026-01-01",
            fixed: true,
            global: true,
            localName: "New Year's Day",
            name: "New Year's Day",
            types: ["Public"],
          },
          {
            counties: ["AU-QLD"],
            countryCode: "AU",
            date: "2026-04-25",
            fixed: true,
            global: false,
            localName: "Anzac Day",
            name: "Anzac Day",
            types: ["Public"],
          },
          {
            counties: ["AU-NSW"],
            countryCode: "AU",
            date: "2026-10-05",
            fixed: true,
            global: false,
            localName: "Labour Day",
            name: "Labour Day",
            types: ["Public"],
          },
        ],
      });

      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
        id: "jur_123",
      } as never);
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
        id: "hol_1",
      } as never);

      const result = await importForJurisdiction({
        clerkOrgId: mockClerkOrgId,
        countryCode: "AU",
        organisationId: mockOrgId,
        regionCode: "QLD",
        userId: mockUserId,
        year: 2026,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.importedCount).toBe(2);
        expect(result.value.skippedCount).toBe(0);
      }
      expect(database.publicHoliday.upsert).toHaveBeenCalledTimes(2);
    });

    it("UK calls getPublicHolidays('GB', year) while created rows keep country_code: 'UK'", async () => {
      nagerMock.getPublicHolidays.mockResolvedValue({
        ok: true,
        value: [
          {
            counties: null,
            countryCode: "GB",
            date: "2026-01-01",
            fixed: true,
            global: true,
            localName: "New Year's Day",
            name: "New Year's Day",
            types: ["Public"],
          },
        ],
      });

      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
        id: "jur_123",
      } as never);
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
        id: "hol_1",
      } as never);

      const result = await importForJurisdiction({
        clerkOrgId: mockClerkOrgId,
        countryCode: "UK",
        organisationId: mockOrgId,
        regionCode: null,
        userId: mockUserId,
        year: 2026,
      });

      expect(result.ok).toBe(true);
      expect(nagerMock.getPublicHolidays).toHaveBeenCalledWith("GB", 2026);
      expect(database.publicHolidayJurisdiction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            country_code: "UK",
          }),
        })
      );
      expect(database.publicHoliday.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            country_code: "UK",
          }),
        })
      );
    });
  });

  describe("ensureDefaultPublicHolidaysForOrganisation", () => {
    beforeEach(() => {
      nagerMock.getPublicHolidays.mockReset();
      vi.mocked(database.organisation.findFirst).mockReset();
      vi.mocked(database.publicHoliday.count).mockReset();
      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockReset();
      vi.mocked(database.publicHolidayJurisdiction.create).mockReset();
      vi.mocked(database.publicHoliday.findFirst).mockReset();
      vi.mocked(database.publicHoliday.upsert).mockReset();
    });

    it("Imports current and next year when there are no existing Nager holiday rows", async () => {
      const currentYear = new Date().getUTCFullYear();

      vi.mocked(database.organisation.findFirst).mockResolvedValue({
        country_code: "AU",
        region_code: "QLD",
      } as never);

      vi.mocked(database.publicHoliday.count).mockResolvedValue(0);

      nagerMock.getPublicHolidays.mockResolvedValue({
        ok: true,
        value: [],
      });

      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
        id: "jur_123",
      } as never);
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
        id: "hol_1",
      } as never);

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.importedYears).toEqual([
          currentYear,
          currentYear + 1,
        ]);
        expect(result.value.skippedYears).toEqual([]);
      }
      expect(nagerMock.getPublicHolidays).toHaveBeenCalledWith(
        "AU",
        currentYear
      );
      expect(nagerMock.getPublicHolidays).toHaveBeenCalledWith(
        "AU",
        currentYear + 1
      );
    });

    it("Skips a year that already has at least one Nager row, including archived rows", async () => {
      const currentYear = new Date().getUTCFullYear();

      vi.mocked(database.organisation.findFirst).mockResolvedValue({
        country_code: "AU",
        region_code: "QLD",
      } as never);

      // first call (currentYear) count > 0 -> skip
      // second call (currentYear + 1) count = 0 -> import
      vi.mocked(database.publicHoliday.count)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      nagerMock.getPublicHolidays.mockResolvedValue({
        ok: true,
        value: [],
      });

      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
        id: "jur_123",
      } as never);
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
        id: "hol_1",
      } as never);

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.importedYears).toEqual([currentYear + 1]);
        expect(result.value.skippedYears).toEqual([currentYear]);
      }
      expect(nagerMock.getPublicHolidays).not.toHaveBeenCalledWith(
        "AU",
        currentYear
      );
      expect(nagerMock.getPublicHolidays).toHaveBeenCalledWith(
        "AU",
        currentYear + 1
      );
    });

    it("Returns not_found when the organisation is missing", async () => {
      vi.mocked(database.organisation.findFirst).mockResolvedValue(null);

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_found");
      }
    });

    it("Uses the system actor when userId is absent", async () => {
      const currentYear = new Date().getUTCFullYear();

      vi.mocked(database.organisation.findFirst).mockResolvedValue({
        country_code: "AU",
        region_code: "QLD",
      } as never);

      vi.mocked(database.publicHoliday.count).mockResolvedValue(0);

      nagerMock.getPublicHolidays.mockResolvedValue({
        ok: true,
        value: [
          {
            counties: null,
            countryCode: "AU",
            date: "2026-01-01",
            fixed: true,
            global: true,
            localName: "New Year's Day",
            name: "New Year's Day",
            types: ["Public"],
          },
        ],
      });

      vi.mocked(database.publicHolidayJurisdiction.findFirst).mockResolvedValue(
        null
      );
      vi.mocked(database.publicHolidayJurisdiction.create).mockResolvedValue({
        id: "jur_123",
      } as never);
      vi.mocked(database.publicHoliday.findFirst).mockResolvedValue(null);
      vi.mocked(database.publicHoliday.upsert).mockResolvedValue({
        id: "hol_1",
      } as never);

      const result = await ensureDefaultPublicHolidaysForOrganisation({
        clerkOrgId: mockClerkOrgId,
        organisationId: mockOrgId,
        years: [currentYear],
      });

      expect(result.ok).toBe(true);
      expect(database.publicHolidayJurisdiction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            created_by_user_id: "system:default-public-holidays",
          }),
        })
      );
    });
  });
});

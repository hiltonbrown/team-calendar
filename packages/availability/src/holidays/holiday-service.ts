import {
  appError,
  type ClerkOrgId,
  type OrganisationId,
  type Result,
  startOfUtcDay,
} from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type { public_holiday_type } from "@repo/database/generated/enums";
import { getPublicHolidays } from "./nager-client";

export interface ImportHolidaysInput {
  clerkOrgId: ClerkOrgId;
  countryCode: string;
  organisationId: OrganisationId;
  regionCode: string | null;
  userId: string;
  year: number;
}

export interface AddCustomHolidayInput {
  appliesToAllJurisdictions: boolean;
  clerkOrgId: ClerkOrgId;
  date: Date;
  jurisdictionId: string | null;
  name: string;
  organisationId: OrganisationId;
  recursAnnually: boolean;
  userId: string;
}

function nagerCountryCodeFor(countryCode: string): string {
  if (countryCode === "UK") {
    return "GB";
  }
  return countryCode;
}

function nagerCountyCodeFor(countryCode: string, regionCode: string): string {
  return `${nagerCountryCodeFor(countryCode)}-${regionCode}`;
}

function sourceRemoteIdForHoliday(
  countryCode: string,
  regionCode: string | null,
  date: string,
  name: string
): string {
  const region = regionCode ?? "national";
  return `${countryCode}:${region}:${date}:${name.toLowerCase()}`;
}

function normaliseHolidayType(value: string | undefined): public_holiday_type {
  switch (value?.toLowerCase()) {
    case "bank":
      return "bank";
    case "school":
      return "school";
    case "authorities":
      return "authorities";
    case "optional":
      return "optional";
    case "observance":
      return "observance";
    default:
      return "public";
  }
}

export async function importForJurisdiction(
  input: ImportHolidaysInput
): Promise<Result<{ importedCount: number; skippedCount: number }>> {
  try {
    const holidaysResult = await getPublicHolidays(
      nagerCountryCodeFor(input.countryCode),
      input.year
    );
    if (!holidaysResult.ok) {
      return holidaysResult;
    }

    const holidays = holidaysResult.value.filter((h) => {
      if (h.global) {
        return true;
      }
      if (!input.regionCode) {
        return false;
      }
      return (
        h.counties?.includes(
          nagerCountyCodeFor(input.countryCode, input.regionCode)
        ) ?? false
      );
    });

    const existingJurisdiction =
      await database.publicHolidayJurisdiction.findFirst({
        where: {
          ...scopedQuery(input.clerkOrgId, input.organisationId),
          country_code: input.countryCode,
          region_code: input.regionCode,
        },
        select: { id: true },
      });

    const jurisdiction = existingJurisdiction
      ? await database.publicHolidayJurisdiction.update({
          where: { id: existingJurisdiction.id },
          data: {
            archived_at: null,
            is_enabled: true,
            updated_by_user_id: input.userId,
          },
          select: { id: true },
        })
      : await database.publicHolidayJurisdiction.create({
          data: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            country_code: input.countryCode,
            region_code: input.regionCode,
            source: "nager",
            created_by_user_id: input.userId,
            updated_by_user_id: input.userId,
          },
          select: { id: true },
        });

    let importedCount = 0;
    let skippedCount = 0;

    for (const holiday of holidays) {
      const sourceRemoteId = sourceRemoteIdForHoliday(
        input.countryCode,
        input.regionCode,
        holiday.date,
        holiday.name
      );

      const existing = await database.publicHoliday.findFirst({
        where: {
          ...scopedQuery(input.clerkOrgId, input.organisationId),
          source: "nager",
          source_remote_id: sourceRemoteId,
        },
        select: { id: true },
      });

      await database.publicHoliday.upsert({
        where: {
          organisation_id_source_source_remote_id: {
            organisation_id: input.organisationId,
            source: "nager",
            source_remote_id: sourceRemoteId,
          },
        },
        create: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          jurisdiction_id: jurisdiction.id,
          source: "nager",
          source_remote_id: sourceRemoteId,
          country_code: input.countryCode,
          region_code: input.regionCode,
          holiday_date: startOfUtcDay(holiday.date),
          name: holiday.name,
          local_name: holiday.localName,
          holiday_type: normaliseHolidayType(holiday.types?.[0]),
          default_classification: "non_working",
          source_payload_json: holiday,
          created_by_user_id: input.userId,
          updated_by_user_id: input.userId,
        },
        update: {
          jurisdiction_id: jurisdiction.id,
          name: holiday.name,
          local_name: holiday.localName,
          holiday_type: normaliseHolidayType(holiday.types?.[0]),
          source_payload_json: holiday,
          updated_by_user_id: input.userId,
        },
        select: { id: true },
      });

      if (existing) {
        skippedCount += 1;
      } else {
        importedCount += 1;
      }
    }

    return {
      ok: true,
      value: { importedCount, skippedCount },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to import holidays"),
    };
  }
}

export async function addCustomHoliday(
  input: AddCustomHolidayInput
): Promise<Result<{ id: string }>> {
  try {
    const holidayDate = startOfUtcDay(
      input.date.toISOString().split("T")[0] as string
    );
    const sourceRemoteId = `custom:${holidayDate.toISOString().split("T")[0]}:${input.name.toLowerCase()}`;

    const existing = await database.publicHoliday.findFirst({
      where: {
        ...scopedQuery(input.clerkOrgId, input.organisationId),
        source: "manual",
        source_remote_id: sourceRemoteId,
      },
    });

    if (existing) {
      return {
        ok: false,
        error: appError(
          "conflict",
          "A custom holiday with this name and date already exists"
        ),
      };
    }

    const holiday = await database.publicHoliday.create({
      data: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        jurisdiction_id: input.appliesToAllJurisdictions
          ? null
          : input.jurisdictionId,
        source: "manual",
        source_remote_id: sourceRemoteId,
        country_code: "CUSTOM", // A placeholder or we could resolve it from org
        holiday_date: holidayDate,
        name: input.name,
        holiday_type: "custom",
        default_classification: "non_working",
        created_by_user_id: input.userId,
        updated_by_user_id: input.userId,
      },
    });

    return {
      ok: true,
      value: { id: holiday.id },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to add custom holiday"),
    };
  }
}

export async function suppressHoliday(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  holidayId: string,
  userId: string
): Promise<Result<{ id: string }>> {
  try {
    const holiday = await database.publicHoliday.findFirst({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        id: holidayId,
      },
    });

    if (!holiday) {
      return { ok: false, error: appError("not_found", "Holiday not found") };
    }

    await database.publicHoliday.update({
      where: { id: holidayId },
      data: {
        archived_at: new Date(),
        updated_by_user_id: userId,
      },
    });

    return { ok: true, value: { id: holidayId } };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to suppress holiday"),
    };
  }
}

export async function restoreHoliday(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  holidayId: string,
  userId: string
): Promise<Result<{ id: string }>> {
  try {
    const holiday = await database.publicHoliday.findFirst({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        id: holidayId,
      },
    });

    if (!holiday) {
      return { ok: false, error: appError("not_found", "Holiday not found") };
    }

    await database.publicHoliday.update({
      where: { id: holidayId },
      data: {
        archived_at: null,
        updated_by_user_id: userId,
      },
    });

    return { ok: true, value: { id: holidayId } };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to restore holiday"),
    };
  }
}

export async function deleteCustomHoliday(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  holidayId: string
): Promise<Result<{ id: string }>> {
  try {
    const holiday = await database.publicHoliday.findFirst({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        id: holidayId,
      },
    });

    if (!holiday) {
      return { ok: false, error: appError("not_found", "Holiday not found") };
    }

    if (holiday.source !== "manual") {
      return {
        ok: false,
        error: appError(
          "forbidden",
          "Cannot delete a holiday imported from an external source"
        ),
      };
    }

    await database.publicHoliday.delete({
      where: { id: holidayId },
    });

    return { ok: true, value: { id: holidayId } };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to delete custom holiday"),
    };
  }
}

export async function listForOrganisation(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  options?: {
    includeSuppressed?: boolean;
    jurisdictionId?: string | null;
    locationId?: string;
    year?: number;
  }
) {
  try {
    const whereClause: Prisma.PublicHolidayWhereInput = {
      ...scopedQuery(clerkOrgId, organisationId),
    };

    if (!options?.includeSuppressed) {
      whereClause.archived_at = null;
    }

    if (options?.jurisdictionId !== undefined) {
      whereClause.OR = [
        { jurisdiction_id: options.jurisdictionId },
        { jurisdiction_id: null },
      ];
    }

    if (options?.locationId) {
      const location = await database.location.findFirst({
        where: {
          ...scopedQuery(clerkOrgId, organisationId),
          id: options.locationId,
        },
        select: { country_code: true, region_code: true },
      });

      if (!location) {
        return { ok: true as const, value: [] };
      }

      const locationScope: Prisma.PublicHolidayWhereInput[] = [
        { region_code: null },
        {
          assignments: {
            some: {
              archived_at: null,
              scope_type: "location",
              scope_value: options.locationId,
            },
          },
        },
      ];

      if (location.region_code) {
        locationScope.push({ region_code: location.region_code });
      }
      if (location.country_code) {
        whereClause.country_code = { in: [location.country_code, "CUSTOM"] };
      }

      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : []),
        { OR: locationScope },
      ];
    }

    if (options?.year !== undefined) {
      whereClause.holiday_date = {
        gte: new Date(Date.UTC(options.year, 0, 1)),
        lt: new Date(Date.UTC(options.year + 1, 0, 1)),
      };
    }

    const holidays = await database.publicHoliday.findMany({
      where: whereClause,
      orderBy: { holiday_date: "asc" },
      include: {
        assignments: true,
        jurisdiction: true,
      },
    });

    return { ok: true as const, value: holidays };
  } catch {
    return {
      ok: false as const,
      error: appError("internal", "Failed to list holidays"),
    };
  }
}

export interface EnsureDefaultPublicHolidaysInput {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
  userId?: string | null;
  years?: number[];
}

export async function ensureDefaultPublicHolidaysForOrganisation(
  input: EnsureDefaultPublicHolidaysInput
): Promise<
  Result<{
    importedCount: number;
    skippedCount: number;
    importedYears: number[];
    skippedYears: number[];
  }>
> {
  try {
    const organisation = await database.organisation.findFirst({
      where: {
        clerk_org_id: input.clerkOrgId,
        id: input.organisationId,
        archived_at: null,
      },
      select: {
        country_code: true,
        region_code: true,
      },
    });

    if (!organisation) {
      return {
        ok: false,
        error: appError("not_found", "Organisation not found"),
      };
    }

    const actor = input.userId ?? "system:default-public-holidays";

    // Deduplicate and sort years
    let targetYears = input.years;
    if (!targetYears || targetYears.length === 0) {
      const currentYear = new Date().getUTCFullYear();
      targetYears = [currentYear, currentYear + 1];
    } else {
      targetYears = Array.from(new Set(targetYears)).sort((a, b) => a - b);
    }

    let totalImported = 0;
    let totalSkipped = 0;
    const importedYears: number[] = [];
    const skippedYears: number[] = [];

    for (const year of targetYears) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

      const existingCount = await database.publicHoliday.count({
        where: {
          ...scopedQuery(input.clerkOrgId, input.organisationId),
          source: "nager",
          country_code: organisation.country_code,
          region_code: organisation.region_code,
          holiday_date: {
            gte: yearStart,
            lt: yearEnd,
          },
        },
      });

      if (existingCount > 0) {
        skippedYears.push(year);
        continue;
      }

      const importResult = await importForJurisdiction({
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        countryCode: organisation.country_code,
        regionCode: organisation.region_code,
        userId: actor,
        year,
      });

      if (!importResult.ok) {
        return importResult;
      }

      totalImported += importResult.value.importedCount;
      totalSkipped += importResult.value.skippedCount;
      importedYears.push(year);
    }

    return {
      ok: true,
      value: {
        importedCount: totalImported,
        skippedCount: totalSkipped,
        importedYears,
        skippedYears,
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to ensure default public holidays"),
    };
  }
}

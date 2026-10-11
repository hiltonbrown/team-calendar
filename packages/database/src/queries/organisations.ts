import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { tenantDatabase } from "../tenant-client";
import { scopedQuery } from "../tenant-query";
export async function listOrganisationsByClerkOrg(
  clerkOrgId: ClerkOrgId
): Promise<
  Result<
    Array<{
      id: OrganisationId;
      clerkOrgId: string;
      name: string;
      countryCode: string;
      fiscalYearStart: number | null;
      locale: string | null;
      createdAt: Date;
      reportingUnit: string | null;
      timezone: string | null;
      updatedAt: Date;
      workingHoursPerDay: number | null;
    }>
  >
> {
  try {
    const organisations = await tenantDatabase(
      clerkOrgId
    ).organisation.findMany({
      orderBy: [{ created_at: "asc" }, { name: "asc" }],
      select: {
        clerk_org_id: true,
        country_code: true,
        created_at: true,
        fiscal_year_start: true,
        id: true,
        locale: true,
        name: true,
        reporting_unit: true,
        timezone: true,
        updated_at: true,
        working_hours_per_day: true,
      },
      where: { archived_at: null, clerk_org_id: clerkOrgId },
    });
    return {
      ok: true,
      value: organisations.map((o) => ({
        clerkOrgId: o.clerk_org_id,
        countryCode: o.country_code,
        createdAt: o.created_at,
        fiscalYearStart: o.fiscal_year_start,
        id: o.id as OrganisationId,
        locale: o.locale,
        name: o.name,
        reportingUnit: o.reporting_unit,
        timezone: o.timezone,
        updatedAt: o.updated_at,
        workingHoursPerDay:
          o.working_hours_per_day === null
            ? null
            : Number(o.working_hours_per_day),
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list organisations"),
      ok: false,
    };
  }
}
export async function getOrganisationById(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId
): Promise<
  Result<{
    id: OrganisationId;
    clerkOrgId: string;
    name: string;
    countryCode: string;
    fiscalYearStart: number | null;
    locale: string | null;
    createdAt: Date;
    reportingUnit: string | null;
    timezone: string | null;
    updatedAt: Date;
    workingHoursPerDay: number | null;
  }>
> {
  try {
    const organisation = await tenantDatabase(
      clerkOrgId
    ).organisation.findFirst({
      select: {
        clerk_org_id: true,
        country_code: true,
        created_at: true,
        fiscal_year_start: true,
        id: true,
        locale: true,
        name: true,
        reporting_unit: true,
        timezone: true,
        updated_at: true,
        working_hours_per_day: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
    });
    if (!organisation) {
      return {
        error: appError("not_found", "Organisation not found"),
        ok: false,
      };
    }
    return {
      ok: true,
      value: {
        clerkOrgId: organisation.clerk_org_id,
        countryCode: organisation.country_code,
        createdAt: organisation.created_at,
        fiscalYearStart: organisation.fiscal_year_start,
        id: organisation.id as OrganisationId,
        locale: organisation.locale,
        name: organisation.name,
        reportingUnit: organisation.reporting_unit,
        timezone: organisation.timezone,
        updatedAt: organisation.updated_at,
        workingHoursPerDay:
          organisation.working_hours_per_day === null
            ? null
            : Number(organisation.working_hours_per_day),
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to get organisation"),
      ok: false,
    };
  }
}
export async function hasXeroConnection(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId
): Promise<Result<boolean>> {
  try {
    const connection = await tenantDatabase(
      clerkOrgId
    ).xeroConnection.findFirst({
      select: { id: true },
      where: scopedQuery(clerkOrgId, organisationId),
    });
    return {
      ok: true,
      value: !!connection,
    };
  } catch {
    return {
      error: appError("internal", "Failed to check Xero connection"),
      ok: false,
    };
  }
}

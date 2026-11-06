import type { AccountId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";
import { scopedQuery } from "../tenant-query";
export async function listOrganisationsByAccount(
  accountId: AccountId,
  db: TenantDb
): Promise<
  Result<
    Array<{
      id: OrganisationId;
      accountId: string;
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
  {
    assertTenantDb(db, accountId);
    const tenantDb3 = db;

    try {
      const organisations = await tenantDb3.organisation.findMany({
        orderBy: [{ created_at: "asc" }, { name: "asc" }],
        select: {
          account_id: true,
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
        where: { account_id: accountId, archived_at: null },
      });
      return {
        ok: true,
        value: organisations.map((o) => ({
          accountId: o.account_id,
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
    } catch (error) {
      if (tenantDb3) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list organisations"),
        ok: false,
      };
    }
  }
}
export async function getOrganisationById(
  accountId: AccountId,
  organisationId: OrganisationId,
  db: TenantDb
): Promise<
  Result<{
    id: OrganisationId;
    accountId: string;
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
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const organisation = await tenantDb2.organisation.findFirst({
        select: {
          account_id: true,
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
          account_id: accountId,
          archived_at: null,
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
          accountId: organisation.account_id,
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
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to get organisation"),
        ok: false,
      };
    }
  }
}
export async function hasXeroConnection(
  accountId: AccountId,
  organisationId: OrganisationId,
  db: TenantDb
): Promise<Result<boolean>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const connection = await tenantDb.xeroConnection.findFirst({
        select: { id: true },
        where: scopedQuery(accountId, organisationId),
      });
      return {
        ok: true,
        value: !!connection,
      };
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to check Xero connection"),
        ok: false,
      };
    }
  }
}

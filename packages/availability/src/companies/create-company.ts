import "server-only";
import type { Organisation, Prisma } from "@repo/database/generated/client";

export interface CreateCompanyInput {
  clerkOrgId: string;
  countryCode: string;
  fiscalYearStart?: number;
  locale?: string;
  name: string;
  reportingUnit?: string;
  timezone?: string;
  workingHoursPerDay?: number;
}

export function createCompany(
  input: CreateCompanyInput,
  tx: Pick<Prisma.TransactionClient, "organisation">
): Promise<Organisation> {
  return tx.organisation.create({
    data: {
      clerk_org_id: input.clerkOrgId,
      country_code: input.countryCode,
      fiscal_year_start: input.fiscalYearStart ?? 7,
      locale: input.locale ?? "en-AU",
      name: input.name,
      reporting_unit: input.reportingUnit ?? "hours",
      timezone: input.timezone ?? "UTC",
      working_hours_per_day: input.workingHoursPerDay ?? 7.6,
    },
  });
}

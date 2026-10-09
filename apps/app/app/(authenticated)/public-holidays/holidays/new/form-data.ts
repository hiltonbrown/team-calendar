import "server-only";

import { COUNTRIES, REGIONS } from "@repo/core";
import { database } from "@repo/database";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export interface HolidayCountryOption {
  code: string;
  label: string;
  regions: Array<{ code: string; label: string }>;
}

/** Country and region options from the registry, built on the server so the client bundle stays small. */
export function holidayCountryOptions(): HolidayCountryOption[] {
  return COUNTRIES.map((country) => ({
    code: country.code,
    label: country.label,
    regions: REGIONS[country.code].map((region) => ({
      code: region.code,
      label: region.label,
    })),
  }));
}

export async function loadNewHolidayFormData(orgParam?: string) {
  await requirePageRole("org:admin");
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const organisation = await database.organisation.findFirst({
    select: { country_code: true },
    where: { clerk_org_id: clerkOrgId, id: organisationId },
  });
  return {
    countries: holidayCountryOptions(),
    defaultCountryCode: organisation?.country_code ?? null,
    organisationId,
  };
}

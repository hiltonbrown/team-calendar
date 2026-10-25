import { requireAccount } from "@repo/auth/helpers";
import type { AccountId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import "server-only";

import { COUNTRIES, REGIONS } from "@repo/core";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

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
  assertNoTenantTransaction("loadNewHolidayFormData");
  await requirePagePermission({ settings: ["update"] });
  const accountId = (await requireAccount()) as AccountId;
  return withTenantDb(accountId, async (db) => {
    const { organisationId } = await resolveActiveOrgPageContext(
      accountId,
      orgParam,
      db
    );
    const organisation = await db.organisation.findFirst({
      select: { country_code: true },
      where: { account_id: accountId, id: organisationId },
    });
    return {
      countries: holidayCountryOptions(),
      defaultCountryCode: organisation?.country_code ?? null,
      organisationId,
    };
  });
}

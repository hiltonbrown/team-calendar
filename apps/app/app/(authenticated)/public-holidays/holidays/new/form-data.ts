import "server-only";

import { database, scopedQuery } from "@repo/database";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export async function loadNewHolidayFormData(orgParam?: string) {
  await requirePageRole("org:admin");
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const jurisdictions = await database.publicHolidayJurisdiction.findMany({
    orderBy: [{ country_code: "asc" }, { region_code: "asc" }],
    select: { country_code: true, id: true, region_code: true },
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      archived_at: null,
      is_enabled: true,
    },
  });
  return { jurisdictions, organisationId };
}

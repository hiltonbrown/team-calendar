import type { Prisma } from "../../generated/client";
import { tenantDatabase } from "../tenant-client";

export const resolveAccountCompanies = (
  clerkOrgId: string,
  client: Pick<Prisma.TransactionClient, "organisation"> = tenantDatabase(
    clerkOrgId
  )
) =>
  client.organisation.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { country_code: true, id: true, name: true, timezone: true },
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      is_active: true,
      OR: [
        { xero_connection: null },
        { xero_connection: { released_at: null } },
      ],
    },
  });

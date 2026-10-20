import { auth } from "@repo/auth/server";
import { getXeroConnectionStateForScope } from "@repo/availability";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { organisationWithConnectionSelect } from "./_connection-view";
import { IntegrationsClient } from "./integrations-client";
export const metadata: Metadata = {
  description: "Connect external services to extend Team Calendar.",
  title: "Integrations - Settings - Team Calendar",
};
export default async function IntegrationsPage() {
  await requirePageRole("org:admin");
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Organisation context is required.");
  }
  const { withState } = await withTenantDb(
    orgId,
    async (db) => {
      const organisations = await db.organisation.findMany({
        orderBy: [{ created_at: "asc" }, { name: "asc" }],
        select: organisationWithConnectionSelect,
        where: {
          archived_at: null,
          clerk_org_id: orgId,
        },
      });
      const preparedWithState: Array<
        (typeof organisations)[number] & {
          xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
        }
      > = [];
      for (const organisation of organisations) {
        const result = await getXeroConnectionStateForScope(
          { clerkOrgId: orgId, organisationId: organisation.id },
          db
        );
        const xeroConnectionState: import("@repo/core").XeroConnectionDisplayState =
          result.ok ? result.value.state : "unavailable";
        preparedWithState.push({ ...organisation, xeroConnectionState });
      }

      return { withState: preparedWithState };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
  return <IntegrationsClient organisations={withState} />;
}

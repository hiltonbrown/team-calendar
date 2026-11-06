import { getSession } from "@repo/auth/server";
import { getXeroConnectionStateForScope } from "@repo/availability";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { organisationWithConnectionSelect } from "./_connection-view";
import { IntegrationsClient } from "./integrations-client";
export const metadata: Metadata = {
  description: "Connect external services to extend Team Calendar.",
  title: "Integrations - Settings - Team Calendar",
};
export default async function IntegrationsPage() {
  await requirePagePermission({ xero: ["manage"] });
  const { accountId: sessionAccountId } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  if (!sessionAccountId) {
    throw new Error("Organisation context is required.");
  }
  const { withState } = await withTenantDb(
    sessionAccountId,
    async (db) => {
      const organisations = await db.organisation.findMany({
        orderBy: [{ created_at: "asc" }, { name: "asc" }],
        select: organisationWithConnectionSelect,
        where: {
          account_id: sessionAccountId,
          archived_at: null,
        },
      });
      const preparedWithState: Array<
        (typeof organisations)[number] & {
          xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
        }
      > = [];
      for (const organisation of organisations) {
        const result = await getXeroConnectionStateForScope(
          { accountId: sessionAccountId, organisationId: organisation.id },
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

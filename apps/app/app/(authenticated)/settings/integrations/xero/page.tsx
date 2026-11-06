import { getSession, withinLimit } from "@repo/auth/server";
import { getXeroConnectionStateForScope } from "@repo/availability";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { organisationWithConnectionSelect } from "../_connection-view";
import { XeroClient } from "./xero-client";
export const metadata: Metadata = {
  description: "Manage Xero connections for each payroll organisation.",
  title: "Xero - Settings - Team Calendar",
};
export default async function XeroPage() {
  await requirePagePermission({ xero: ["manage"] });
  const { accountId: sessionAccountId, role: sessionRole } =
    (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };
  if (!sessionAccountId) {
    throw new Error("Organisation context is required.");
  }
  const { withState, payrollEntityAllowance } = await withTenantDb(
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
      const allowance = await withinLimit(
        sessionAccountId,
        organisations[0]?.id ?? "",
        "payroll_entities",
        db
      );
      const preparedPayrollEntityAllowance = allowance.ok
        ? {
            limit: allowance.value.limit === -1 ? null : allowance.value.limit,
            remaining:
              allowance.value.limit === -1
                ? null
                : Math.max(0, allowance.value.limit - allowance.value.current),
            used: allowance.value.current,
          }
        : null;

      return {
        payrollEntityAllowance: preparedPayrollEntityAllowance,
        withState: preparedWithState,
      };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
  return (
    <XeroClient
      actingRole={sessionRole === "owner" ? "owner" : "admin"}
      organisations={withState}
      payrollEntityAllowance={payrollEntityAllowance}
    />
  );
}

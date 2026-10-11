import { auth, withinLimit } from "@repo/auth/server";
import { getXeroConnectionStateForScope } from "@repo/availability";
import { tenantDatabase } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { organisationWithConnectionSelect } from "../_connection-view";
import { XeroClient } from "./xero-client";
export const metadata: Metadata = {
  description: "Manage Xero connections for each payroll organisation.",
  title: "Xero - Settings - Team Calendar",
};
export default async function XeroPage() {
  await requirePageRole("org:admin");
  const { orgId, orgRole } = await auth();
  if (!orgId) {
    throw new Error("Organisation context is required.");
  }
  const organisations = await tenantDatabase(orgId).organisation.findMany({
    orderBy: [{ created_at: "asc" }, { name: "asc" }],
    select: organisationWithConnectionSelect,
    where: {
      archived_at: null,
      clerk_org_id: orgId,
    },
  });
  const withState = await Promise.all(
    organisations.map(async (organisation) => {
      const result = await getXeroConnectionStateForScope({
        clerkOrgId: orgId,
        organisationId: organisation.id,
      });
      const xeroConnectionState: import("@repo/core").XeroConnectionDisplayState =
        result.ok ? result.value.state : "unavailable";
      return { ...organisation, xeroConnectionState };
    })
  );
  const allowance = await withinLimit(
    orgId,
    organisations[0]?.id ?? "",
    "payroll_entities"
  );
  const payrollEntityAllowance = allowance.ok
    ? {
        limit: allowance.value.limit === -1 ? null : allowance.value.limit,
        remaining:
          allowance.value.limit === -1
            ? null
            : Math.max(0, allowance.value.limit - allowance.value.current),
        used: allowance.value.current,
      }
    : null;
  return (
    <XeroClient
      actingRole={orgRole === "org:owner" ? "owner" : "admin"}
      organisations={withState}
      payrollEntityAllowance={payrollEntityAllowance}
    />
  );
}

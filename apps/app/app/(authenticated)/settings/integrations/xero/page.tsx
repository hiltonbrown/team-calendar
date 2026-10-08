import { auth } from "@repo/auth/server";
import { getXeroConnectionStateForScope } from "@repo/availability";
import { database } from "@repo/database";
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
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Organisation context is required.");
  }
  const organisations = await database.organisation.findMany({
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
  return <XeroClient organisations={withState} />;
}

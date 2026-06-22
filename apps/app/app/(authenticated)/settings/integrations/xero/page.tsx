import { auth } from "@repo/auth/server";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
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
    where: {
      archived_at: null,
      clerk_org_id: orgId,
    },
    orderBy: [{ created_at: "asc" }, { name: "asc" }],
    include: {
      xero_connection: {
        include: {
          xero_tenant: true,
        },
      },
    },
  });

  return <XeroClient organisations={organisations} />;
}

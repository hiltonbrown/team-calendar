import { getAccountApprovalSettings, getSettings } from "@repo/availability";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { LeaveApprovalSettingsClient } from "./leave-approval-settings-client";

export const metadata: Metadata = {
  description: "Configure organisation-wide leave approval behaviour.",
  title: "Leave Approval - Settings - Team Calendar",
};

interface LeaveApprovalPageProps {
  searchParams: Promise<{ org?: string }>;
}

const LeaveApprovalPage = async ({ searchParams }: LeaveApprovalPageProps) => {
  await requirePageRole("org:admin");

  const { org } = await searchParams;
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
  const { settings, accountSettings } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const company = await getSettings({ clerkOrgId, organisationId }, db);
      if (!company.ok) {
        throw new Error(company.error.message);
      }
      const account = await getAccountApprovalSettings({ clerkOrgId }, db);
      if (!account.ok) {
        throw new Error(account.error.message);
      }
      return { accountSettings: account.value, settings: company.value };
    }
  );

  return (
    <LeaveApprovalSettingsClient
      accountSettings={accountSettings}
      organisationId={organisationId}
      settings={settings}
    />
  );
};

export default LeaveApprovalPage;

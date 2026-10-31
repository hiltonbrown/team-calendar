import { getAccountApprovalSettings, getSettings } from "@repo/availability";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
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
  await requirePagePermission({ settings: ["update"] });

  const { org } = await searchParams;
  const { accountId, organisationId } = await requireActiveOrgPageContext(org);
  const { settings, accountSettings } = await withTenantDb(
    accountId,
    async (db) => {
      const company = await getSettings({ accountId, organisationId }, db);
      if (!company.ok) {
        throw new Error(company.error.message);
      }
      const account = await getAccountApprovalSettings({ accountId }, db);
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

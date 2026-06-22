import { getSettings } from "@repo/availability";
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
  const settingsResult = await getSettings({ clerkOrgId, organisationId });

  if (!settingsResult.ok) {
    throw new Error(settingsResult.error.message);
  }

  return (
    <LeaveApprovalSettingsClient
      organisationId={organisationId}
      settings={settingsResult.value}
    />
  );
};

export default LeaveApprovalPage;

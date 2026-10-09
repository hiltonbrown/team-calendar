import { auth } from "@repo/auth/server";
import { listTeamCoverageMinimums } from "@repo/availability";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { CoverageSettingsClient } from "./coverage-settings-client";

export const metadata: Metadata = {
  description: "Set the minimum people each team needs available.",
  title: "Coverage - Settings - Team Calendar",
};

interface CoveragePageProps {
  searchParams: Promise<{ org?: string }>;
}

const CoveragePage = async ({ searchParams }: CoveragePageProps) => {
  await requirePageRole("org:admin");
  const [{ org }, { orgRole }] = await Promise.all([searchParams, auth()]);
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
  const teamsResult = await listTeamCoverageMinimums({
    // requirePageRole above admits only admins and owners.
    actingRole: orgRole === "org:owner" ? "owner" : "admin",
    clerkOrgId,
    organisationId,
  });

  if (!teamsResult.ok) {
    throw new Error(teamsResult.error.message);
  }

  return (
    <CoverageSettingsClient
      organisationId={organisationId}
      teams={teamsResult.value}
    />
  );
};

export default CoveragePage;

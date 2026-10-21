import { requireOrg } from "@repo/auth/helpers";
import { auth } from "@repo/auth/server";
import { listTeamCoverageMinimums } from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const { teamsResult, organisationId } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(clerkOrgId, org, db);
      const preparedTeamsResult = await listTeamCoverageMinimums(
        {
          // requirePageRole above admits only admins and owners.
          actingRole: orgRole === "org:owner" ? "owner" : "admin",
          clerkOrgId,
          organisationId: scopedOrganisationId,
        },
        db
      );

      return {
        organisationId: scopedOrganisationId,
        teamsResult: preparedTeamsResult,
      };
    }
  );

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

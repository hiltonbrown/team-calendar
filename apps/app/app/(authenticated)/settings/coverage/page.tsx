import { requireAccount } from "@repo/auth/helpers";
import { getSession } from "@repo/auth/server";
import { listTeamCoverageMinimums } from "@repo/availability";
import type { AccountId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
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
  await requirePagePermission({ settings: ["update"] });
  const [{ org }, { role: sessionRole }] = await Promise.all([
    searchParams,
    getSession().then((currentSession) => currentSession ?? { role: null }),
  ]);
  const accountId = (await requireAccount()) as AccountId;
  const { teamsResult, organisationId } = await withTenantDb(
    accountId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(accountId, org, db);
      const preparedTeamsResult = await listTeamCoverageMinimums(
        {
          accountId,
          // requirePagePermission above admits only admins and owners.
          actingRole: sessionRole === "owner" ? "owner" : "admin",
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

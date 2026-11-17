import { requireAccount } from "@repo/auth/helpers";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { SettingsSectionHeader } from "../../../components/settings-section-header";
import { toXeroPersonMatchView, xeroPersonMatchSelect } from "./_match-view";
import { MatchesClient } from "./matches-client";

export const metadata: Metadata = {
  description:
    "Review possible matches between Xero people and existing manual people.",
  title: "Xero Person Matches - Settings - Team Calendar",
};

interface XeroMatchesPageProps {
  searchParams: Promise<{ org?: string }>;
}

export default async function XeroMatchesPage({
  searchParams,
}: XeroMatchesPageProps) {
  await requirePagePermission({ xero: ["manage"] });

  const { org: orgParam } = await searchParams;
  // Authentication supplied the authenticated account identifier.
  const accountId = (await requireAccount()) as AccountId;
  const { organisationId, matches } = await withTenantDb(
    accountId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(accountId, orgParam, db);

      const rawMatches = await db.xeroPersonMatch.findMany({
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: xeroPersonMatchSelect,
        where: {
          account_id: accountId,
          organisation_id: scopedOrganisationId,
          status: "pending",
        },
      });

      const preparedMatches = rawMatches.map(toXeroPersonMatchView);

      return { matches: preparedMatches, organisationId: scopedOrganisationId };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Possible matches are never merged automatically. Review and resolve each one explicitly."
        title="Xero Person Matches"
      />
      <MatchesClient matches={matches} organisationId={organisationId} />
    </div>
  );
}

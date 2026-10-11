import { tenantDatabase } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  await requirePageRole("org:admin");

  const { org: orgParam } = await searchParams;
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);

  const rawMatches = await tenantDatabase(clerkOrgId).xeroPersonMatch.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: xeroPersonMatchSelect,
    where: {
      clerk_org_id: clerkOrgId,
      organisation_id: organisationId,
      status: "pending",
    },
  });

  const matches = rawMatches.map(toXeroPersonMatchView);

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

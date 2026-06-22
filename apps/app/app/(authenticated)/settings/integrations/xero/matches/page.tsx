import { auth } from "@repo/auth/server";
import { database } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { SettingsSectionHeader } from "../../../components/settings-section-header";
import { MatchesClient } from "./matches-client";

export const metadata: Metadata = {
  description:
    "Review possible matches between Xero people and existing manual people.",
  title: "Xero Person Matches - Settings - Team Calendar",
};

export default async function XeroMatchesPage() {
  await requirePageRole("org:admin");

  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Organisation context is required.");
  }

  const matches = await database.xeroPersonMatch.findMany({
    where: {
      clerk_org_id: orgId,
      status: "pending",
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    include: {
      candidate_person: {
        select: {
          clerk_user_id: true,
          email: true,
          first_name: true,
          id: true,
          last_name: true,
        },
      },
      xero_person: {
        select: {
          email: true,
          first_name: true,
          id: true,
          last_name: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Possible matches are never merged automatically. Review and resolve each one explicitly."
        title="Xero Person Matches"
      />
      <MatchesClient matches={matches} />
    </div>
  );
}

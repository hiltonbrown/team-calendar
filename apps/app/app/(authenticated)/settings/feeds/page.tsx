import { auth, currentUser } from "@repo/auth/server";
import { getSettings } from "@repo/availability";
import { listFeeds, normaliseRole } from "@repo/feeds";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { FeedsClient } from "./feeds-client";

export const metadata: Metadata = {
  description: "Manage organisation feed defaults and view every feed.",
  title: "Feeds - Settings - Team Calendar",
};

interface FeedsPageProps {
  searchParams: Promise<{ org?: string }>;
}

// S-21 Settings > Feeds is the admin-config counterpart to the S-13 member view
// at `/feeds`. It creates and configures feeds and edits organisation feed
// defaults, so it is restricted to admins and owners. The read-oriented member
// surface lives at `/feeds`. This split is intentional per ScreenCatalogue
// v4.1; keep the two in sync.
const FeedsPage = async ({ searchParams }: FeedsPageProps) => {
  await requirePageRole("org:admin");

  const [{ orgRole }, user, { org }] = await Promise.all([
    auth(),
    currentUser(),
    searchParams,
  ]);
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);

  if (!user) {
    throw new Error("User not found.");
  }

  const [feedsResult, settingsResult] = await Promise.all([
    listFeeds({
      actingRole: normaliseRole(orgRole),
      actingUserId: user.id,
      clerkOrgId,
      filters: { status: ["active", "paused", "archived"] },
      organisationId,
      pagination: { pageSize: 100 },
    }),
    getSettings({ clerkOrgId, organisationId }),
  ]);

  if (!feedsResult.ok) {
    throw new Error(feedsResult.error.message);
  }
  if (!settingsResult.ok) {
    throw new Error(settingsResult.error.message);
  }

  return (
    <FeedsClient
      feeds={feedsResult.value}
      organisationId={organisationId}
      settings={settingsResult.value}
    />
  );
};

export default FeedsPage;

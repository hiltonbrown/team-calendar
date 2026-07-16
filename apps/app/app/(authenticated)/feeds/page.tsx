import { auth, currentUser } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import { listFeeds, normaliseRole } from "@repo/feeds";
import type { Metadata } from "next";
import Link from "next/link";
import { FeedTable } from "@/components/feed/feed-table";
import { SubscribeInstructions } from "@/components/feed/subscribe-instructions";
import { EmptyState } from "@/components/states/empty-state";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { FeedFilterSchema } from "./_schemas";
import { FeedFilterBar } from "./feed-filter-bar";

export const metadata: Metadata = {
  title: "Feeds | Team Calendar",
  description:
    "Create and manage iCal calendar feeds for your team's leave and availability.",
};

interface FeedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// S-13 Feeds is the member-view surface for calendar feeds: read access from
// viewer upward, with management controls (new, pause, activate) gated behind
// `canManage` for admins and owners. The admin-config counterpart that creates
// and configures feeds is S-21 at `/settings/feeds` (admin and owner only).
// This split is intentional per ScreenCatalogue v4.1; keep the two in sync.
const FeedPage = async ({ searchParams }: FeedPageProps) => {
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { orgRole } = await auth();
  const user = await currentUser();
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const filters = parseFilterParams(filterParams, FeedFilterSchema) ?? {
    status: ["active", "paused"],
  };
  const role = normaliseRole(orgRole);
  const canManage =
    role === "admin" ||
    role === "owner" ||
    role === "org:admin" ||
    role === "org:owner";

  const feedsResult = user
    ? await listFeeds({
        actingRole: role,
        actingUserId: user.id,
        clerkOrgId,
        filters,
        organisationId,
        pagination: { cursor: filters.cursor, pageSize: 50 },
      })
    : {
        ok: false as const,
        error: {
          code: "not_authorised" as const,
          message: "You must be signed in to view feeds.",
        },
      };
  let content = <FetchErrorState entityName="feeds" />;
  if (feedsResult.ok && feedsResult.value.length === 0) {
    content = (
      <EmptyState
        actionSlot={
          canManage ? (
            <Button asChild>
              <Link href="/feeds/new">Create feed</Link>
            </Button>
          ) : null
        }
        description="New organisations normally start with a default all-staff feed. No feed is currently available for this organisation."
        title="No feeds yet"
      />
    );
  } else if (feedsResult.ok) {
    content = (
      <FeedTable
        canManage={canManage}
        feeds={feedsResult.value}
        organisationId={organisationId}
      />
    );
  }

  return (
    <>
      <Header page="Feeds" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <section className="flex flex-col justify-between gap-4 rounded-2xl bg-muted p-6 lg:flex-row lg:items-end">
          <div>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
              Calendar publishing
            </p>
            <h1 className="mt-1 font-semibold text-foreground text-headline-md">
              Feeds
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              Publish approved availability to subscribed calendars. Subscribe
              URLs are only shown when a token is created or rotated.
            </p>
          </div>
          {canManage && (
            <Button asChild>
              <Link href="/feeds/new">New feed</Link>
            </Button>
          )}
        </section>

        <SubscribeInstructions />

        <FeedFilterBar
          privacyMode={filters.privacyMode ?? []}
          search={filters.search ?? ""}
          status={filters.status}
        />

        {content}
      </main>
    </>
  );
};

export default FeedPage;

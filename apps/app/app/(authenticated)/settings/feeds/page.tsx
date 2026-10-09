import { auth, currentUser } from "@repo/auth/server";
import { getSettings } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { getFeedOversightCounts, listFeeds, normaliseRole } from "@repo/feeds";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import {
  FeedOversightFilterSchema,
  type FeedOversightFilters,
} from "./_schemas";
import { FeedOversightFilterBar } from "./feed-oversight-filters";
import { FeedOversightList } from "./feed-oversight-list";
import { FeedsClient } from "./feeds-client";

export const metadata: Metadata = {
  description: "Manage organisation feed defaults and oversee every feed.",
  title: "Feeds - Settings - Team Calendar",
};

const PAGE_SIZE = 50;

interface FeedsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// S-21 Settings > Feeds is the admin home for calendar feeds: organisation
// defaults plus an oversight list of every feed with last-fetch signals.
// Lifecycle actions live on each feed's detail page; S-13 `/feeds` is the
// subscribe page for every role.
const FeedsPage = async ({ searchParams }: FeedsPageProps) => {
  await requirePageRole("org:admin");

  const [{ orgRole }, user, params] = await Promise.all([
    auth(),
    currentUser(),
    searchParams,
  ]);
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);

  if (!user) {
    throw new Error("User not found.");
  }

  const filters: FeedOversightFilters = parseFilterParams(
    filterParams,
    FeedOversightFilterSchema
  ) ?? { status: ["active", "paused"] };
  const actor = {
    actingRole: normaliseRole(orgRole),
    actingUserId: user.id,
    clerkOrgId,
    organisationId,
  };

  const [feedsResult, countsResult, settingsResult] = await Promise.all([
    listFeeds({
      ...actor,
      filters: {
        search: filters.search,
        status: filters.status,
        type: filters.type,
      },
      pagination: { cursor: filters.cursor, pageSize: PAGE_SIZE },
    }),
    getFeedOversightCounts(actor),
    getSettings({ clerkOrgId, organisationId }),
  ]);

  if (!feedsResult.ok) {
    throw new Error(feedsResult.error.message);
  }
  if (!countsResult.ok) {
    throw new Error(countsResult.error.message);
  }
  if (!settingsResult.ok) {
    throw new Error(settingsResult.error.message);
  }

  const feeds = feedsResult.value;
  const { personal, total } = countsResult.value;
  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.type?.length) ||
    filters.status.join(",") !== "active,paused";
  const lastFeed = feeds.at(-1);
  const nextHref =
    feeds.length === PAGE_SIZE && lastFeed
      ? pageHref(filters, lastFeed.id, orgQueryValue)
      : null;
  const firstHref = filters.cursor
    ? pageHref(filters, undefined, orgQueryValue)
    : null;

  return (
    <div className="space-y-6">
      <FeedsClient
        organisationId={organisationId}
        settings={settingsResult.value}
      />
      <section aria-labelledby="all-feeds-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              className="font-semibold text-foreground text-title-lg"
              id="all-feeds-heading"
            >
              All feeds
            </h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {total} {total === 1 ? "feed" : "feeds"} active or paused,
              including {personal} personal {personal === 1 ? "feed" : "feeds"}.
              Last fetched shows when a calendar app last updated from the feed.
            </p>
          </div>
          <Button asChild>
            <Link href={withOrg("/feeds/new", orgQueryValue)}>New feed</Link>
          </Button>
        </div>
        <FeedOversightFilterBar filters={filters} />
        <FeedOversightList
          feeds={feeds}
          hasActiveFilters={hasActiveFilters}
          now={new Date()}
          orgQueryValue={orgQueryValue}
        />
        {nextHref || firstHref ? (
          <nav
            aria-label="Feed pages"
            className="flex flex-wrap justify-end gap-2"
          >
            {firstHref ? (
              <Button asChild variant="ghost">
                <Link href={firstHref}>First page</Link>
              </Button>
            ) : null}
            {nextHref ? (
              <Button asChild variant="outline">
                <Link href={nextHref}>Next page</Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
};

function pageHref(
  filters: FeedOversightFilters,
  cursor: string | undefined,
  orgQueryValue: string | null
): string {
  const query = new URLSearchParams();
  if (filters.search) {
    query.set("search", filters.search);
  }
  for (const status of filters.status) {
    query.append("status", status);
  }
  for (const type of filters.type ?? []) {
    query.append("type", type);
  }
  if (cursor) {
    query.set("cursor", cursor);
  }
  const suffix = query.toString();
  return withOrg(
    suffix ? `/settings/feeds?${suffix}` : "/settings/feeds",
    orgQueryValue
  );
}

export default FeedsPage;

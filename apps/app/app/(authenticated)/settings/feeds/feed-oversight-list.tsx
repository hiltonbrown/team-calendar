"use client";

import type { FeedListItem } from "@repo/feeds";
import { CircleAlertIcon, HistoryIcon } from "lucide-react";
import Link from "next/link";
import { FeedStatusDot } from "@/components/feed/feed-status-dot";
import { describeLastFetched } from "@/lib/feeds/last-fetched";
import { withOrg } from "@/lib/navigation/org-url";

export type OversightFeed = Pick<
  FeedListItem,
  | "createdByName"
  | "createdByUserId"
  | "id"
  | "kind"
  | "lastFetchedAt"
  | "name"
  | "status"
>;

const KIND_LABELS: Record<FeedListItem["kind"], string> = {
  manager_team: "Manager team",
  mixed: "Mixed",
  organisation: "Organisation",
  person: "Person",
  personal: "Personal",
  team: "Team",
};

const exactFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "long",
  hourCycle: "h23",
  timeStyle: "short",
});

export function FeedOversightList({
  feeds,
  hasActiveFilters,
  now,
  orgQueryValue,
}: {
  feeds: OversightFeed[];
  hasActiveFilters: boolean;
  now: Date;
  orgQueryValue: string | null;
}) {
  if (feeds.length === 0) {
    return (
      <p className="rounded-lg bg-surface-container-low p-4 text-body-sm text-muted-foreground">
        {hasActiveFilters
          ? "No feeds match these filters. Clear or change them to see other feeds."
          : "No feeds yet. Create one, or ask people to create their own calendar feed from Calendar feeds."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div
        aria-hidden="true"
        className="hidden gap-4 px-4 text-label-md text-muted-foreground lg:grid lg:grid-cols-[1.6fr_0.8fr_1fr_0.7fr_1.2fr]"
      >
        <span>Feed</span>
        <span>Type</span>
        <span>Created by</span>
        <span>Status</span>
        <span>Last fetched</span>
      </div>
      <ul className="space-y-2">
        {feeds.map((feed) => (
          <OversightRow
            feed={feed}
            key={feed.id}
            now={now}
            orgQueryValue={orgQueryValue}
          />
        ))}
      </ul>
    </div>
  );
}

function OversightRow({
  feed,
  now,
  orgQueryValue,
}: {
  feed: OversightFeed;
  now: Date;
  orgQueryValue: string | null;
}) {
  const fetched = describeLastFetched({
    lastFetchedAt: feed.lastFetchedAt,
    now,
    status: feed.status,
  });
  let createdBy = "Set up automatically";
  if (feed.createdByName) {
    createdBy = feed.createdByName;
  } else if (feed.createdByUserId) {
    createdBy = "Administrator";
  }
  return (
    <li className="grid gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-label-lg sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_1fr_0.7fr_1.2fr] lg:items-center lg:gap-4">
      <Link
        className="font-medium text-foreground underline-offset-4 hover:underline"
        href={withOrg(`/feeds/${feed.id}`, orgQueryValue)}
      >
        {feed.name}
      </Link>
      <Cell label="Type">{KIND_LABELS[feed.kind]}</Cell>
      <Cell label="Created by">{createdBy}</Cell>
      <Cell label="Status">
        <FeedStatusDot status={feed.status} />
      </Cell>
      <Cell label="Last fetched">
        <span className="flex flex-wrap items-center gap-2">
          <LastFetchedText feed={feed} fetched={fetched} />
          {fetched.flag ? <FetchFlag flag={fetched.flag} /> : null}
        </span>
      </Cell>
    </li>
  );
}

function LastFetchedText({
  feed,
  fetched,
}: {
  feed: OversightFeed;
  fetched: ReturnType<typeof describeLastFetched>;
}) {
  if (feed.lastFetchedAt) {
    return (
      <time
        dateTime={feed.lastFetchedAt.toISOString()}
        suppressHydrationWarning
        title={exactFormat.format(feed.lastFetchedAt)}
      >
        {fetched.relative}
        <span className="sr-only" suppressHydrationWarning>
          {` (${exactFormat.format(feed.lastFetchedAt)})`}
        </span>
      </time>
    );
  }
  // An active never-fetched feed shows only its flag, so the words appear once.
  return fetched.flag ? null : (
    <span className="text-muted-foreground">Never fetched</span>
  );
}

function Cell({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 lg:block">
      <span className="text-label-md text-muted-foreground lg:hidden">
        {label}:
      </span>
      {children}
    </div>
  );
}

function FetchFlag({ flag }: { flag: "never" | "stale" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-warning-container px-2 py-0.5 text-label-md text-on-warning-container ring-1 ring-on-warning-container/30">
      {flag === "never" ? (
        <CircleAlertIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <HistoryIcon aria-hidden="true" className="size-3.5" />
      )}
      {flag === "never" ? "Never fetched" : "Not fetched in 30 days"}
    </span>
  );
}

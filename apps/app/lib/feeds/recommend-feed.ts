import type { FeedListItem } from "@repo/feeds";

export interface FeedRecommendation {
  others: FeedListItem[];
  ownPausedFeed: FeedListItem | null;
  recommended: FeedListItem | null;
}

// Other people's personal and team feeds are theirs to subscribe to; listing
// them on /feeds (where admins see every feed) would only add noise.
function isRelevant(feed: FeedListItem): boolean {
  if (feed.status === "archived") {
    return false;
  }
  const isOwnKind = feed.kind === "personal" || feed.kind === "manager_team";
  return !isOwnKind || feed.isOwnedByActor;
}

function isSubscribable(feed: FeedListItem): boolean {
  return feed.status === "active" && Boolean(feed.subscribeUrl);
}

function byName(a: FeedListItem, b: FeedListItem): number {
  return a.name.localeCompare(b.name);
}

function pickRecommended(candidates: FeedListItem[]): FeedListItem | null {
  const own = (kind: FeedListItem["kind"]) =>
    candidates.find((feed) => feed.isOwnedByActor && feed.kind === kind);
  const [oldestOrganisation] = candidates
    .filter((feed) => feed.kind === "organisation")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const [firstByName] = [...candidates].sort(byName);
  return (
    own("personal") ??
    own("manager_team") ??
    oldestOrganisation ??
    firstByName ??
    null
  );
}

export function recommendFeed(feeds: FeedListItem[]): FeedRecommendation {
  const relevant = feeds.filter(isRelevant);
  const recommended = pickRecommended(relevant.filter(isSubscribable));
  const ownPaused = relevant.filter(
    (feed) => feed.isOwnedByActor && feed.status === "paused"
  );
  return {
    others: relevant.filter((feed) => feed.id !== recommended?.id).sort(byName),
    ownPausedFeed:
      ownPaused.find((feed) => feed.kind === "personal") ??
      ownPaused[0] ??
      null,
    recommended,
  };
}

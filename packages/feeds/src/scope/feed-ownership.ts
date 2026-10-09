import type { FeedScopeType } from "./feed-scope";

export type FeedKind =
  | "manager_team"
  | "mixed"
  | "organisation"
  | "person"
  | "personal"
  | "team";

export type OwnFeedKind = "personal" | "team";

interface OwnershipInput {
  createdByUserId: string | null;
  scopes: { scopeType: FeedScopeType }[];
}

const OWNABLE_SCOPE_TYPES = new Set<FeedScopeType>(["manager_team", "self"]);

// A feed is "owned" only when it publishes the creator's own availability
// (self) or their direct reports (manager_team). Org, team and person feeds
// stay admin-managed even when an admin created them.
export function isFeedOwner(
  feed: OwnershipInput,
  actingUserId: string
): boolean {
  return (
    feed.createdByUserId !== null &&
    feed.createdByUserId === actingUserId &&
    feed.scopes.length > 0 &&
    feed.scopes.every((scope) => OWNABLE_SCOPE_TYPES.has(scope.scopeType))
  );
}

export function feedKind(scopes: { scopeType: FeedScopeType }[]): FeedKind {
  const types = new Set(scopes.map((scope) => scope.scopeType));
  if (types.has("org")) {
    return "organisation";
  }
  if (types.size !== 1) {
    return "mixed";
  }
  const [only] = types;
  switch (only) {
    case "self":
      return "personal";
    case "manager_team":
      return "manager_team";
    case "person":
      return "person";
    default:
      return "team";
  }
}

export function ownFeedScopeType(kind: OwnFeedKind): "manager_team" | "self" {
  return kind === "personal" ? "self" : "manager_team";
}

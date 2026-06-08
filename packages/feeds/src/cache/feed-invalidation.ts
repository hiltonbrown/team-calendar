import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { resolvePeopleForFeed } from "../scope/feed-scope";
import { type FeedCacheError, invalidateFeedCache } from "./feed-cache";

// Resolve the active feeds whose scope includes any of the given people, using the
// canonical scope resolver so dynamic scopes (self, manager_team) are handled the same
// way the renderer handles them. Out-of-scope people never match, so callers can rely on
// this to avoid invalidating unrelated feeds.
export async function feedIdsForPeople(input: {
  clerkOrgId: string;
  organisationId: string;
  personIds: string[];
}): Promise<string[]> {
  if (input.personIds.length === 0) {
    return [];
  }
  const wanted = new Set(input.personIds);
  const feeds = await database.feed.findMany({
    select: feedScopeSelect,
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      status: "active",
    },
  });

  const matching: string[] = [];
  for (const feed of feeds) {
    const people = await resolvePeopleForFeed({
      clerkOrgId: input.clerkOrgId,
      createdByUserId: feed.created_by_user_id,
      organisationId: input.organisationId,
      scopes: feed.scopes.map((scope) => ({
        scopeType: scope.scope_type,
        scopeValue: scope.scope_value,
      })),
    });
    // If scope resolution fails we cannot prove the person is out of scope; invalidate
    // defensively so a transient error never leaves a stale feed body in the cache.
    if (!people.ok) {
      matching.push(feed.id);
      continue;
    }
    if (people.value.some((person) => wanted.has(person.id))) {
      matching.push(feed.id);
    }
  }
  return matching;
}

export async function invalidateFeedCachesForPerson(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<Result<{ feedIds: string[] }, FeedCacheError>> {
  const feedIds = await feedIdsForPeople({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    personIds: [input.personId],
  });
  for (const feedId of feedIds) {
    const result = await invalidateFeedCache({ feedId });
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true, value: { feedIds } };
}

const feedScopeSelect = {
  created_by_user_id: true,
  id: true,
  scopes: {
    select: {
      scope_type: true,
      scope_value: true,
    },
  },
} satisfies Prisma.FeedSelect;

import "server-only";

import type { Result } from "@repo/core";
import { tenantDatabase } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { loadFeedScopeData, resolvePeopleForFeed } from "../scope/feed-scope";
import {
  ALL_PRIVACY_MODES,
  type FeedCacheError,
  invalidateFeedCache,
} from "./feed-cache";

// Resolve the active feeds whose scope includes any of the given people, using the
// canonical scope resolver so dynamic scopes (self, manager_team) are handled the same
// way the renderer handles them. Out-of-scope people never match, so callers can rely on
// this to avoid invalidating unrelated feeds.
export async function feedIdsForPeople(input: {
  clerkOrgId: string;
  organisationId: string;
  personIds: string[];
}): Promise<
  Array<{ id: string; organisationId: string | null; privacyMode: string }>
> {
  if (input.personIds.length === 0) {
    return [];
  }
  const preloadedResult = await loadFeedScopeData({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  const preloaded = preloadedResult.ok ? preloadedResult.value : undefined;

  const wanted = new Set(input.personIds);
  const feeds = await tenantDatabase(input.clerkOrgId).feed.findMany({
    select: feedScopeSelect,
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      OR: [
        { organisation_id: input.organisationId },
        { organisation_id: null },
      ],
      status: "active",
    },
  });

  const matching: Array<{
    id: string;
    organisationId: string | null;
    privacyMode: string;
  }> = [];
  for (const feed of feeds) {
    if (feed.organisation_id === null) {
      matching.push({
        id: feed.id,
        organisationId: feed.organisation_id,
        privacyMode: feed.privacy_mode,
      });
      continue;
    }
    const people = await resolvePeopleForFeed({
      clerkOrgId: input.clerkOrgId,
      createdByUserId: feed.created_by_user_id,
      organisationId: input.organisationId,
      preloaded,
      scopes: feed.scopes.map((scope) => ({
        scopeType: scope.scope_type,
        scopeValue: scope.scope_value,
      })),
    });
    // If scope resolution fails we cannot prove the person is out of scope; invalidate
    // defensively so a transient error never leaves a stale feed body in the cache.
    if (!people.ok) {
      matching.push({
        id: feed.id,
        organisationId: feed.organisation_id,
        privacyMode: feed.privacy_mode,
      });
      continue;
    }
    if (people.value.some((person) => wanted.has(person.id))) {
      matching.push({
        id: feed.id,
        organisationId: feed.organisation_id,
        privacyMode: feed.privacy_mode,
      });
    }
  }
  return matching;
}

export async function invalidateFeedCachesForPerson(input: {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}): Promise<Result<{ feedIds: string[] }, FeedCacheError>> {
  const feeds = await feedIdsForPeople({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    personIds: [input.personId],
  });
  const results = await Promise.all(
    feeds.map((feed) =>
      invalidateFeedCache({
        feedId: feed.id,
        privacyModes: [...ALL_PRIVACY_MODES],
      })
    )
  );
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    return failed[0];
  }
  return { ok: true, value: { feedIds: feeds.map((f) => f.id) } };
}

const feedScopeSelect = {
  created_by_user_id: true,
  id: true,
  organisation_id: true,
  privacy_mode: true,
  scopes: {
    select: {
      scope_type: true,
      scope_value: true,
    },
  },
} satisfies Prisma.FeedSelect;

// Company membership or removal changes every account feed, even without a remaining person.
export async function invalidateAccountFeedCaches(input: {
  clerkOrgId: string;
}): Promise<Result<{ feedIds: string[] }, FeedCacheError>> {
  const feeds = await tenantDatabase(input.clerkOrgId).feed.findMany({
    select: { id: true },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      organisation_id: null,
    },
  });
  const results = await Promise.all(
    feeds.map((feed) =>
      invalidateFeedCache({
        feedId: feed.id,
        privacyModes: [...ALL_PRIVACY_MODES],
      })
    )
  );
  const failure = results.find((result) => !result.ok);
  return (
    failure ?? { ok: true, value: { feedIds: feeds.map((feed) => feed.id) } }
  );
}

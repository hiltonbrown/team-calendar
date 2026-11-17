import "server-only";

import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  type TenantDb,
} from "@repo/database";
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
export async function feedIdsForPeople(
  input: {
    accountId: string;
    organisationId: string;
    personIds: string[];
  },
  db: TenantDb
): Promise<
  Array<{ id: string; organisationId: string | null; privacyMode: string }>
> {
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    if (input.personIds.length === 0) {
      return [];
    }
    const scopeInput = {
      accountId: input.accountId,
      organisationId: input.organisationId,
    };
    const preloadedResult = await loadFeedScopeData(scopeInput, client);
    if (!preloadedResult.ok) {
      throw new Error(preloadedResult.error.message);
    }
    const preloaded = preloadedResult.value;

    const wanted = new Set(input.personIds);
    const feeds = await client.feed.findMany({
      select: feedScopeSelect,
      where: {
        account_id: input.accountId,
        archived_at: null,
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
      const people = await resolvePeopleForFeed(
        {
          accountId: input.accountId,
          createdByUserId: feed.created_by_user_id,
          organisationId: input.organisationId,
          preloaded,
          scopes: feed.scopes.map((scope) => ({
            scopeType: scope.scope_type,
            scopeValue: scope.scope_value,
          })),
        },
        client
      );
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
}

export async function invalidateFeedCachesForPerson(
  input: {
    accountId: string;
    organisationId: string;
    personId: string;
  },
  db: TenantDb
): Promise<Result<{ feedIds: string[] }, FeedCacheError>> {
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const feeds = await feedIdsForPeople(
      {
        accountId: input.accountId,
        organisationId: input.organisationId,
        personIds: [input.personId],
      },
      client
    );
    const feedIds = feeds.map((feed) => feed.id);
    afterTenantCommit(client, () => invalidateCommittedFeedCaches(feedIds));
    return { ok: true, value: { feedIds } };
  }
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
export async function invalidateAccountFeedCaches(
  input: {
    accountId: string;
  },
  db: TenantDb
): Promise<Result<{ feedIds: string[] }, FeedCacheError>> {
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const feeds = await client.feed.findMany({
      select: { id: true },
      where: {
        account_id: input.accountId,
        archived_at: null,
        organisation_id: null,
      },
    });
    const feedIds = feeds.map((feed) => feed.id);
    afterTenantCommit(client, () => invalidateCommittedFeedCaches(feedIds));
    return { ok: true, value: { feedIds } };
  }
}

async function invalidateCommittedFeedCaches(feedIds: string[]): Promise<void> {
  const outcomes = await Promise.all(
    feedIds.map((feedId) =>
      invalidateFeedCache({ feedId, privacyModes: [...ALL_PRIVACY_MODES] })
    )
  );
  const failure = outcomes.find((outcome) => !outcome.ok);
  if (failure && !failure.ok) {
    throw new Error(failure.error.message);
  }
}

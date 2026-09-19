import "server-only";

import { createHash } from "node:crypto";
import type { Result } from "@repo/core";
import type { Prisma } from "@repo/database";
import { database } from "@repo/database";
import type { availability_privacy_mode } from "@repo/database/generated/enums";
import { log } from "@repo/observability/log";
import ical, { ICalEventTransparency } from "ical-generator";
import {
  feedCacheKey,
  getCachedFeedBody,
  setCachedFeedBody,
} from "../cache/feed-cache";
import { projectFeedEvents } from "../projection/feed-projection";
import {
  hashFeedToken,
  signedFeedTokenId,
  verifySignedFeedToken,
} from "../tokens/token-service";

const feedTokenSelect = {
  clerk_org_id: true,
  expires_at: true,
  feed: {
    select: {
      id: true,
      name: true,
      privacy_mode: true,
      status: true,
    },
  },
  feed_id: true,
  id: true,
  last_used_at: true,
  organisation_id: true,
  status: true,
  token_hash: true,
} satisfies Prisma.FeedTokenSelect;

type FeedTokenRow = Prisma.FeedTokenGetPayload<{
  select: typeof feedTokenSelect;
}>;

export interface RenderedFeed {
  activation?: Promise<null | {
    clerkOrgId: string;
    organisationId: string;
    occurredAt: Date;
  }>;
  body: string;
  etag: string;
  status: "active" | "expired" | "revoked";
}

export type FeedRenderError =
  | { code: "not_found"; message: string }
  | { code: "unknown_error"; message: string };

export interface FeedBody {
  body: string;
  etag: string;
}

// Build the ICS body and its etag for a feed under a given privacy mode. Shared by the
// per-token render path and the rebuild-feed-cache job so both produce byte-identical
// bodies and the same cache key.
export async function renderFeedBody(input: {
  clerkOrgId: string;
  feedId: string;
  feedName: string;
  organisationId: string;
  privacyMode: availability_privacy_mode;
}): Promise<Result<FeedBody, FeedRenderError>> {
  const projected = await projectFeedEvents({
    actingRole: "viewer",
    clerkOrgId: input.clerkOrgId,
    feedId: input.feedId,
    horizonDays: 366,
    organisationId: input.organisationId,
    privacyMode: input.privacyMode,
  });
  if (!projected.ok) {
    if (projected.error.code === "feed_not_found") {
      return {
        error: { code: "not_found", message: "Feed not found" },
        ok: false,
      };
    }
    log.warn("Feed projection failed", {
      errorCode: projected.error.code,
      feedId: input.feedId,
    });
    return {
      error: { code: "unknown_error", message: "Failed to render feed" },
      ok: false,
    };
  }

  try {
    const calendar = ical({
      name: input.feedName,
      prodId: { company: "Team Calendar", product: "Team Calendar" },
    });

    for (const event of projected.value) {
      calendar.createEvent({
        allDay: event.allDay,
        description: event.description ?? undefined,
        end: event.endsAt,
        id: event.publishedUid,
        location: event.location ?? undefined,
        sequence: event.publishedSequence,
        start: event.startsAt,
        summary: event.summary,
        transparency: ICalEventTransparency.OPAQUE,
      });
    }

    const body = calendar.toString();
    const etag = createHash("sha256").update(body).digest("hex");
    return { ok: true, value: { body, etag } };
  } catch (error) {
    log.warn("Feed ICS serialisation failed", { error, feedId: input.feedId });
    return {
      error: { code: "unknown_error", message: "Failed to render feed" },
      ok: false,
    };
  }
}

export async function cachedEtagForToken(
  token: string
): Promise<null | string> {
  const feedToken = await resolveFeedToken(token);

  if (
    feedToken?.status !== "active" ||
    (feedToken.expires_at && feedToken.expires_at < new Date()) ||
    feedToken.feed.status !== "active"
  ) {
    return null;
  }

  const key = feedCacheKey({
    feedId: feedToken.feed.id,
    privacyMode: feedToken.feed.privacy_mode,
  });
  const cached = await getCachedFeedBody(key);
  if (cached.ok && cached.value) {
    return cached.value.etag;
  }

  return null;
}

export async function renderFeedForToken(
  token: string
): Promise<Result<RenderedFeed, FeedRenderError>> {
  const feedToken = await resolveFeedToken(token);

  if (!feedToken) {
    return {
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    };
  }

  if (feedToken.status !== "active") {
    return {
      ok: true,
      value: { body: "", etag: "", status: feedToken.status },
    };
  }

  if (feedToken.expires_at && feedToken.expires_at < new Date()) {
    await database.feedToken.update({
      data: { status: "expired" },
      where: { id: feedToken.id },
    });
    return {
      ok: true,
      value: { body: "", etag: "", status: "expired" },
    };
  }

  if (feedToken.feed.status !== "active") {
    return {
      ok: true,
      value: { body: "", etag: "", status: "revoked" },
    };
  }

  const key = feedCacheKey({
    feedId: feedToken.feed.id,
    privacyMode: feedToken.feed.privacy_mode,
  });
  const cached = await getCachedFeedBody(key);
  if (cached.ok && cached.value) {
    return {
      ok: true,
      value: withActivation({ ...cached.value, status: "active" }, feedToken),
    };
  }

  const rendered = await renderFeedBody({
    clerkOrgId: feedToken.clerk_org_id,
    feedId: feedToken.feed_id,
    feedName: feedToken.feed.name,
    organisationId: feedToken.organisation_id,
    privacyMode: feedToken.feed.privacy_mode,
  });
  if (!rendered.ok) {
    return { error: rendered.error, ok: false };
  }
  const { body, etag } = rendered.value;

  await Promise.all([
    database.feed.update({
      data: {
        last_etag: etag,
        last_rendered_at: new Date(),
      },
      // Scope the write by clerk_org_id and organisation_id as well as the unique id,
      // per the tenant-isolation rule that every tenant-data query filters by clerk_org_id.
      where: {
        clerk_org_id: feedToken.clerk_org_id,
        id: feedToken.feed_id,
        organisation_id: feedToken.organisation_id,
      },
    }),
  ]);

  // The KV cache is a performance layer; a write failure must not fail the response.
  try {
    await setCachedFeedBody({ body, etag, key, ttlSeconds: 3600 });
  } catch (error) {
    log.warn("Feed cache write failed", {
      error,
      feedId: feedToken.feed_id,
    });
  }

  return {
    ok: true,
    value: withActivation({ body, etag, status: "active" }, feedToken),
  };
}

function withActivation(
  rendered: RenderedFeed,
  token: FeedTokenRow
): RenderedFeed {
  Object.defineProperty(rendered, "activation", {
    enumerable: false,
    value: firstFeedAccess(token),
  });
  return rendered;
}

async function resolveFeedToken(token: string): Promise<FeedTokenRow | null> {
  const tokenId = signedFeedTokenId(token);
  if (!tokenId) {
    return database.feedToken.findUnique({
      select: feedTokenSelect,
      where: { token_hash: hashFeedToken(token) },
    });
  }

  const feedToken = await database.feedToken.findUnique({
    select: feedTokenSelect,
    where: { id: tokenId },
  });
  if (
    !(
      feedToken &&
      verifySignedFeedToken({
        token,
        tokenHash: feedToken.token_hash,
        tokenId: feedToken.id,
      })
    )
  ) {
    return null;
  }
  return feedToken;
}

async function firstFeedAccess(token: FeedTokenRow): Promise<null | {
  clerkOrgId: string;
  organisationId: string;
  occurredAt: Date;
}> {
  try {
    await markTokenUsed(token);
    const first = await database.feedToken.findFirst({
      orderBy: { last_used_at: "asc" },
      select: { last_used_at: true },
      where: {
        clerk_org_id: token.clerk_org_id,
        last_used_at: { not: null },
        organisation_id: token.organisation_id,
      },
    });
    return first?.last_used_at
      ? {
          clerkOrgId: token.clerk_org_id,
          occurredAt: first.last_used_at,
          organisationId: token.organisation_id,
        }
      : null;
  } catch (error) {
    log.warn("Feed token use write failed", {
      error,
      feedId: token.feed_id,
    });
    return null;
  }
}

function markTokenUsed(token: FeedTokenRow): Promise<unknown> {
  if (token.last_used_at) {
    return Promise.resolve();
  }
  return database.feedToken.updateMany({
    data: { last_used_at: new Date() },
    where: {
      clerk_org_id: token.clerk_org_id,
      id: token.id,
      last_used_at: null,
      organisation_id: token.organisation_id,
    },
  });
}

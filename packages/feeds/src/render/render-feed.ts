import "server-only";

import { createHash } from "node:crypto";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { availability_privacy_mode } from "@repo/database/generated/enums";
import ical, { ICalEventTransparency } from "ical-generator";
import {
  feedCacheKey,
  getCachedFeedBody,
  setCachedFeedBody,
} from "../cache/feed-cache";
import { projectFeedEvents } from "../projection/feed-projection";
import { hashFeedToken } from "../tokens/token-service";

export interface RenderedFeed {
  body: string;
  etag: string;
  status: "active" | "expired" | "revoked";
}

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
}): Promise<Result<FeedBody>> {
  const projected = await projectFeedEvents({
    actingRole: "viewer",
    clerkOrgId: input.clerkOrgId,
    feedId: input.feedId,
    horizonDays: 366,
    organisationId: input.organisationId,
    privacyMode: input.privacyMode,
  });
  if (!projected.ok) {
    return {
      ok: false,
      error: { code: "not_found", message: "Feed not found" },
    };
  }

  const calendar = ical({
    name: input.feedName,
    prodId: { company: "LeaveSync", product: "LeaveSync" },
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
      // All published events mark the subscriber as busy.
      transparency: ICalEventTransparency.OPAQUE,
    });
  }

  const body = calendar.toString();
  const etag = createHash("sha256").update(body).digest("hex");
  return { ok: true, value: { body, etag } };
}

export async function renderFeedForToken(
  token: string
): Promise<Result<RenderedFeed>> {
  const feedToken = await database.feedToken.findUnique({
    where: { token_hash: hashFeedToken(token) },
    include: { feed: true },
  });

  if (!feedToken) {
    return {
      ok: false,
      error: { code: "not_found", message: "Feed not found" },
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
      where: { id: feedToken.id },
      data: { status: "expired" },
    });
    return { ok: true, value: { body: "", etag: "", status: "expired" } };
  }

  if (feedToken.feed.status !== "active") {
    return { ok: true, value: { body: "", etag: "", status: "revoked" } };
  }

  const key = feedCacheKey({
    feedId: feedToken.feed.id,
    feedUpdatedAt: feedToken.feed.updated_at,
    privacyMode: feedToken.feed.privacy_mode,
  });
  const cached = await getCachedFeedBody(key);
  if (cached.ok && cached.value) {
    await markTokenUsed(feedToken);
    return { ok: true, value: { ...cached.value, status: "active" } };
  }

  const rendered = await renderFeedBody({
    clerkOrgId: feedToken.clerk_org_id,
    feedId: feedToken.feed_id,
    feedName: feedToken.feed.name,
    organisationId: feedToken.organisation_id,
    privacyMode: feedToken.feed.privacy_mode,
  });
  if (!rendered.ok) {
    return {
      ok: false,
      error: { code: "not_found", message: "Feed not found" },
    };
  }
  const { body, etag } = rendered.value;

  await Promise.all([
    markTokenUsed(feedToken),
    database.feed.update({
      data: {
        last_etag: etag,
        last_rendered_at: new Date(),
      },
      // Scope the write by clerk_org_id and organisation_id as well as the unique id,
      // per the tenant-isolation rule that every tenant-data query filters by clerk_org_id.
      where: {
        id: feedToken.feed_id,
        clerk_org_id: feedToken.clerk_org_id,
        organisation_id: feedToken.organisation_id,
      },
    }),
    setCachedFeedBody({ body, etag, key, ttlSeconds: 3600 }),
  ]);

  return { ok: true, value: { body, etag, status: "active" } };
}

function markTokenUsed(token: {
  id: string;
  clerk_org_id: string;
  organisation_id: string;
}): Promise<unknown> {
  return database.feedToken.update({
    data: { last_used_at: new Date() },
    // Scope the write by clerk_org_id and organisation_id as well as the unique id.
    where: {
      id: token.id,
      clerk_org_id: token.clerk_org_id,
      organisation_id: token.organisation_id,
    },
  });
}

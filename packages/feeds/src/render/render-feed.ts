import "server-only";

import { createHash } from "node:crypto";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
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
    await markTokenUsed(feedToken.id);
    return { ok: true, value: { ...cached.value, status: "active" } };
  }

  const projected = await projectFeedEvents({
    actingRole: "viewer",
    clerkOrgId: feedToken.clerk_org_id,
    feedId: feedToken.feed_id,
    horizonDays: 366,
    organisationId: feedToken.organisation_id,
    privacyMode: feedToken.feed.privacy_mode,
  });
  if (!projected.ok) {
    return {
      ok: false,
      error: { code: "not_found", message: "Feed not found" },
    };
  }

  const calendar = ical({
    name: feedToken.feed.name,
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
      transparency: event.isPublicHoliday
        ? ICalEventTransparency.OPAQUE
        : ICalEventTransparency.OPAQUE,
    });
  }

  const body = calendar.toString();
  const etag = createHash("sha256").update(body).digest("hex");

  await Promise.all([
    markTokenUsed(feedToken.id),
    database.feed.update({
      data: {
        last_etag: etag,
        last_rendered_at: new Date(),
      },
      where: { id: feedToken.feed_id },
    }),
    setCachedFeedBody({ body, etag, key, ttlSeconds: 3600 }),
  ]);

  return { ok: true, value: { body, etag, status: "active" } };
}

function markTokenUsed(tokenId: string): Promise<unknown> {
  return database.feedToken.update({
    data: { last_used_at: new Date() },
    where: { id: tokenId },
  });
}

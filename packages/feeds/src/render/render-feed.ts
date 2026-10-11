import "server-only";

import { createHash } from "node:crypto";
import type { Result } from "@repo/core";
import type { Prisma } from "@repo/database";
import {
  resolveAccountCompanies,
  systemDatabase,
  tenantDatabase,
} from "@repo/database";
import type { availability_privacy_mode } from "@repo/database/generated/enums";
import { log } from "@repo/observability/log";
import ical, { ICalEventClass, ICalEventTransparency } from "ical-generator";
import {
  feedCacheKey,
  getCachedFeedBody,
  setCachedFeedBody,
} from "../cache/feed-cache";
import {
  establishFeedRepresentation,
  type FeedRepresentation,
} from "../publication/feed-representation";
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
  fingerprint: string;
  generation: number;
}

// Build the ICS body and its etag for a feed under a given privacy mode. Shared by the
// per-token render path and the rebuild-feed-cache job so both produce byte-identical
// bodies and the same cache key.
export async function renderFeedBody(input: {
  clerkOrgId: string;
  feedId: string;
  feedName: string;
  organisationId: string | null;
  privacyMode: availability_privacy_mode;
}): Promise<Result<FeedBody, FeedRenderError>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await establishFeedRepresentation(input);
    if (!snapshot.ok) {
      return snapshot;
    }
    try {
      const { body, etag } = await bodyForRepresentation(
        input.feedId,
        snapshot.value
      );
      const current = await establishFeedRepresentation(input);
      if (!current.ok) {
        return current;
      }
      if (current.value.fingerprint !== snapshot.value.fingerprint) {
        continue;
      }
      return {
        ok: true,
        value: {
          body,
          etag,
          fingerprint: snapshot.value.fingerprint,
          generation: snapshot.value.generation,
        },
      };
    } catch (error) {
      log.warn("Feed ICS serialisation failed", {
        error,
        feedId: input.feedId,
      });
      return {
        error: { code: "unknown_error", message: "Failed to render feed" },
        ok: false,
      };
    }
  }
  return {
    error: {
      code: "unknown_error",
      message: "Feed changed during rendering. Please retry.",
    },
    ok: false,
  };
}

export async function cachedEtagForToken(
  token: string
): Promise<null | string> {
  const result = await renderFeedForToken(token);
  return result.ok && result.value.status === "active"
    ? result.value.etag
    : null;
}

export async function renderFeedForToken(
  token: string
): Promise<Result<RenderedFeed, FeedRenderError>> {
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await renderFeedAttempt(token);
      if (result) {
        return result;
      }
    }
    return {
      error: {
        code: "unknown_error",
        message: "Feed changed during rendering. Please retry.",
      },
      ok: false,
    };
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to load current feed." },
      ok: false,
    };
  }
}

async function renderFeedAttempt(
  token: string
): Promise<Result<RenderedFeed, FeedRenderError> | null> {
  const feedToken = await resolveFeedToken(token);
  if (!feedToken) {
    return {
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    };
  }
  const inactive = await persistedInactiveStatus(feedToken);
  if (inactive) {
    return { ok: true, value: { body: "", etag: "", status: inactive } };
  }
  const input = {
    clerkOrgId: feedToken.clerk_org_id,
    feedId: feedToken.feed_id,
    feedName: feedToken.feed.name,
    organisationId: feedToken.organisation_id,
    privacyMode: feedToken.feed.privacy_mode,
  };
  const rendered = await renderFeedBody(input);
  if (!rendered.ok) {
    return rendered;
  }
  await persistRenderedBody(feedToken, rendered.value);
  const current = await establishFeedRepresentation(input);
  if (!current.ok) {
    return current;
  }
  if (current.value.fingerprint !== rendered.value.fingerprint) {
    return null;
  }
  const finalToken = await resolveFeedToken(token);
  if (!finalToken) {
    return {
      error: { code: "not_found", message: "Feed not found" },
      ok: false,
    };
  }
  const finalInactive = await persistedInactiveStatus(finalToken);
  if (finalInactive) {
    return { ok: true, value: { body: "", etag: "", status: finalInactive } };
  }
  const { body, etag } = rendered.value;
  return {
    ok: true,
    value: withActivation({ body, etag, status: "active" }, finalToken),
  };
}

async function bodyForRepresentation(
  feedId: string,
  snapshot: FeedRepresentation
): Promise<{ body: string; etag: string }> {
  if (snapshot.cacheEtag) {
    const cached = await getCachedFeedBody(
      feedCacheKey({ etag: snapshot.cacheEtag, feedId })
    );
    if (cached.ok && cached.value?.etag === snapshot.cacheEtag) {
      return cached.value;
    }
  }
  const calendar = ical({
    name: snapshot.feedName,
    prodId: { company: "Team Calendar", product: "Team Calendar" },
  });
  for (const event of snapshot.events) {
    if (!event.publishedAt) {
      throw new Error("Feed event lacks a durable publication timestamp");
    }
    calendar.createEvent({
      allDay: event.allDay,
      class:
        event.eventClass === "PUBLIC"
          ? ICalEventClass.PUBLIC
          : ICalEventClass.PRIVATE,
      description: event.description ?? undefined,
      end: event.endsAt,
      id: event.publishedUid,
      location: event.location ?? undefined,
      sequence: event.publishedSequence,
      stamp: event.publishedAt,
      start: event.startsAt,
      summary: event.summary,
      transparency: ICalEventTransparency.OPAQUE,
    });
  }
  const body = calendar.toString();
  return { body, etag: createHash("sha256").update(body).digest("hex") };
}

async function persistRenderedBody(
  token: FeedTokenRow,
  rendered: FeedBody
): Promise<void> {
  await tenantDatabase(token.clerk_org_id).feed.updateMany({
    data: { last_etag: rendered.etag, last_rendered_at: new Date() },
    where: {
      clerk_org_id: token.clerk_org_id,
      id: token.feed_id,
      organisation_id: token.organisation_id,
      representation_generation: rendered.generation,
    },
  });
  try {
    const stored = await setCachedFeedBody({
      body: rendered.body,
      etag: rendered.etag,
      key: feedCacheKey({ etag: rendered.etag, feedId: token.feed_id }),
      ttlSeconds: 3600,
    });
    if (!stored.ok) {
      log.warn("Feed cache write failed", { feedId: token.feed_id });
    }
  } catch (error) {
    log.warn("Feed cache write failed", { error, feedId: token.feed_id });
  }
}

async function persistedInactiveStatus(
  token: FeedTokenRow
): Promise<"expired" | "revoked" | null> {
  const inactive = tokenInactiveStatus(token);
  if (inactive === "expired" && token.status === "active") {
    await tenantDatabase(token.clerk_org_id).feedToken.updateMany({
      data: { status: "expired" },
      where: {
        clerk_org_id: token.clerk_org_id,
        expires_at: { lt: new Date() },
        id: token.id,
        organisation_id: token.organisation_id,
        status: "active",
      },
    });
  }
  return inactive;
}

function tokenInactiveStatus(
  token: FeedTokenRow
): "expired" | "revoked" | null {
  if (token.status !== "active") {
    return token.status;
  }
  if (token.expires_at && token.expires_at < new Date()) {
    return "expired";
  }
  return token.feed.status === "active" ? null : "revoked";
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
    return systemDatabase.feedToken.findUnique({
      select: feedTokenSelect,
      where: { token_hash: hashFeedToken(token) },
    });
  }

  const feedToken = await systemDatabase.feedToken.findUnique({
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
    const occurredAt = new Date();
    const auditOrganisationId =
      token.organisation_id ??
      (await resolveAccountCompanies(token.clerk_org_id))[0]?.id;
    if (!auditOrganisationId) {
      await markTokenUsed(token, occurredAt);
      return null;
    }
    await Promise.all([
      markTokenUsed(token, occurredAt),
      tenantDatabase(token.clerk_org_id).auditEvent.createMany({
        data: {
          action: "activation.first_feed_accessed",
          clerk_org_id: token.clerk_org_id,
          created_at: occurredAt,
          id: activationMilestoneId(
            token.clerk_org_id,
            token.organisation_id,
            "first_feed_accessed"
          ),
          organisation_id: auditOrganisationId,
          resource_type: "activation_milestone",
        },
        skipDuplicates: true,
      }),
    ]);
    const first = await tenantDatabase(
      token.clerk_org_id
    ).auditEvent.findUnique({
      select: { created_at: true },
      where: {
        clerk_org_id: token.clerk_org_id,
        id: activationMilestoneId(
          token.clerk_org_id,
          token.organisation_id,
          "first_feed_accessed"
        ),
        organisation_id: auditOrganisationId,
      },
    });
    return first?.created_at
      ? {
          clerkOrgId: token.clerk_org_id,
          occurredAt: first.created_at,
          organisationId: auditOrganisationId,
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

function markTokenUsed(
  token: FeedTokenRow,
  occurredAt: Date
): Promise<unknown> {
  const oneHourAgo = new Date(occurredAt.getTime() - 60 * 60 * 1000);
  if (token.last_used_at && token.last_used_at >= oneHourAgo) {
    return Promise.resolve();
  }
  return tenantDatabase(token.clerk_org_id).feedToken.updateMany({
    data: { last_used_at: occurredAt },
    where: {
      clerk_org_id: token.clerk_org_id,
      id: token.id,
      OR: [{ last_used_at: null }, { last_used_at: { lt: oneHourAgo } }],
      organisation_id: token.organisation_id,
    },
  });
}

function activationMilestoneId(
  clerkOrgId: string,
  organisationId: string | null,
  milestone: string
): string {
  const hex = createHash("sha256")
    .update(`${clerkOrgId}:${organisationId}:${milestone}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

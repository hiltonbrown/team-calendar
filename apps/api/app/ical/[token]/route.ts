import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { renderFeedForToken } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { after } from "next/server";
import {
  checkFeedRateLimit,
  extractClientIp,
  hashToken,
} from "../../../lib/rate-limit/feed-rate-limit";

const weakEtagPrefixPattern = /^W\//;

function etagMatches(
  ifNoneMatchHeader: string,
  expectedQuotedEtag: string
): boolean {
  return ifNoneMatchHeader
    .split(",")
    .map((candidate) => candidate.trim().replace(weakEtagPrefixPattern, ""))
    .includes(expectedQuotedEtag);
}

/**
 * GET /ical/:token.ics
 *
 * Renders and serves a private calendar feed as an ICS file.
 *
 * Responses:
 * - 200 OK: Active feed (ICS body)
 * - 304 Not Modified: ETag matches If-None-Match
 * - 410 Gone: Expired or revoked token
 * - 404 Not Found: Token not found or feed inactive
 * - 429 Too Many Requests: Rate limit exceeded for client IP or token probe
 * - 503 Service Unavailable: Transient render/projection failure (retryable)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: tokenParam } = await params;
  const token = tokenParam.endsWith(".ics")
    ? tokenParam.slice(0, -".ics".length)
    : tokenParam;

  const clientIp = extractClientIp(request);
  const tokenDigest = hashToken(token);
  const rateLimitResult = await checkFeedRateLimit({
    clientIp,
    tokenDigest,
  });

  if (!rateLimitResult.allowed) {
    return new Response("Too Many Requests", {
      headers: {
        "Retry-After": String(rateLimitResult.retryAfter ?? 60),
      },
      status: 429,
    });
  }

  // Render or retrieve cached feed for this token in a single resolution step
  const feedResult = await renderFeedForToken(token);

  if (!feedResult.ok) {
    if (feedResult.error.code === "unknown_error") {
      log.warn(`Feed render failed: ${feedResult.error.code}`);
      return new Response("Temporarily unavailable", {
        headers: { "Retry-After": "60" },
        status: 503,
      });
    }
    return new Response("Not found", { status: 404 });
  }

  const { body, etag, status } = feedResult.value;

  // Handle expired or revoked tokens
  if (status === "expired" || status === "revoked") {
    return new Response("Gone", { status: 410 });
  }

  if (feedResult.value.activation) {
    const activationPromise = feedResult.value.activation;
    after(async () => {
      const activation = await activationPromise;
      if (!activation) {
        return;
      }
      const event = createActivationEvent({
        deduplicationKey: `${activation.clerkOrgId}:${activation.organisationId}`,
        name: "First Feed Accessed",
        occurredAt: activation.occurredAt,
        subjectId: activation.clerkOrgId,
      });
      analytics?.capture({
        distinctId: event.distinctId,
        event: event.event,
        properties: event.properties,
        timestamp: event.timestamp,
        uuid: event.uuid,
      });
      await analytics?.flush();
    });
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  const quotedEtag = `"${etag}"`;
  if (ifNoneMatch && etagMatches(ifNoneMatch, quotedEtag)) {
    return new Response(null, {
      headers: {
        "Cache-Control": "max-age=3600, must-revalidate",
        ETag: quotedEtag,
      },
      status: 304,
    });
  }

  // Return the active feed
  return new Response(body, {
    headers: {
      "Cache-Control": "max-age=3600, must-revalidate",
      "Content-Type": "text/calendar;charset=utf-8",
      ETag: quotedEtag,
    },
    status: 200,
  });
}

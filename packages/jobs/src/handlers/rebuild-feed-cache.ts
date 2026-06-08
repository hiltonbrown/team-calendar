import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import {
  feedCacheKey,
  invalidateFeedCache,
  renderFeedBody,
  setCachedFeedBody,
} from "@repo/feeds";
import { log } from "@repo/observability/log";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const FEED_CACHE_TTL_SECONDS = 3600;

const RebuildFeedCacheInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
  reason: z.string().min(1).optional(),
});

export type RebuildFeedCacheInput = z.infer<typeof RebuildFeedCacheInputSchema>;

export type RebuildFeedCacheError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type RebuildFeedCacheResult = Result<
  { feedId: string; rebuilt: boolean; skipped: boolean },
  RebuildFeedCacheError
>;

export const rebuildFeedCacheFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "rebuild-feed-cache",
      triggers: { event: "rebuild-feed-cache" },
    },
    async ({ event, step }) =>
      await step.run("rebuild-feed-cache", async () =>
        rebuildFeedCache(event.data)
      )
  );

export async function rebuildFeedCache(
  input: unknown
): Promise<RebuildFeedCacheResult> {
  const parsed = RebuildFeedCacheInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const context = parsed.data;

  try {
    const feed = await database.feed.findFirst({
      select: {
        id: true,
        name: true,
        privacy_mode: true,
        updated_at: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: context.clerkOrgId,
        id: context.feedId,
        organisation_id: context.organisationId,
        status: "active",
      },
    });
    if (!feed) {
      // Feed is paused, archived, or out of this tenant's scope. Drop any cached body so a
      // stale feed is never served, then treat the rebuild as a no-op.
      await invalidateFeedCache({ feedId: context.feedId });
      return {
        ok: true,
        value: { feedId: context.feedId, rebuilt: false, skipped: true },
      };
    }

    await invalidateFeedCache({ feedId: feed.id });

    const rendered = await renderFeedBody({
      clerkOrgId: context.clerkOrgId,
      feedId: feed.id,
      feedName: feed.name,
      organisationId: context.organisationId,
      privacyMode: feed.privacy_mode,
    });
    if (!rendered.ok) {
      log.error("Failed to render feed body during rebuild", {
        clerkOrgId: context.clerkOrgId,
        error: rendered.error,
        feedId: feed.id,
        organisationId: context.organisationId,
      });
      return {
        ok: true,
        value: { feedId: feed.id, rebuilt: false, skipped: false },
      };
    }

    await setCachedFeedBody({
      body: rendered.value.body,
      etag: rendered.value.etag,
      key: feedCacheKey({
        feedId: feed.id,
        feedUpdatedAt: feed.updated_at,
        privacyMode: feed.privacy_mode,
      }),
      ttlSeconds: FEED_CACHE_TTL_SECONDS,
    });

    return {
      ok: true,
      value: { feedId: feed.id, rebuilt: true, skipped: false },
    };
  } catch (error) {
    log.error("Unhandled exception in rebuildFeedCache:", { error });
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to rebuild feed cache.",
      },
    };
  }
}

function validationError(error: z.ZodError): RebuildFeedCacheResult {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message:
        error.issues[0]?.message ?? "Invalid rebuild feed cache request.",
    },
  };
}

import {
  currentXeroCampaignInvocation,
  dispatchXeroCampaignChild,
  withXeroCampaignScopedInvocation,
} from "@repo/database/xero-campaign-access";
import { XeroCampaignEventSchema } from "@repo/database/xero-campaign-contract";
import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import {
  feedIdsForPeople,
  materialiseAvailabilityPublication,
} from "@repo/feeds";
import { log } from "@repo/observability/log";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const BATCH_SIZE = 100;
const PAGE_SIZE = 500;
const MAX_PAGES = 1000;

const ReconcileFeedPublicationsInputSchema = z.object({
  bindingGeneration: z.number().int().nonnegative().optional(),
  campaign: XeroCampaignEventSchema.optional(),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  xeroTenantId: z.uuid().optional(),
});

export type ReconcileFeedPublicationsInput = z.infer<
  typeof ReconcileFeedPublicationsInputSchema
>;

export type ReconcileFeedPublicationsError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

interface ReconcileCounts {
  changed: number;
  failed: number;
  feedsQueued: number;
  scanned: number;
}

type ReconcileFeedPublicationsResult = Result<
  ReconcileCounts,
  ReconcileFeedPublicationsError
>;

export const reconcileFeedPublicationsFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "reconcile-feed-publications",
      triggers: { event: "reconcile-feed-publications" },
    },
    async ({ event, step, runId: workerRunId }) =>
      await step.run("reconcile-feed-publications", async () => {
        const result = await reconcileFeedPublications(event.data, workerRunId);
        if (!result.ok) {
          throw new Error(result.error.message);
        }
        return result.value;
      })
  );

export async function reconcileFeedPublications(
  input: unknown,
  workerRunId: string | null = null
) {
  const parsed = ReconcileFeedPublicationsInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  return await withXeroCampaignScopedInvocation(
    "reconcile-feed-publications",
    input,
    () => reconcileFeedPublicationsUnderCampaign(input),
    workerRunId
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Preserve bounded per-record isolation and attributed child dispatch under one campaign scope.
async function reconcileFeedPublicationsUnderCampaign(
  input: unknown
): Promise<ReconcileFeedPublicationsResult> {
  const parsed = ReconcileFeedPublicationsInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const context = parsed.data;

  try {
    const counts: ReconcileCounts = {
      changed: 0,
      failed: 0,
      feedsQueued: 0,
      scanned: 0,
    };
    const changedPersonIds = new Set<string>();

    let cursor: string | null = null;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const records: Array<{ id: string; person_id: string }> =
        await database.availabilityRecord.findMany({
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: "asc" },
          select: { id: true, person_id: true },
          skip: cursor ? 1 : 0,
          take: PAGE_SIZE,
          where: {
            clerk_org_id: context.clerkOrgId,
            organisation_id: context.organisationId,
          },
        });
      if (records.length === 0) {
        break;
      }
      counts.scanned += records.length;

      for (let index = 0; index < records.length; index += BATCH_SIZE) {
        const batch = records.slice(index, index + BATCH_SIZE);
        // Promise.all over already-caught promises: a single record's failure is
        // recorded and the run continues, matching the record-level isolation
        // rule for sync jobs. BATCH_SIZE is now a real concurrency limit rather
        // than a cosmetic slice, and it is bounded by the database connection
        // pool, not by CPU.
        await Promise.all(
          batch.map((record) =>
            reconcileOne(context, record, counts, changedPersonIds)
          )
        );
      }

      cursor = records.at(-1)?.id ?? null;
      pages += 1;
      if (records.length < PAGE_SIZE) {
        break;
      }
    }

    if (pages >= MAX_PAGES) {
      log.error("Reached MAX_PAGES limit while reconciling feed publications", {
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
        pageSize: PAGE_SIZE,
        pages,
      });
    }

    if (changedPersonIds.size > 0) {
      const feedIds = await feedIdsForPeople({
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
        personIds: [...changedPersonIds],
      });
      if (currentXeroCampaignInvocation()) {
        for (const feed of feedIds) {
          await dispatchXeroCampaignChild(
            "rebuild-feed-cache",
            {
              clerkOrgId: context.clerkOrgId,
              feedId: feed.id,
              organisationId: context.organisationId,
              reason: "publication_reconciled",
            },
            (event) => inngest.send(event)
          );
        }
      } else {
        await inngest.send(
          feedIds.map((feed) => ({
            data: {
              clerkOrgId: context.clerkOrgId,
              feedId: feed.id,
              organisationId: context.organisationId,
              reason: "publication_reconciled",
            },
            name: "rebuild-feed-cache" as const,
          }))
        );
      }
      counts.feedsQueued = feedIds.length;
    }

    return { ok: true, value: counts };
  } catch (error) {
    log.error("Unhandled exception in reconcileFeedPublications:", { error });
    return {
      error: {
        code: "unknown_error",
        message: "Failed to reconcile feed publications.",
      },
      ok: false,
    };
  }
}

async function reconcileOne(
  context: { clerkOrgId: string; organisationId: string },
  record: { id: string; person_id: string },
  counts: ReconcileCounts,
  changedPersonIds: Set<string>
): Promise<void> {
  // Record-level isolation: a single record's failure must not abort the run.
  // Skip cache invalidation per record; we batch one rebuild per affected feed below.
  try {
    const result = await materialiseAvailabilityPublication({
      availabilityRecordId: record.id,
      clerkOrgId: context.clerkOrgId,
      invalidateCache: false,
      organisationId: context.organisationId,
    });
    if (!result.ok) {
      counts.failed += 1;
      log.error("Failed to reconcile availability publication", {
        availabilityRecordId: record.id,
        clerkOrgId: context.clerkOrgId,
        error: result.error.message,
        organisationId: context.organisationId,
      });
      return;
    }
    if (result.value.changed) {
      // In single-threaded JavaScript runtime, mutating counts and changedPersonIds
      // synchronously (+= 1, Set.add) from concurrent async callbacks is safe because
      // neither yields mid-operation.
      counts.changed += 1;
      changedPersonIds.add(record.person_id);
    }
  } catch (error) {
    counts.failed += 1;
    log.error("Unhandled error reconciling availability publication", {
      availabilityRecordId: record.id,
      clerkOrgId: context.clerkOrgId,
      error,
      organisationId: context.organisationId,
    });
  }
}

function validationError(error: z.ZodError): ReconcileFeedPublicationsResult {
  return {
    error: {
      code: "validation_error",
      message:
        error.issues[0]?.message ??
        "Invalid reconcile feed publications request.",
    },
    ok: false,
  };
}

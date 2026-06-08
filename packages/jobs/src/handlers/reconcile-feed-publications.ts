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

const ReconcileFeedPublicationsInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
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
    async ({ event, step }) =>
      await step.run("reconcile-feed-publications", async () =>
        reconcileFeedPublications(event.data)
      )
  );

export async function reconcileFeedPublications(
  input: unknown
): Promise<ReconcileFeedPublicationsResult> {
  const parsed = ReconcileFeedPublicationsInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const context = parsed.data;

  try {
    const records = await database.availabilityRecord.findMany({
      orderBy: { id: "asc" },
      select: { id: true, person_id: true },
      where: {
        clerk_org_id: context.clerkOrgId,
        organisation_id: context.organisationId,
      },
    });

    const counts: ReconcileCounts = {
      changed: 0,
      failed: 0,
      feedsQueued: 0,
      scanned: records.length,
    };
    const changedPersonIds = new Set<string>();

    for (let index = 0; index < records.length; index += BATCH_SIZE) {
      const batch = records.slice(index, index + BATCH_SIZE);
      for (const record of batch) {
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
            continue;
          }
          if (result.value.changed) {
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
    }

    if (changedPersonIds.size > 0) {
      const feedIds = await feedIdsForPeople({
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
        personIds: [...changedPersonIds],
      });
      for (const feedId of feedIds) {
        await inngest.send({
          data: {
            clerkOrgId: context.clerkOrgId,
            feedId,
            organisationId: context.organisationId,
            reason: "publication_reconciled",
          },
          name: "rebuild-feed-cache",
        });
      }
      counts.feedsQueued = feedIds.length;
    }

    return { ok: true, value: counts };
  } catch (error) {
    log.error("Unhandled exception in reconcileFeedPublications:", { error });
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to reconcile feed publications.",
      },
    };
  }
}

function validationError(error: z.ZodError): ReconcileFeedPublicationsResult {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message:
        error.issues[0]?.message ??
        "Invalid reconcile feed publications request.",
    },
  };
}

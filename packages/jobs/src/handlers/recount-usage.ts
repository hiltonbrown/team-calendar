import "server-only";

import type { LimitType, Result } from "@repo/core";
import { LIMIT_TYPES } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const RecountUsageInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

export type RecountUsageInput = z.infer<typeof RecountUsageInputSchema>;

export type RecountUsageError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type RecountUsageResult = Result<
  { clerkOrgId: string; counts: Record<LimitType, number> },
  RecountUsageError
>;

export const recountUsageFunction: InngestFunction.Any = inngest.createFunction(
  {
    id: "recount-usage",
    triggers: { event: "recount-usage" },
  },
  async ({ event, step }) =>
    await step.run("recount-usage", async () => recountUsage(event.data))
);

/**
 * Recounts hard-limit usage for a Clerk Organisation and writes one
 * usage_counters row per counter dimension. Idempotent: re-running for the same
 * org overwrites current_value in place. Counts active rows only (archived
 * excluded). Iterates LIMIT_TYPES so a new counter type is one added case here
 * plus an enum value, not a rewrite.
 *
 * Usage is anchored on the Clerk Organisation (the billing boundary); the
 * payload carries organisation_id as well to satisfy job tenant-context rules.
 */
export async function recountUsage(
  input: unknown
): Promise<RecountUsageResult> {
  const parsed = RecountUsageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Invalid recount request.",
      },
    };
  }
  const { clerkOrgId } = parsed.data;

  const counters: Record<LimitType, () => Promise<number>> = {
    feeds: () =>
      database.feed.count({
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          status: "active",
        },
      }),
    payroll_entities: () =>
      database.organisation.count({
        where: { archived_at: null, clerk_org_id: clerkOrgId },
      }),
    seats: () =>
      database.person.count({
        where: { archived_at: null, clerk_org_id: clerkOrgId },
      }),
  };

  try {
    const counts = {} as Record<LimitType, number>;
    const now = new Date();

    for (const counterType of LIMIT_TYPES) {
      const value = await counters[counterType]();
      counts[counterType] = value;

      await database.usageCounter.upsert({
        where: {
          clerk_org_id_counter_type: {
            clerk_org_id: clerkOrgId,
            counter_type: counterType,
          },
        },
        create: {
          clerk_org_id: clerkOrgId,
          counter_type: counterType,
          current_value: value,
          metric_key: counterType,
          period_end: now,
          period_start: now,
        },
        // Refresh the period stamp on every recount so the row stays
        // self-describing rather than reflecting the first recount only.
        update: { current_value: value, period_end: now, period_start: now },
      });
    }

    return { ok: true, value: { clerkOrgId, counts } };
  } catch (error) {
    log.error("Unhandled exception in recountUsage:", { error });
    return {
      ok: false,
      error: { code: "unknown_error", message: "Failed to recount usage." },
    };
  }
}

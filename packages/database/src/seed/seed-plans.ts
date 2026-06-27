import { LIMIT_TYPES } from "@repo/core";
import type { PrismaClient } from "../../generated/client";
import { PLAN_CATALOGUE, type PlanDefinition } from "./plans";

export interface PlanSyncSummary {
  limits: number;
  plans: number;
}

/**
 * Upserts the plan catalogue and its hard limits from PLAN_CATALOGUE.
 *
 * Idempotent: re-running yields identical rows, and editing a catalogue limit
 * then re-running updates the row in place with no duplicates. This is the
 * future update path. Plans key on clerk_plan_key; limits key on
 * (plan_id, limit_type). The legacy `key` column is kept equal to clerk_plan_key
 * so the existing clerk_org_subscriptions FK keeps resolving.
 */
export async function syncPlanCatalogue(
  db: PrismaClient,
  catalogue: readonly PlanDefinition[] = PLAN_CATALOGUE
): Promise<PlanSyncSummary> {
  let limits = 0;

  for (const plan of catalogue) {
    const row = await db.plan.upsert({
      where: { clerk_plan_key: plan.clerk_plan_key },
      create: {
        clerk_plan_key: plan.clerk_plan_key,
        is_active: true,
        is_custom: plan.is_custom,
        key: plan.clerk_plan_key,
        name: plan.name,
      },
      update: {
        is_active: true,
        is_custom: plan.is_custom,
        key: plan.clerk_plan_key,
        name: plan.name,
      },
      select: { id: true },
    });

    for (const limitType of LIMIT_TYPES) {
      await db.planLimit.upsert({
        where: {
          plan_id_limit_type: { limit_type: limitType, plan_id: row.id },
        },
        create: {
          limit_type: limitType,
          limit_value: plan.limits[limitType],
          plan_id: row.id,
        },
        update: { limit_value: plan.limits[limitType] },
      });
      limits += 1;
    }
  }

  return { limits, plans: catalogue.length };
}

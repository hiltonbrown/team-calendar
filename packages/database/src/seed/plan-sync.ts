import type { PrismaClient } from "../../generated/client";
import { PLAN_CATALOGUE } from "./plans";

export interface PlanSeedSummary { plans: number; limits: number }

export const syncPlansFromCatalogue = async (db: PrismaClient): Promise<PlanSeedSummary> => {
  let limits = 0;
  for (const plan of PLAN_CATALOGUE) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO plans (key, plan_key, name, is_active, is_custom, stripe_price_id, created_at, updated_at)
      VALUES (${plan.plan_key}, ${plan.plan_key}, ${plan.name}, true, ${plan.is_custom}, ${plan.priceId}, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE SET
        plan_key = EXCLUDED.plan_key,
        name = EXCLUDED.name,
        is_active = true,
        is_custom = EXCLUDED.is_custom,
        stripe_price_id = EXCLUDED.stripe_price_id,
        updated_at = NOW()
      RETURNING id
    `;
    const planId = rows[0]?.id;
    if (!planId) {
      throw new Error("Failed to upsert billing plan.");
    }
    for (const [limitType, limitValue] of Object.entries(plan.limits)) {
      await db.$executeRaw`
        INSERT INTO plan_limits (plan_id, limit_type, limit_value, created_at, updated_at)
        VALUES (${planId}, ${limitType}, ${limitValue}, NOW(), NOW())
        ON CONFLICT (plan_id, limit_type) DO UPDATE SET limit_value = EXCLUDED.limit_value, updated_at = NOW()
      `;
      limits += 1;
    }
  }
  return { limits, plans: PLAN_CATALOGUE.length };
};

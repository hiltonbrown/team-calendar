import type { LimitType, PlanKey } from "@repo/core";
import { database } from "../client";
import { getPlanDefinition } from "../seed/plans";

export interface SubscriptionMirrorInput {
  cancelAtPeriodEnd: boolean;
  clerkOrgId: string;
  currentPeriodEnd: Date | null;
  endedAt: Date | null;
  planKey: PlanKey;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface BillingSubscriptionRow {
  cancel_at_period_end: boolean;
  clerk_org_id: string;
  current_period_end: Date | null;
  ended_at: Date | null;
  plan_key: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export const getSubscriptionForOrg = async (
  clerkOrgId: string
): Promise<BillingSubscriptionRow | null> => {
  const rows = await database.$queryRaw<BillingSubscriptionRow[]>`
    SELECT clerk_org_id, plan_key, status, current_period_end, stripe_customer_id,
      stripe_subscription_id, cancel_at_period_end, ended_at
    FROM clerk_org_subscriptions
    WHERE clerk_org_id = ${clerkOrgId}
    LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getPlanLimits = async (planKey: PlanKey) => {
  const rows = await database.$queryRaw<
    Array<{ limit_type: LimitType; limit_value: number }>
  >`
    SELECT pl.limit_type, pl.limit_value
    FROM plan_limits pl
    INNER JOIN plans p ON p.id = pl.plan_id
    WHERE p.plan_key = ${planKey} OR p.key = ${planKey}
  `;
  // Layer any persisted limits over the catalogue defaults so every LimitType is
  // always present, even when the DB only holds a partial set of rows for a plan.
  const defaults = getPlanDefinition(planKey).limits;
  const persisted = Object.fromEntries(
    rows.map((limit) => [limit.limit_type, limit.limit_value])
  );
  return { ...defaults, ...persisted } as Record<LimitType, number>;
};

export const getPlanFeatures = (planKey: PlanKey) =>
  getPlanDefinition(planKey).features;

export const getUsageCounter = async (
  clerkOrgId: string,
  counterType: LimitType
) => {
  const rows = await database.$queryRaw<Array<{ current_value: number }>>`
    SELECT current_value FROM usage_counters
    WHERE clerk_org_id = ${clerkOrgId} AND (counter_type::text = ${counterType} OR metric_key = ${counterType})
    ORDER BY updated_at DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

export const upsertSubscriptionFromWebhook = (input: SubscriptionMirrorInput) =>
  database.$executeRaw`
    INSERT INTO clerk_org_subscriptions (
      id, clerk_org_id, plan_key, status, current_period_end, stripe_customer_id,
      stripe_subscription_id, cancel_at_period_end, ended_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${input.clerkOrgId}, ${input.planKey}, ${input.status}, ${input.currentPeriodEnd},
      ${input.stripeCustomerId}, ${input.stripeSubscriptionId}, ${input.cancelAtPeriodEnd},
      ${input.endedAt}, NOW(), NOW()
    )
    ON CONFLICT (clerk_org_id) DO UPDATE SET
      plan_key = EXCLUDED.plan_key,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      ended_at = EXCLUDED.ended_at,
      updated_at = NOW()
  `;

export const isStripeEventProcessed = async (
  eventId: string
): Promise<boolean> => {
  const rows = await database.$queryRaw<Array<{ stripe_event_id: string }>>`
    SELECT stripe_event_id FROM stripe_events WHERE stripe_event_id = ${eventId} LIMIT 1
  `;
  return rows.length > 0;
};

export const recordStripeEvent = async (
  eventId: string,
  type: string
): Promise<void> => {
  await database.$executeRaw`
    INSERT INTO stripe_events (id, stripe_event_id, type, processed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${eventId}, ${type}, NOW(), NOW(), NOW())
    ON CONFLICT (stripe_event_id) DO NOTHING
  `;
};

import type { LimitType, PlanKey } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { database } from "../client";
import { getPlanDefinition } from "../seed/plans";

export type AuthoritativeUsageType =
  | LimitType
  | "connections"
  | "organisations";

export type AuthoritativeUsageClient = Pick<
  Prisma.TransactionClient,
  "feed" | "organisation" | "person" | "xeroConnection"
>;

type PlanLimitLockClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export interface SubscriptionMirrorInput {
  cancelAtPeriodEnd: boolean;
  clerkOrgId: string;
  currentPeriodEnd: Date | null;
  endedAt: Date | null;
  planKey: PlanKey;
  status: string;
  stripeCustomerId: string | null;
  stripeEventCreatedAt: Date | null;
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

export const getSubscriptionForStripeCustomer = async (
  stripeCustomerId: string
): Promise<BillingSubscriptionRow | null> => {
  const rows = await database.$queryRaw<BillingSubscriptionRow[]>`
    SELECT clerk_org_id, plan_key, status, current_period_end, stripe_customer_id,
      stripe_subscription_id, cancel_at_period_end, ended_at
    FROM clerk_org_subscriptions
    WHERE stripe_customer_id = ${stripeCustomerId}
    LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getSubscriptionByStripeCustomerId =
  getSubscriptionForStripeCustomer;

export const getFirstActiveOrganisationIdForClerkOrg = async (
  clerkOrgId: string
): Promise<string | null> => {
  const rows = await database.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM organisations
    WHERE clerk_org_id = ${clerkOrgId}
      AND archived_at IS NULL
    ORDER BY created_at ASC, name ASC
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
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

/**
 * Reads the product's authoritative, current usage rather than its asynchronous
 * reporting projection in usage_counters.
 */
export const getAuthoritativeUsageCount = (
  clerkOrgId: string,
  usageType: AuthoritativeUsageType,
  client: AuthoritativeUsageClient = database
): Promise<number> => {
  switch (usageType) {
    case "seats":
      return client.person.count({
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          is_active: true,
        },
      });
    case "feeds":
      return client.feed.count({
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          status: "active",
        },
      });
    case "organisations":
    case "payroll_entities":
      return client.organisation.count({
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          is_active: true,
        },
      });
    case "connections":
      return client.xeroConnection.count({
        where: {
          clerk_org_id: clerkOrgId,
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
      });
    default: {
      const exhaustiveUsageType: never = usageType;
      return exhaustiveUsageType;
    }
  }
};

/**
 * Serialises plan-limited mutations for one Clerk Organisation for the life of
 * the surrounding transaction. A hash collision can only cause harmless extra
 * serialisation because every subsequent count remains tenant-scoped.
 */
export const lockPlanLimitMutations = async (
  client: PlanLimitLockClient,
  clerkOrgId: string
): Promise<void> => {
  await client.$queryRaw<Array<{ acquired: string }>>`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`team-calendar:plan-limits:${clerkOrgId}`}, 0)
    )::text AS acquired
  `;
};

export const upsertSubscriptionFromWebhook = (input: SubscriptionMirrorInput) =>
  database.$executeRaw`
    INSERT INTO clerk_org_subscriptions (
      id, clerk_org_id, plan_key, status, current_period_end, stripe_customer_id,
      stripe_subscription_id, cancel_at_period_end, ended_at, stripe_event_created_at,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${input.clerkOrgId}, ${input.planKey}, ${input.status}, ${input.currentPeriodEnd},
      ${input.stripeCustomerId}, ${input.stripeSubscriptionId}, ${input.cancelAtPeriodEnd},
      ${input.endedAt}, ${input.stripeEventCreatedAt}, NOW(), NOW()
    )
    ON CONFLICT (clerk_org_id) DO UPDATE SET
      plan_key = EXCLUDED.plan_key,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      ended_at = EXCLUDED.ended_at,
      stripe_event_created_at = EXCLUDED.stripe_event_created_at,
      updated_at = NOW()
    WHERE clerk_org_subscriptions.stripe_event_created_at IS NULL
       OR EXCLUDED.stripe_event_created_at IS NULL
       OR clerk_org_subscriptions.stripe_event_created_at <= EXCLUDED.stripe_event_created_at
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

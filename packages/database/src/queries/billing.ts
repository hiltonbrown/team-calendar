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
  authoritativeTie?: boolean;
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
  stripe_event_created_at: Date | null;
  stripe_subscription_id: string | null;
}

export const getSubscriptionForOrg = async (
  clerkOrgId: string
): Promise<BillingSubscriptionRow | null> => {
  const rows = await database.$queryRaw<BillingSubscriptionRow[]>`
    SELECT clerk_org_id, plan_key, status, current_period_end, stripe_customer_id,
      stripe_subscription_id, cancel_at_period_end, ended_at, stripe_event_created_at
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
      stripe_subscription_id, cancel_at_period_end, ended_at, stripe_event_created_at
    FROM clerk_org_subscriptions
    WHERE stripe_customer_id = ${stripeCustomerId}
    LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getSubscriptionForStripeSubscription = async (
  stripeSubscriptionId: string
): Promise<BillingSubscriptionRow | null> => {
  const rows = await database.$queryRaw<BillingSubscriptionRow[]>`
    SELECT clerk_org_id, plan_key, status, current_period_end, stripe_customer_id,
      stripe_subscription_id, cancel_at_period_end, ended_at, stripe_event_created_at
    FROM clerk_org_subscriptions
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
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
       OR clerk_org_subscriptions.stripe_event_created_at < EXCLUDED.stripe_event_created_at
       OR (${input.authoritativeTie ?? false} AND clerk_org_subscriptions.stripe_event_created_at = EXCLUDED.stripe_event_created_at)
  `;

export const isStripeEventProcessed = async (
  eventId: string
): Promise<boolean> => {
  const rows = await database.$queryRaw<Array<{ stripe_event_id: string }>>`
    SELECT stripe_event_id FROM stripe_events
    WHERE stripe_event_id = ${eventId} AND delivery_state IN ('processed', 'ignored')
    LIMIT 1
  `;
  return rows.length > 0;
};

export const recordStripeEvent = async (
  eventId: string,
  type: string,
  context: {
    clerkOrgId: string | null;
    eventCreatedAt: Date | null;
    stripeCustomerId: string | null;
  } = { clerkOrgId: null, eventCreatedAt: null, stripeCustomerId: null }
): Promise<void> => {
  await database.$executeRaw`
    INSERT INTO stripe_events (
      id, stripe_event_id, type, delivery_state, attempt_count, clerk_org_id,
      stripe_customer_id, event_created_at, last_attempted_at, processed_at,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${eventId}, ${type}, 'processed', 1, ${context.clerkOrgId},
      ${context.stripeCustomerId}, ${context.eventCreatedAt}, NOW(), NOW(), NOW(), NOW()
    )
    ON CONFLICT (stripe_event_id) DO UPDATE SET
      delivery_state = 'processed',
      attempt_count = stripe_events.attempt_count + 1,
      clerk_org_id = COALESCE(EXCLUDED.clerk_org_id, stripe_events.clerk_org_id),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, stripe_events.stripe_customer_id),
      event_created_at = COALESCE(EXCLUDED.event_created_at, stripe_events.event_created_at),
      error_category = NULL,
      last_attempted_at = NOW(),
      processed_at = NOW(),
      updated_at = NOW()
  `;
};

export const recordStripeEventIgnored = async (
  eventId: string,
  type: string,
  eventCreatedAt: Date | null
): Promise<void> => {
  await database.$executeRaw`
    INSERT INTO stripe_events (
      id, stripe_event_id, type, delivery_state, attempt_count, event_created_at,
      last_attempted_at, processed_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${eventId}, ${type}, 'ignored', 1, ${eventCreatedAt},
      NOW(), NOW(), NOW(), NOW()
    )
    ON CONFLICT (stripe_event_id) DO UPDATE SET
      delivery_state = 'ignored', attempt_count = stripe_events.attempt_count + 1,
      error_category = NULL, last_attempted_at = NOW(), processed_at = NOW(), updated_at = NOW()
  `;
};

export const recordStripeEventFailure = async (input: {
  clerkOrgId: string | null;
  errorCategory: string;
  eventCreatedAt: Date | null;
  eventId: string;
  stripeCustomerId: string | null;
  type: string;
}): Promise<boolean> => {
  const rows = await database.$queryRaw<Array<{ attempt_count: number }>>`
    INSERT INTO stripe_events (
      id, stripe_event_id, type, delivery_state, attempt_count, clerk_org_id,
      stripe_customer_id, event_created_at, error_category, last_attempted_at,
      processed_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${input.eventId}, ${input.type}, 'failed', 1,
      ${input.clerkOrgId}, ${input.stripeCustomerId}, ${input.eventCreatedAt},
      ${input.errorCategory}, NOW(), NULL, NOW(), NOW()
    )
    ON CONFLICT (stripe_event_id) DO UPDATE SET
      delivery_state = 'failed', attempt_count = stripe_events.attempt_count + 1,
      clerk_org_id = COALESCE(EXCLUDED.clerk_org_id, stripe_events.clerk_org_id),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, stripe_events.stripe_customer_id),
      event_created_at = COALESCE(EXCLUDED.event_created_at, stripe_events.event_created_at),
      error_category = EXCLUDED.error_category, last_attempted_at = NOW(),
      processed_at = NULL, updated_at = NOW()
    WHERE stripe_events.delivery_state = 'failed'
    RETURNING attempt_count
  `;
  const attemptCount = rows[0]?.attempt_count;
  return Boolean(
    attemptCount &&
      (attemptCount === 1 || Number.isInteger(Math.log2(attemptCount)))
  );
};

export interface FailedStripeEventSummary {
  clerkOrgId?: string | null;
  errorCategory: string;
  eventId: string;
  lastAttemptedAt: Date;
}

const mapFailedStripeEvent = (row: {
  clerk_org_id?: string | null;
  error_category: string;
  last_attempted_at: Date;
  stripe_event_id: string;
}): FailedStripeEventSummary => ({
  ...(row.clerk_org_id === undefined ? {} : { clerkOrgId: row.clerk_org_id }),
  errorCategory: row.error_category,
  eventId: row.stripe_event_id,
  lastAttemptedAt: row.last_attempted_at,
});

export const getUnresolvedStripeEventsForOrg = async (
  clerkOrgId: string
): Promise<FailedStripeEventSummary[]> => {
  const rows = await database.$queryRaw<
    Array<{
      error_category: string;
      last_attempted_at: Date;
      stripe_event_id: string;
    }>
  >`
    SELECT stripe_event_id, error_category, last_attempted_at
    FROM stripe_events
    WHERE clerk_org_id = ${clerkOrgId} AND delivery_state = 'failed'
    ORDER BY last_attempted_at DESC
    LIMIT 20
  `;
  return rows.map(mapFailedStripeEvent);
};

export const getFailedStripeEventsForOperators = async (): Promise<
  FailedStripeEventSummary[]
> => {
  const rows = await database.$queryRaw<
    Array<{
      clerk_org_id: string | null;
      error_category: string;
      last_attempted_at: Date;
      stripe_event_id: string;
    }>
  >`
    SELECT stripe_event_id, clerk_org_id, error_category, last_attempted_at
    FROM stripe_events
    WHERE delivery_state = 'failed'
    ORDER BY last_attempted_at DESC
    LIMIT 100
  `;
  return rows.map(mapFailedStripeEvent);
};

export const hasUnresolvedStripeEventForOrg = async (
  clerkOrgId: string,
  mirroredAt: Date | null
): Promise<boolean> => {
  const rows = await database.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM stripe_events
      WHERE clerk_org_id = ${clerkOrgId}
        AND delivery_state = 'failed'
        AND (${mirroredAt}::timestamptz IS NULL OR event_created_at IS NULL OR event_created_at >= ${mirroredAt})
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
};

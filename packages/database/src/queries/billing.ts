import type { ClerkOrgId, LimitType, Result } from "@repo/core";
import { appError, LIMIT_TYPES } from "@repo/core";
import { z } from "zod";
import type {
  billing_interval,
  ClerkOrgSubscription,
} from "../../generated/client";
import { database } from "../client";
import { UNLIMITED } from "../seed/plans";

// A limit value of -1 means unlimited. Built defensively so a missing plan or
// limit row reads as unlimited (fail open) rather than blocking writes.
export type PlanLimits = Record<LimitType, number>;

export interface LimitState {
  current: number;
  limit: number;
}

export interface BillingOverview {
  billingInterval: billing_interval | null;
  cancelAtPeriodEnd: boolean;
  clerkPlanKey: string | null;
  currentPeriodEnd: Date | null;
  planName: string;
  seatsPurchased: number;
  status: string;
  usage: Array<{ current: number; limit: number; limitType: LimitType }>;
}

export const UpsertSubscriptionSchema = z.object({
  billingInterval: z.enum(["month", "year"]).nullable().default(null),
  cancelAtPeriodEnd: z.boolean().default(false),
  clerkOrgId: z.string().min(1),
  clerkPlanKey: z.string().min(1),
  currentPeriodEnd: z.date().nullable().default(null),
  status: z.string().min(1),
});

export type UpsertSubscriptionInput = z.input<typeof UpsertSubscriptionSchema>;

export function getSubscriptionForOrg(
  clerkOrgId: ClerkOrgId | string
): Promise<ClerkOrgSubscription | null> {
  return database.clerkOrgSubscription.findUnique({
    where: { clerk_org_id: clerkOrgId },
  });
}

/**
 * Plan limits for a Clerk plan slug as a complete Record<LimitType, number>.
 * Missing plan or missing limit rows read as unlimited so enforcement fails open
 * until a catalogue is seeded for that plan.
 */
export async function getPlanLimits(clerkPlanKey: string): Promise<PlanLimits> {
  const plan = await database.plan.findUnique({
    select: { limits: { select: { limit_type: true, limit_value: true } } },
    where: { clerk_plan_key: clerkPlanKey },
  });

  const limits = blankLimits();
  if (!plan) {
    return limits;
  }

  for (const row of plan.limits) {
    if (isLimitType(row.limit_type)) {
      limits[row.limit_type] = row.limit_value;
    }
  }
  return limits;
}

/** Current counted usage for an org and counter dimension. 0 when no row exists. */
export async function getUsageCounter(
  clerkOrgId: ClerkOrgId | string,
  counterType: LimitType
): Promise<number> {
  const counter = await database.usageCounter.findUnique({
    select: { current_value: true },
    where: {
      clerk_org_id_counter_type: {
        clerk_org_id: clerkOrgId,
        counter_type: counterType,
      },
    },
  });
  return counter?.current_value ?? 0;
}

/**
 * Mirrors a Clerk billing event into clerk_org_subscriptions. Idempotent on
 * clerk_org_id: the same event applied twice leaves one row in the same state.
 * Writes plan_key equal to clerk_plan_key so the existing plan FK resolves.
 */
export async function upsertSubscriptionFromWebhook(
  input: UpsertSubscriptionInput
): Promise<Result<ClerkOrgSubscription>> {
  const parsed = UpsertSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: appError("bad_request", "Invalid subscription payload."),
    };
  }
  const data = parsed.data;

  try {
    const subscription = await database.clerkOrgSubscription.upsert({
      where: { clerk_org_id: data.clerkOrgId },
      create: {
        billing_interval: data.billingInterval,
        cancel_at_period_end: data.cancelAtPeriodEnd,
        clerk_org_id: data.clerkOrgId,
        clerk_plan_key: data.clerkPlanKey,
        current_period_end: data.currentPeriodEnd,
        plan_key: data.clerkPlanKey,
        status: data.status,
      },
      update: {
        billing_interval: data.billingInterval,
        cancel_at_period_end: data.cancelAtPeriodEnd,
        clerk_plan_key: data.clerkPlanKey,
        current_period_end: data.currentPeriodEnd,
        plan_key: data.clerkPlanKey,
        status: data.status,
      },
    });
    return { ok: true, value: subscription };
  } catch {
    return {
      ok: false,
      error: appError(
        "conflict",
        "Could not record the subscription. The plan may not exist in the catalogue."
      ),
    };
  }
}

/**
 * Read-only billing summary for the settings billing surface. Combines the
 * mirrored subscription with the plan's limits and the org's counted usage.
 */
export async function getBillingOverview(
  clerkOrgId: ClerkOrgId | string
): Promise<Result<BillingOverview>> {
  const subscription = await getSubscriptionForOrg(clerkOrgId);
  if (!subscription) {
    return {
      ok: false,
      error: appError("not_found", "No billing subscription for this account."),
    };
  }

  const clerkPlanKey = subscription.clerk_plan_key ?? subscription.plan_key;
  const [plan, limits] = await Promise.all([
    database.plan.findUnique({
      select: { name: true },
      where: { clerk_plan_key: clerkPlanKey },
    }),
    getPlanLimits(clerkPlanKey),
  ]);

  const usage: BillingOverview["usage"] = [];
  for (const limitType of LIMIT_TYPES) {
    const current = await getUsageCounter(clerkOrgId, limitType);
    usage.push({ current, limit: limits[limitType], limitType });
  }

  return {
    ok: true,
    value: {
      billingInterval: subscription.billing_interval,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      clerkPlanKey: subscription.clerk_plan_key,
      currentPeriodEnd: subscription.current_period_end,
      planName: plan?.name ?? clerkPlanKey,
      seatsPurchased: subscription.seats_purchased,
      status: subscription.status,
      usage,
    },
  };
}

function blankLimits(): PlanLimits {
  const limits = {} as PlanLimits;
  for (const limitType of LIMIT_TYPES) {
    limits[limitType] = UNLIMITED;
  }
  return limits;
}

function isLimitType(value: string): value is LimitType {
  return (LIMIT_TYPES as readonly string[]).includes(value);
}

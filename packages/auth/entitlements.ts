import "server-only";

import {
  appError,
  type FeatureKey,
  type LimitType,
  type PlanKey,
  planKeys,
  type Result,
} from "@repo/core";
import {
  type AuthoritativeUsageClient,
  getAuthoritativeUsageCount,
  getPlanFeatures,
  getPlanLimits,
  getSubscriptionForOrg,
  hasUnresolvedStripeEventForOrg,
} from "@repo/database";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const BASIC_PLAN_KEY: PlanKey = "basic";

const isPlanKey = (value: string): value is PlanKey =>
  (planKeys as readonly string[]).includes(value);

const activePlanKey = async (clerkOrgId: string): Promise<PlanKey> => {
  const subscription = await getSubscriptionForOrg(clerkOrgId);
  const billingUnhealthy =
    process.env.NEXT_PUBLIC_LAUNCH_MODE === "paid" &&
    (await hasUnresolvedStripeEventForOrg(
      clerkOrgId,
      subscription?.stripe_event_created_at ?? null
    ));
  // Fall back to Basic for inactive subscriptions or any unrecognised plan_key
  // (e.g. legacy data) rather than casting blindly and throwing downstream.
  return !billingUnhealthy &&
    subscription &&
    ACTIVE_STATUSES.has(subscription.status) &&
    isPlanKey(subscription.plan_key)
    ? subscription.plan_key
    : BASIC_PLAN_KEY;
};

export const withinLimit = async (
  clerkOrgId: string,
  _organisationId: string,
  limitType: LimitType,
  usageClient?: AuthoritativeUsageClient
): Promise<Result<{ allowed: boolean; current: number; limit: number }>> => {
  try {
    const planKey = await activePlanKey(clerkOrgId);
    const [limits, current] = await Promise.all([
      getPlanLimits(planKey),
      getAuthoritativeUsageCount(clerkOrgId, limitType, usageClient),
    ]);
    const limit = limits[limitType];
    return {
      ok: true,
      value: { allowed: limit === -1 || current < limit, current, limit },
    };
  } catch {
    return {
      error: appError("internal", "Failed to check billing limits."),
      ok: false,
    };
  }
};

export const hasFeature = async (
  clerkOrgId: string,
  feature: FeatureKey
): Promise<Result<boolean>> => {
  try {
    const planKey = await activePlanKey(clerkOrgId);
    const features = getPlanFeatures(planKey);
    return { ok: true, value: features[feature] };
  } catch {
    return {
      error: appError("internal", "Failed to check billing features."),
      ok: false,
    };
  }
};

import "server-only";

import { appError, type FeatureKey, type LimitType, type PlanKey, type Result } from "@repo/core";
import { getPlanFeatures, getPlanLimits, getSubscriptionForOrg, getUsageCounter } from "@repo/database";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const BASIC_PLAN_KEY: PlanKey = "basic";

const activePlanKey = async (clerkOrgId: string): Promise<PlanKey> => {
  const subscription = await getSubscriptionForOrg(clerkOrgId);
  return subscription && ACTIVE_STATUSES.has(subscription.status)
    ? (subscription.plan_key as PlanKey)
    : BASIC_PLAN_KEY;
};

export const withinLimit = async (
  clerkOrgId: string,
  _organisationId: string,
  limitType: LimitType
): Promise<Result<{ allowed: boolean; current: number; limit: number }>> => {
  try {
    const planKey = await activePlanKey(clerkOrgId);
    const [limits, usage] = await Promise.all([
      getPlanLimits(planKey),
      getUsageCounter(clerkOrgId, limitType),
    ]);
    const limit = limits[limitType];
    const current = usage?.current_value ?? 0;
    return { ok: true, value: { allowed: limit === -1 || current < limit, current, limit } };
  } catch {
    return { ok: false, error: appError("internal", "Failed to check billing limits.") };
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
    return { ok: false, error: appError("internal", "Failed to check billing features.") };
  }
};

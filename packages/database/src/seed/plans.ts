import {
  type FeatureKey,
  type LimitType,
  type PlanKey,
  PUBLIC_PLAN_CATALOGUE,
} from "@repo/core";

export interface PlanDefinition {
  readonly features: Record<FeatureKey, boolean>;
  readonly is_custom: boolean;
  readonly limits: Record<LimitType, number>;
  readonly name: string;
  readonly plan_key: PlanKey;
  readonly priceId: string | null;
}

const priceIdFor = (planKey: PlanKey): string | null => {
  if (planKey === "basic") {
    return process.env.STRIPE_PRICE_BASIC ?? null;
  }
  if (planKey === "premium") {
    return process.env.STRIPE_PRICE_PREMIUM ?? null;
  }
  return null;
};

export const PLAN_CATALOGUE = PUBLIC_PLAN_CATALOGUE.map((plan) => ({
  ...plan,
  is_custom: plan.plan_key === "enterprise",
  priceId: priceIdFor(plan.plan_key),
})) satisfies readonly PlanDefinition[];

export const getPlanDefinition = (planKey: PlanKey): PlanDefinition => {
  const plan = PLAN_CATALOGUE.find((item) => item.plan_key === planKey);
  if (!plan) {
    throw new Error(`Unknown plan key: ${planKey}`);
  }
  return plan;
};

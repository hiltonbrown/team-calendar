import type { FeatureKey, LimitType, PlanKey } from "@repo/core";

export interface PlanDefinition {
  readonly features: Record<FeatureKey, boolean>;
  readonly is_custom: boolean;
  readonly limits: Record<LimitType, number>;
  readonly name: string;
  readonly plan_key: PlanKey;
  readonly priceId: string | null;
}

export const PLAN_CATALOGUE = [
  {
    features: { analytics: false, priority_support: false },
    is_custom: false,
    limits: { feeds: 2, payroll_entities: 1, seats: 10 },
    name: "Basic",
    plan_key: "basic",
    priceId: process.env.STRIPE_PRICE_BASIC ?? null,
  },
  {
    features: { analytics: true, priority_support: true },
    is_custom: false,
    limits: { feeds: -1, payroll_entities: 2, seats: 50 },
    name: "Premium",
    plan_key: "premium",
    priceId: process.env.STRIPE_PRICE_PREMIUM ?? null,
  },
  {
    features: { analytics: true, priority_support: true },
    is_custom: true,
    limits: { feeds: -1, payroll_entities: -1, seats: -1 },
    name: "Enterprise",
    plan_key: "enterprise",
    priceId: null,
  },
] as const satisfies readonly PlanDefinition[];

export const getPlanDefinition = (planKey: PlanKey): PlanDefinition => {
  const plan = PLAN_CATALOGUE.find((item) => item.plan_key === planKey);
  if (!plan) {
    throw new Error(`Unknown plan key: ${planKey}`);
  }
  return plan;
};

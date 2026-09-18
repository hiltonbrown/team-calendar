import type { FeatureKey, LimitType, PlanKey } from "../index";

export interface PublicPlanDefinition {
  readonly features: Record<FeatureKey, boolean>;
  readonly limits: Record<LimitType, number>;
  readonly name: string;
  readonly plan_key: PlanKey;
}

export const PUBLIC_PLAN_CATALOGUE = [
  {
    features: { analytics: false, priority_support: false },
    limits: { feeds: 2, payroll_entities: 1, seats: 9 },
    name: "Starter",
    plan_key: "basic",
  },
  {
    features: { analytics: true, priority_support: true },
    limits: { feeds: -1, payroll_entities: 1, seats: 50 },
    name: "Premium",
    plan_key: "premium",
  },
  {
    features: { analytics: true, priority_support: true },
    limits: { feeds: -1, payroll_entities: -1, seats: -1 },
    name: "Enterprise",
    plan_key: "enterprise",
  },
] as const satisfies readonly PublicPlanDefinition[];

export const getPublicPlanDefinition = (
  planKey: PlanKey
): PublicPlanDefinition => {
  const plan = PUBLIC_PLAN_CATALOGUE.find(
    (definition) => definition.plan_key === planKey
  );
  if (!plan) {
    throw new Error(`Unknown plan key: ${planKey}`);
  }
  return plan;
};

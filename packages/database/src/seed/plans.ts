import type { FeatureKey, LimitType } from "@repo/core";

/**
 * Single source of truth for the Clerk Billing catalogue.
 *
 * Plans, monthly and annual USD prices, and the boolean plan features live in
 * the Clerk Dashboard. This module mirrors the parts Team Calendar must enforce
 * itself: the hard numeric limits Clerk cannot police, plus a parity copy of the
 * boolean features for documentation. Changing a tier is an edit here plus a
 * Clerk Dashboard change, then a re-run of the seed sync. Nothing else in the
 * codebase declares a limit value or a plan key.
 *
 * A limit value of -1 means unlimited.
 */
export interface PlanDefinition {
  /** Plan slug as configured in the Clerk Dashboard. */
  readonly clerk_plan_key: string;
  /** Boolean features. Authoritatively gated through Clerk; mirrored here for parity. */
  readonly features: Readonly<Record<FeatureKey, boolean>>;
  /** Bespoke negotiated plan outside the standard published catalogue. */
  readonly is_custom: boolean;
  /** Hard numeric limits enforced through usage_counters. -1 means unlimited. */
  readonly limits: Readonly<Record<LimitType, number>>;
  /** Display name shown on the billing surface. */
  readonly name: string;
}

export const PLAN_CATALOGUE = [
  {
    clerk_plan_key: "basic",
    name: "Basic",
    is_custom: false,
    limits: { payroll_entities: 1, seats: 10, feeds: 2 },
    features: { analytics: false, priority_support: false },
  },
  {
    clerk_plan_key: "premium",
    name: "Premium",
    is_custom: false,
    limits: { payroll_entities: 2, seats: 50, feeds: -1 },
    features: { analytics: true, priority_support: true },
  },
  {
    clerk_plan_key: "enterprise",
    name: "Enterprise",
    is_custom: false,
    limits: { payroll_entities: -1, seats: -1, feeds: -1 },
    features: { analytics: true, priority_support: true },
  },
] as const satisfies readonly PlanDefinition[];

/** Plan slugs declared by the catalogue. The canonical set of billable plans. */
export type ClerkPlanKey = (typeof PLAN_CATALOGUE)[number]["clerk_plan_key"];

/** Sentinel limit value meaning the plan imposes no ceiling for that dimension. */
export const UNLIMITED = -1;

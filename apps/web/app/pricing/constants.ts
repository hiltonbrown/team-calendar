/**
 * NOTE: If plans, features, or limits change in the database seed catalogue
 * (packages/database/src/seed/plans.ts), update these constants accordingly.
 */
export interface PlanCardDetails {
  readonly ctaHref: string;
  readonly ctaText: string;
  readonly description: string;
  readonly features: string[];
  readonly highlighted: boolean;
  readonly interval: string;
  readonly name: string;
  readonly price: string;
}

export const MARKETING_PLANS: readonly PlanCardDetails[] = [
  {
    name: "Basic",
    price: "$19",
    interval: "mo",
    description: "For small teams starting with calendar publishing",
    features: [
      "1 Xero Payroll organisation",
      "Up to 2 calendar feeds",
      "Up to 10 user seats",
      "Manual availability entries",
      "Basic sync health dashboard",
    ],
    ctaText: "Get started",
    ctaHref: "/sign-up",
    highlighted: false,
  },
  {
    name: "Premium",
    price: "$49",
    interval: "mo",
    description: "For growing teams needing advanced coverage",
    features: [
      "2 Xero Payroll organisations",
      "Unlimited calendar feeds",
      "Up to 50 user seats",
      "Manual availability entries",
      "Advanced sync health dashboard",
      "Analytics & leave reports",
      "Priority support",
    ],
    ctaText: "Get started",
    ctaHref: "/sign-up",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    interval: "",
    description: "For multi-entity payroll and guided rollout support",
    features: [
      "Multiple Xero Payroll organisations",
      "Custom calendar feeds",
      "Unlimited user seats",
      "Manual availability entries",
      "Advanced sync health dashboard",
      "Implementation partner support",
      "Guided rollout & onboarding",
    ],
    ctaText: "Talk to us",
    ctaHref: "#contact",
    highlighted: false,
  },
] as const;

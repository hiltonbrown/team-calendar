import type { PlanKey } from "@repo/core";
import { signUpHref } from "@/src/lib/auth-links";

export type PricingCurrency = "AUD" | "NZD" | "GBP";

export const isPricingCurrency = (value: string): value is PricingCurrency =>
  value === "AUD" || value === "NZD" || value === "GBP";

export const pricingCurrencies = {
  AUD: { country: "Australia", label: "AUD" },
  GBP: { country: "United Kingdom", label: "GBP" },
  NZD: { country: "New Zealand", label: "NZD" },
} as const satisfies Record<
  PricingCurrency,
  { country: string; label: string }
>;

export const pricingCurrencyOptions = ["AUD", "NZD", "GBP"] as const;

export const paidPlanPresentation = {
  basic: {
    ctaHref: signUpHref,
    description:
      "For small Australian teams publishing one trusted calendar view.",
    feedLabel: "Core Feed",
    price: "$9",
  },
  enterprise: {
    ctaHref: null,
    description:
      "For organisations that need multiple Xero Payroll connections.",
    feedLabel: null,
    price: null,
  },
  premium: {
    ctaHref: signUpHref,
    description:
      "For growing teams that need richer feeds, reporting and support.",
    feedLabel: "Team and location feeds",
    price: "$19",
  },
} as const satisfies Record<
  PlanKey,
  {
    ctaHref: string | null;
    description: string;
    feedLabel: string | null;
    price: string | null;
  }
>;

export const getCurrencyPricingState = (currency: PricingCurrency) => {
  const region = pricingCurrencies[currency];
  return currency === "AUD"
    ? {
        available: true as const,
        currency,
        heading: "Australian plans",
        region,
      }
    : {
        available: false as const,
        currency,
        heading: `${region.country} pricing is coming soon`,
        region,
      };
};

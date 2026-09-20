import type { PlanKey } from "@repo/core";
import { signUpHref } from "@/src/lib/auth-links";

export type PricingCurrency = "AUD" | "NZD" | "GBP";

export const isPricingCurrency = (value: string): value is PricingCurrency =>
  value === "AUD" || value === "NZD" || value === "GBP";

export interface CountryOption {
  readonly code: PricingCurrency;
  readonly currencySymbol: string;
  readonly flag: string;
  readonly name: string;
  readonly payrollRegionName: string;
  readonly premiumPrice: string;
  readonly starterPrice: string;
  readonly xeroLabel: string;
}

export const countryOptions: readonly CountryOption[] = [
  {
    code: "AUD",
    currencySymbol: "$",
    flag: "🇦🇺",
    name: "Australia",
    payrollRegionName: "Australian",
    premiumPrice: "$19",
    starterPrice: "$9",
    xeroLabel: "Xero Payroll",
  },
  {
    code: "NZD",
    currencySymbol: "$",
    flag: "🇳🇿",
    name: "New Zealand",
    payrollRegionName: "New Zealand",
    premiumPrice: "$21",
    starterPrice: "$10",
    xeroLabel: "Xero Payroll NZ",
  },
  {
    code: "GBP",
    currencySymbol: "£",
    flag: "🇬🇧",
    name: "United Kingdom",
    payrollRegionName: "UK",
    premiumPrice: "£11",
    starterPrice: "£5",
    xeroLabel: "Xero Payroll UK",
  },
] as const;

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
  const country =
    countryOptions.find((c) => c.code === currency) ?? countryOptions[0];
  return {
    available: true as const,
    country,
    currency,
    heading: `${country.name} plans`,
    region: { country: country.name, label: country.code },
  };
};

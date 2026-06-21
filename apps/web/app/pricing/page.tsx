import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { PricingExperience } from "./components/pricing-experience";

export const metadata: Metadata = createMetadata({
  title: "Pricing",
  description:
    "Team Calendar pricing for Xero Payroll teams. Compare Starter, Premium, and Enterprise plans for calendar availability publishing.",
});

const Pricing = () => <PricingExperience />;

export default Pricing;

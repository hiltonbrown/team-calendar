import { getLaunchMode } from "@repo/next-config/launch-mode";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import "../styles/features.css";
import "../styles/motion.css";
import { PricingExperience } from "./components/pricing-experience";

const launchMode = getLaunchMode();

export const metadata: Metadata = createMetadata({
  alternates: { canonical: "/pricing" },
  description:
    launchMode === "early_access"
      ? "Eligibility and inclusions for Team Calendar’s closed Australian early-access cohort."
      : "Compare Team Calendar Starter and Premium pricing for Australian Xero Payroll teams.",
  openGraph: { url: "/pricing" },
  title: launchMode === "early_access" ? "Australian early access" : "Pricing",
});

const Pricing = () => <PricingExperience mode={launchMode} />;
export default Pricing;

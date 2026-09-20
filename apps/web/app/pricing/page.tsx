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

interface PageProps {
  searchParams?: Promise<{ mode?: string }>;
}

const resolveLaunchMode = (mode?: string): "early_access" | "paid" => {
  if (mode === "paid") {
    return "paid";
  }
  if (mode === "early_access") {
    return "early_access";
  }
  return launchMode;
};

const Pricing = async (props: PageProps) => {
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const mode = resolveLaunchMode(searchParams?.mode);
  return <PricingExperience mode={mode} />;
};

export default Pricing;

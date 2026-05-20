import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { FeatureCardsSection } from "../features/components/feature-cards-section";
import { FinalCtaSection } from "../features/components/final-cta-section";
import { HeroSection } from "../features/components/hero-section";
import { HowItWorksSection } from "../features/components/how-it-works-section";
import { PricingSection } from "./components/pricing-section";

export const metadata: Metadata = createMetadata({
  title: "LeaveSync: Simple leave requests, clear team calendars.",
  description:
    "LeaveSync gives employees one easy place to request leave and working patterns, then keeps Xero Payroll and shared calendars current automatically.",
});

const Home = () => (
  <main className="fmkt-page">
    <HeroSection />
    <FeatureCardsSection />
    <HowItWorksSection />
    <PricingSection />
    <FinalCtaSection />
  </main>
);

export default Home;

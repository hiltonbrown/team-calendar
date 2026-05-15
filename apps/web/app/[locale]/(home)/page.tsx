import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { BenefitsStrip } from "../features/components/benefits-strip";
import { CalendarVisibilitySection } from "../features/components/calendar-visibility-section";
import { FeatureCardsSection } from "../features/components/feature-cards-section";
import { FinalCtaSection } from "../features/components/final-cta-section";
import { HeroSection } from "../features/components/hero-section";
import { HowItWorksSection } from "../features/components/how-it-works-section";
import { SyncPathwayStrip } from "../features/components/sync-pathway-strip";
import { PricingSection } from "./components/pricing-section";

export const metadata: Metadata = createMetadata({
  title: "LeaveSync: Enter leave once. Stay synchronised everywhere.",
  description:
    "LeaveSync makes leave simple. Enter it once and we'll automatically sync to Outlook, Google Calendar and Xero, so your team, your calendars and your payroll are always in sync.",
});

const Home = () => (
  <main className="fmkt-page">
    <HeroSection />
    <SyncPathwayStrip />
    <FeatureCardsSection />
    <CalendarVisibilitySection />
    <HowItWorksSection />
    <BenefitsStrip />
    <PricingSection />
    <FinalCtaSection />
  </main>
);

export default Home;

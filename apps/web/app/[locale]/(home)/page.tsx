import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { BenefitsStrip } from "../features/components/benefits-strip";
import { CalendarVisibilitySection } from "../features/components/calendar-visibility-section";
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
    <div className="fmkt-hero-feature-stack">
      <HeroSection />
    </div>
    <div className="fmkt-slide">
      <FeatureCardsSection />
    </div>
    <div className="fmkt-slide">
      <CalendarVisibilitySection />
    </div>
    <div className="fmkt-slide">
      <HowItWorksSection />
    </div>
    <div className="fmkt-slide">
      <BenefitsStrip />
    </div>
    <div className="fmkt-slide">
      <div className="fmkt-pricing-slide">
        <PricingSection />
      </div>
    </div>
    <div className="fmkt-slide">
      <FinalCtaSection />
    </div>
  </main>
);

export default Home;

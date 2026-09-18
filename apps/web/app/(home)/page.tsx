import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { FeatureCardsSection } from "../features/components/feature-cards-section";
import { FinalCtaSection } from "../features/components/final-cta-section";
import { HeroSection } from "../features/components/hero-section";
import { HowItWorksSection } from "../features/components/how-it-works-section";
import { CalendarIntegrationSection } from "./components/calendar-integration-section";
import { ProblemSection } from "./components/problem-section";
import { TeamTimelineSection } from "./components/team-timeline-section";

export const metadata: Metadata = createMetadata({
  description:
    "Team Calendar gives employees one easy place to request leave and working patterns, then keeps Xero Payroll and shared calendars current automatically.",
  title: "Team Calendar: Simple leave requests, clear team calendars.",
});

// Trigger recompilation after CSS syntax fixes
const Home = () => (
  <main className="fmkt-page" id="main-content" tabIndex={-1}>
    <HeroSection />
    <ProblemSection />
    <FeatureCardsSection />
    <TeamTimelineSection />
    <CalendarIntegrationSection />
    <HowItWorksSection />
    <FinalCtaSection />
  </main>
);

export default Home;

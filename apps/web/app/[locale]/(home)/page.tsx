import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { FeatureSection } from "./components/feature-section";
import { Hero } from "./components/hero";
import { ImageShowcase } from "./components/image-showcase";
import { PricingSection } from "./components/pricing-section";
import { SnapshotSection } from "./components/snapshot-section";
import { WorkflowSection } from "./components/workflow-section";

export const metadata: Metadata = createMetadata({
  title: "LeaveSync: Team availability, synchronised with Xero",
  description:
    "Streamlined calendar and leave management. Publish staff leave, travel and team availability to every Outlook, Google, and Apple calendar your organisation already uses.",
});

const Home = () => (
  <main className="marketing-home">
    <div className="marketing-story-content">
      <Hero />
      <SnapshotSection />
      <WorkflowSection />
      <ImageShowcase />
      <FeatureSection />
      <PricingSection />
    </div>
  </main>
);

export default Home;

import { MarketingProductSnapshot } from "./marketing-product-snapshot";
import { SectionIntro } from "./section-intro";

export const SnapshotSection = () => (
  <section
    className="marketing-story-panel marketing-story-panel--snapshot marketing-snapshot-section"
    id="snapshot"
  >
    <div className="marketing-snapshot-intro">
      <SectionIntro
        copy="Approved leave, WFH and travel stay visible without duplicate calendar admin."
        eyebrow="The day to day"
        title="One shared view, kept current."
      />
    </div>
    <MarketingProductSnapshot />
  </section>
);

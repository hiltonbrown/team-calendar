import { MarketingProductSnapshot } from "./marketing-product-snapshot";
import { SectionIntro } from "./section-intro";

export const SnapshotSection = () => (
  <section className="marketing-story-panel marketing-story-panel--snapshot marketing-snapshot-section">
    <div className="marketing-snapshot-intro">
      <SectionIntro
        copy="No manual data entry in several places, no missed emails or text messages"
        eyebrow="The day to day"
        title="Better than a shared calendar."
      />
    </div>
    <MarketingProductSnapshot />
  </section>
);

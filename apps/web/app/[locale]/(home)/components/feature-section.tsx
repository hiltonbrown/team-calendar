import { MarketingCard } from "./marketing-card";
import { type iconPaths, MarketingIcon } from "./marketing-icons";

export interface Feature {
  body: string;
  icon: keyof typeof iconPaths;
  kicker: string;
  title: string;
}

const features: Feature[] = [
  {
    icon: "sync",
    kicker: "Feeds",
    title: "Secure calendar feed",
    body: "Calendar subscriptions per team, tag, or the whole organisation. View staff from Outlook, Google or Apple calendars.",
  },
  {
    icon: "leaf",
    kicker: "Availability",
    title: "Next generation shared calendar",
    body: "Annual leave, working from home, travelling, training, on-site. Standardised into one availability layer your whole org can read.",
  },
  {
    icon: "link",
    kicker: "People",
    title: "Staff, contractors & others included",
    body: "Customisable and extensible to cover staff, external contractors and others beyond payroll.",
  },
  {
    icon: "shield",
    kicker: "Privacy",
    title: "Privacy by design",
    body: "Feeds are revocable, never guessable and never indexed.",
  },
];

export const FeatureSection = () => (
  <section className="marketing-section marketing-story-panel marketing-story-panel--features">
    <div className="marketing-feature-editorial">
      <p className="marketing-overline">Built for the operational layer</p>
      <h2>Calendar clarity without asking people to change calendars.</h2>
    </div>
    <div className="marketing-feature-grid">
      {features.map((feature) => (
        <MarketingCard key={feature.title}>
          <span className="marketing-feature-icon">
            <MarketingIcon id={feature.icon} size={22} />
          </span>
          <p className="marketing-feature-kicker">{feature.kicker}</p>
          <h3>{feature.title}</h3>
          <p>{feature.body}</p>
        </MarketingCard>
      ))}
    </div>
  </section>
);

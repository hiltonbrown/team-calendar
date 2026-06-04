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
    kicker: "Calendars",
    title: "Secure calendar subscriptions",
    body: "Create subscriptions for a team, location, or the whole organisation. Staff can view availability in the calendar app they already use.",
  },
  {
    icon: "leaf",
    kicker: "Availability",
    title: "One availability layer",
    body: "Annual leave, working from home, travelling, training, and on-site work are standardised into one shared view.",
  },
  {
    icon: "link",
    kicker: "People",
    title: "Staff and contractors included",
    body: "Include employees, contractors and people outside payroll when they need to appear in availability views.",
  },
  {
    icon: "shield",
    kicker: "Privacy",
    title: "Privacy by design",
    body: "Calendar links are revocable, hard to guess, and not indexed.",
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

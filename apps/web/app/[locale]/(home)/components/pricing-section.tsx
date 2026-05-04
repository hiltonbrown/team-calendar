import Link from "next/link";
import { env } from "@/env";
import { MarketingIcon } from "./marketing-icons";

export interface PricingTier {
  featured?: boolean;
  features: string[];
  name: string;
  price: string;
  sub: string;
}

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const pricingTiers: PricingTier[] = [
  {
    name: "Basic",
    price: "$9/month",
    sub: "Up to 10 people",
    features: [
      "Xero Payroll sync",
      "Single team calendar feed",
      "30-day history",
    ],
  },
  {
    name: "Premium",
    price: "$19/month",
    sub: "Up to 50 people",
    features: [
      "Everything in Basic",
      "Unlimited team calendar feeds",
      "1-year calendar history",
    ],
    featured: true,
  },
  {
    name: "Custom",
    price: "Talk to us",
    sub: "For 50+ people",
    features: [
      "Everything in Premium",
      "Dedicated environment",
      "Priority support",
    ],
  },
];

export const PricingSection = () => (
  <section className="marketing-section marketing-story-panel marketing-story-panel--pricing">
    <div className="marketing-pricing-heading">
      <p className="marketing-overline">Pricing</p>
      <h2>Fair and affordable pricing.</h2>
    </div>
    <div className="marketing-pricing-grid">
      {pricingTiers.map((tier) => (
        <article
          className={
            tier.featured
              ? "marketing-price-card marketing-price-card--featured"
              : "marketing-price-card"
          }
          key={tier.name}
        >
          {tier.featured && (
            <span className="marketing-price-badge">MOST TEAMS</span>
          )}
          <h3>{tier.name}</h3>
          <p className="marketing-price-card__price">{tier.price}</p>
          <p className="marketing-price-card__sub">{tier.sub}</p>
          <div className="marketing-price-card__features">
            {tier.features.map((feature) => (
              <div key={feature}>
                <MarketingIcon id="check" size={18} />
                {feature}
              </div>
            ))}
          </div>
          <Link
            className={
              tier.featured
                ? "marketing-btn marketing-btn--primary marketing-price-card__button"
                : "marketing-btn marketing-btn--outline marketing-price-card__button"
            }
            href={tier.price === "Talk to us" ? "/contact" : signUpHref}
          >
            {tier.price === "Talk to us" ? "Contact sales" : "Start trial"}
          </Link>
        </article>
      ))}
    </div>
  </section>
);

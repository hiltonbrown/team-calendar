import Link from "next/link";
import { env } from "@/env";
import { MarketingIcon } from "./marketing-icons";

export interface PricingTier {
  cta: string;
  featured?: boolean;
  features: string[];
  href: string;
  name: string;
  price: string;
  sub: string;
}

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const pricingTiers: PricingTier[] = [
  {
    name: "Early access",
    price: "No credit card",
    sub: "Use LeaveSync while pricing is finalised",
    features: [
      "Connect Xero Payroll",
      "Publish team calendar subscriptions",
      "Give feedback before general release",
    ],
    cta: "Start early access",
    href: signUpHref,
    featured: true,
  },
  {
    name: "Pricing model",
    price: "Coming soon",
    sub: "Simple per-employee pricing",
    features: [
      "Based on active employees synced from Xero",
      "No setup fee",
      "AU, NZ and UK Payroll included",
    ],
    cta: "View pricing notes",
    href: "/pricing",
  },
  {
    name: "Enterprise",
    price: "Talk to us",
    sub: "For larger or multi-organisation teams",
    features: [
      "Multiple Xero organisations",
      "Volume pricing discussion",
      "Tailored support",
    ],
    cta: "Contact sales",
    href: "/contact",
  },
];

export const PricingSection = () => (
  <section className="marketing-section marketing-story-panel marketing-story-panel--pricing">
    <div className="marketing-pricing-heading">
      <p className="marketing-overline">Pricing</p>
      <h2>Pricing is being finalised.</h2>
      <p>
        Early access is open while we finish the commercial model. Pricing will
        be based on the active employees synced from Xero Payroll.
      </p>
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
            <span className="marketing-price-badge">EARLY ACCESS</span>
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
            href={tier.href}
          >
            {tier.cta}
          </Link>
        </article>
      ))}
    </div>
  </section>
);

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
    sub: "Try leave requests early",
    features: [
      "Connect Xero Payroll",
      "Publish team calendar subscriptions",
      "Share feedback before general release",
    ],
    cta: "Sign up",
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
    cta: "Contact us",
    href: "/contact",
  },
];

export const PricingSection = () => (
  <section className="marketing-section marketing-story-panel marketing-story-panel--pricing">
    <p className="marketing-overline">Pricing</p>
    <h2>Pricing is being finalised.</h2>
    <p className="marketing-pricing-lead">
      Early access is open while we finish the commercial model. Pricing will be
      based on active employees synced from Xero Payroll.
    </p>
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
                <span
                  aria-hidden="true"
                  className="marketing-price-card__check"
                >
                  <MarketingIcon id="check" size={12} />
                </span>
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

"use client";

import Link from "next/link";
import { MARKETING_PLANS } from "../constants";

export const PricingPlans = () => (
  <div className="fmkt-pricing-cards">
    {MARKETING_PLANS.map((plan) => (
      <div
        className={`fmkt-pricing-card ${plan.highlighted ? "fmkt-pricing-card--highlighted" : ""}`}
        key={plan.name}
      >
        {plan.highlighted && (
          <div className="fmkt-pricing-card__badge">Most Popular</div>
        )}
        <div className="fmkt-pricing-card__header">
          <h3 className="fmkt-pricing-card__title">{plan.name}</h3>
          <p className="fmkt-pricing-card__description">{plan.description}</p>
          <div className="fmkt-pricing-card__price-wrap">
            <span className="fmkt-pricing-card__price">{plan.price}</span>
            {plan.interval && (
              <span className="fmkt-pricing-card__interval">
                /{plan.interval}
              </span>
            )}
          </div>
        </div>
        <ul className="fmkt-pricing-card__features">
          {plan.features.map((feature) => (
            <li className="fmkt-pricing-card__feature" key={feature}>
              <span
                aria-hidden="true"
                className="fmkt-pricing-card__feature-icon"
              >
                ✓
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <div className="fmkt-pricing-card__footer">
          <Link
            className={`marketing-btn ${plan.highlighted ? "marketing-btn--primary" : "marketing-btn--secondary"}`}
            href={plan.ctaHref}
          >
            {plan.ctaText}
          </Link>
        </div>
      </div>
    ))}
  </div>
);

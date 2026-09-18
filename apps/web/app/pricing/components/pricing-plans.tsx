import { PUBLIC_PLAN_CATALOGUE } from "@repo/core";
import Link from "next/link";
import { paidPlanPresentation } from "../constants";

const formatLimit = (value: number, singular: string, plural: string) =>
  value === -1
    ? `Multiple ${plural}`
    : `${value} ${value === 1 ? singular : plural}`;

export const PricingPlans = () => (
  <div className="fmkt-pricing-cards">
    {PUBLIC_PLAN_CATALOGUE.map((plan) => {
      const presentation = paidPlanPresentation[plan.plan_key];
      const highlighted = plan.plan_key === "premium";
      const enterprise = plan.plan_key === "enterprise";
      const features = enterprise
        ? ["Multiple Xero connections", "Coming soon"]
        : [
            `Up to ${plan.limits.seats} staff`,
            formatLimit(
              plan.limits.payroll_entities,
              "Xero connection",
              "Xero connections"
            ),
            presentation.feedLabel,
            plan.features.analytics ? "Advanced Analytics" : "Basic Analytics",
            plan.features.priority_support
              ? "Priority support"
              : "Standard Support",
          ];
      return (
        <article
          className={`fmkt-pricing-card${highlighted ? "fmkt-pricing-card--highlighted" : ""}`}
          key={plan.plan_key}
        >
          {highlighted ? (
            <p className="fmkt-pricing-card__badge">Recommended</p>
          ) : null}
          <div className="fmkt-pricing-card__header">
            <h3 className="fmkt-pricing-card__title">{plan.name}</h3>
            <p className="fmkt-pricing-card__description">
              {presentation.description}
            </p>
            {presentation.price ? (
              <p className="fmkt-pricing-card__price-wrap">
                <span className="fmkt-pricing-card__price">
                  {presentation.price}
                </span>
                <span className="fmkt-pricing-card__interval">/month</span>
              </p>
            ) : (
              <p className="fmkt-pricing-card__price-wrap">
                <span className="fmkt-pricing-card__price">Coming soon</span>
              </p>
            )}
          </div>
          <ul className="fmkt-pricing-card__features">
            {features
              .filter((feature): feature is string => feature !== null)
              .map((feature) => (
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
          {presentation.ctaHref ? (
            <div className="fmkt-pricing-card__footer">
              <Link
                className={`marketing-btn ${highlighted ? "marketing-btn--primary" : "marketing-btn--secondary"}`}
                href={presentation.ctaHref}
              >
                Get started
              </Link>
            </div>
          ) : null}
        </article>
      );
    })}
  </div>
);

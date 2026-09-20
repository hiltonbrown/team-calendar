import { PUBLIC_PLAN_CATALOGUE } from "@repo/core";
import Link from "next/link";
import { paidPlanPresentation } from "../constants";

type PlanItem = (typeof PUBLIC_PLAN_CATALOGUE)[number];

const formatLimit = (value: number, singular: string, plural: string) =>
  value === -1
    ? `Multiple ${plural}`
    : `${value} ${value === 1 ? singular : plural}`;

const PlanCard = ({ plan }: { plan: PlanItem }) => {
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
      className={[
        "fmkt-pricing-card",
        highlighted && "fmkt-pricing-card--highlighted",
        enterprise && "fmkt-pricing-card--enterprise",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {highlighted ? (
        <span className="fmkt-pricing-card__badge">Recommended</span>
      ) : null}
      {enterprise ? (
        <span className="fmkt-pricing-card__badge fmkt-pricing-card__badge--muted">
          Multi-entity
        </span>
      ) : null}
      <div className="fmkt-pricing-card__header">
        <h3 className="fmkt-pricing-card__title">{plan.name}</h3>
        <p className="fmkt-pricing-card__description">
          {presentation.description}
        </p>
        {presentation.price ? (
          <div className="fmkt-pricing-card__price-wrap">
            <span className="fmkt-pricing-card__price">
              {presentation.price}
            </span>
            <span className="fmkt-pricing-card__interval">/month</span>
          </div>
        ) : (
          <div className="fmkt-pricing-card__price-wrap">
            <span className="fmkt-pricing-card__price">Coming soon</span>
          </div>
        )}
        <p className="fmkt-pricing-card__price-note">
          {enterprise
            ? "Aggregated availability across entities"
            : "14-day free trial · No card required"}
        </p>
      </div>
      <div className="fmkt-pricing-card__divider" />
      <ul className="fmkt-pricing-card__features">
        {features
          .filter((feature): feature is string => feature !== null)
          .map((feature) => (
            <li className="fmkt-pricing-card__feature" key={feature}>
              <span
                aria-hidden="true"
                className="fmkt-pricing-card__feature-icon"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="15"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                  width="15"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span>{feature}</span>
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
      ) : (
        <div className="fmkt-pricing-card__footer">
          <a className="marketing-btn marketing-btn--secondary" href="/contact">
            Enquire with support
          </a>
        </div>
      )}
    </article>
  );
};

export const PricingPlans = () => (
  <div className="fmkt-pricing-cards">
    {PUBLIC_PLAN_CATALOGUE.map((plan) => (
      <PlanCard key={plan.plan_key} plan={plan} />
    ))}
  </div>
);

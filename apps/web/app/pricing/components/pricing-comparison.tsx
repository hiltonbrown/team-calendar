import { PUBLIC_PLAN_CATALOGUE } from "@repo/core";
import { paidPlanPresentation } from "../constants";

type CataloguePlan = (typeof PUBLIC_PLAN_CATALOGUE)[number];
const analyticsLabel = (plan: CataloguePlan) => {
  if (plan.plan_key === "enterprise") {
    return "Not advertised";
  }
  return plan.features.analytics ? "Advanced Analytics" : "Basic Analytics";
};
const supportLabel = (plan: CataloguePlan) => {
  if (plan.plan_key === "enterprise") {
    return "Not advertised";
  }
  return plan.features.priority_support
    ? "Priority support"
    : "Standard Support";
};

const rows = [
  {
    label: "Staff",
    value: (plan: CataloguePlan) =>
      plan.limits.seats === -1
        ? "Not advertised"
        : `Up to ${plan.limits.seats}`,
  },
  {
    label: "Xero connections",
    value: (plan: CataloguePlan) =>
      plan.limits.payroll_entities === -1 ? "Multiple" : "Single",
  },
  {
    label: "Calendar feed",
    value: (plan: CataloguePlan) =>
      paidPlanPresentation[plan.plan_key].feedLabel ?? "Not advertised",
  },
  {
    label: "Analytics",
    value: analyticsLabel,
  },
  {
    label: "Support",
    value: supportLabel,
  },
] as const;

export const PricingComparison = () => (
  <section
    aria-labelledby="comparison-heading"
    className="fmkt-pricing-compare"
  >
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <h2 className="fmkt-section-title" id="comparison-heading">
          Compare Australian plans
        </h2>
        <p className="fmkt-section-subtitle">
          Transparent limits and included capabilities for Australian Xero
          Payroll organisations.
        </p>
      </div>
      <section
        aria-label="Plan comparison, scroll horizontally if needed"
        className="fmkt-pricing-table-wrap"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: labelled focusable scroll region follows the documented narrow-table keyboard pattern
        tabIndex={0}
      >
        <table className="fmkt-pricing-table">
          <caption>Team Calendar plan limits and included capabilities</caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              {PUBLIC_PLAN_CATALOGUE.map((plan) => (
                <th
                  className={
                    plan.plan_key === "premium"
                      ? "fmkt-pricing-table__col--highlight"
                      : undefined
                  }
                  key={plan.plan_key}
                  scope="col"
                >
                  <div className="fmkt-pricing-table__th-wrap">
                    <span>{plan.name}</span>
                    {plan.plan_key === "premium" ? (
                      <span className="fmkt-pricing-table__th-rec">
                        Popular
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {PUBLIC_PLAN_CATALOGUE.map((plan) => (
                  <td
                    className={
                      plan.plan_key === "premium"
                        ? "fmkt-pricing-table__cell--highlight"
                        : undefined
                    }
                    key={plan.plan_key}
                  >
                    {row.value(plan)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="fmkt-pricing-comparison-cards">
        {PUBLIC_PLAN_CATALOGUE.map((plan) => (
          <article
            className={
              plan.plan_key === "premium"
                ? "fmkt-pricing-cmp-card fmkt-pricing-cmp-card--rec"
                : "fmkt-pricing-cmp-card"
            }
            key={plan.plan_key}
          >
            <div className="fmkt-pricing-cmp-card__header">
              <h3>{plan.name}</h3>
              {plan.plan_key === "premium" ? (
                <span className="fmkt-pricing-cmp-card__badge">
                  Recommended
                </span>
              ) : null}
            </div>
            <dl className="fmkt-pricing-cmp-card__dl">
              {rows.map((row) => (
                <div className="fmkt-pricing-cmp-card__row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value(plan)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </div>
  </section>
);

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
                <th key={plan.plan_key} scope="col">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {PUBLIC_PLAN_CATALOGUE.map((plan) => (
                  <td key={plan.plan_key}>{row.value(plan)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="fmkt-pricing-comparison-cards">
        {PUBLIC_PLAN_CATALOGUE.map((plan) => (
          <article key={plan.plan_key}>
            <h3>{plan.name}</h3>
            <dl>
              {rows.map((row) => (
                <div key={row.label}>
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

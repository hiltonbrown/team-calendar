"use client";

import { useMemo, useState } from "react";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

const tiers = [
  {
    name: "Starter",
    price: "$9",
    unit: "per active employee, monthly",
    description:
      "For smaller Xero Payroll teams that need reliable leave visibility.",
    cta: "Start with Starter",
    featured: false,
    features: [
      "One Xero organisation",
      "Team and whole-organisation feeds",
      "Outlook, Google, and Apple calendar subscriptions",
      "Revocable feed links",
    ],
  },
  {
    name: "Premium",
    price: "$19",
    unit: "per active employee, monthly",
    description:
      "For growing teams that need stronger controls and reporting context.",
    cta: "Start with Premium",
    featured: true,
    features: [
      "Everything in Starter",
      "Multiple team and location feeds",
      "Manual availability entries",
      "Sync health and reconciliation views",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Talk to us",
    unit: "tailored for complex payroll environments",
    description:
      "For multi-entity organisations with custom rollout and governance needs.",
    cta: "Contact sales",
    featured: false,
    features: [
      "Multiple Xero organisations",
      "Custom implementation support",
      "Advanced audit and governance requirements",
      "Volume pricing",
    ],
  },
] as const;

const comparisonRows = [
  {
    capability: "Xero Payroll connection",
    starter: "1",
    premium: "1",
    enterprise: "Multiple",
  },
  {
    capability: "Calendar feeds",
    starter: "Core feeds",
    premium: "Team and location feeds",
    enterprise: "Custom",
  },
  {
    capability: "Manual availability",
    starter: "Included",
    premium: "Included",
    enterprise: "Included",
  },
  {
    capability: "Sync health",
    starter: "Basic",
    premium: "Advanced",
    enterprise: "Advanced",
  },
  {
    capability: "Support",
    starter: "Standard",
    premium: "Priority",
    enterprise: "Implementation partner",
  },
] as const;

const setupOptions = [
  {
    title: "Self-serve setup",
    copy: "Connect Xero, choose your organisation, and publish the first secure feed in minutes.",
    icon: "sync",
  },
  {
    title: "Guided rollout",
    copy: "We help map teams, locations, privacy settings, and calendar feed structure before launch.",
    icon: "shieldCheck",
  },
  {
    title: "Enterprise onboarding",
    copy: "Structured planning for multi-entity payroll, governance, and internal change management.",
    icon: "briefcase",
  },
] as const;

const faqs = [
  {
    question: "What counts as an active employee?",
    answer:
      "An active employee is a person synced from Xero Payroll who can appear in Team Calendar availability records or calendar feeds.",
  },
  {
    question: "Do you charge for contractors?",
    answer:
      "Contractors only count when you add them to Team Calendar and include them in availability views or feeds.",
  },
  {
    question: "Can we change plans later?",
    answer:
      "Yes. You can start smaller and move to Premium or Enterprise when your feed structure or support needs change.",
  },
  {
    question: "Is a credit card required for early access?",
    answer:
      "No. Early access teams can connect Xero and validate their calendar workflow before paid billing begins.",
  },
] as const;

export const PricingExperience = () => {
  const [employees, setEmployees] = useState(35);
  const [openFaq, setOpenFaq] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const estimate = useMemo(
    () => ({
      starter: employees * 9,
      premium: employees * 19,
      hoursSaved: Math.max(3, Math.round(employees * 0.35)),
    }),
    [employees]
  );

  return (
    <main className="fmkt-page fmkt-pricing-page">
      <section className="fmkt-pricing-hero">
        <div className="fmkt-container fmkt-pricing-hero__grid">
          <div>
            <p className="fmkt-overline">Pricing</p>
            <h1>Choose the plan that matches your payroll complexity.</h1>
            <p>
              Simple per-employee pricing for Xero Payroll teams that want
              approved leave and availability to appear in shared calendars
              without manual re-entry.
            </p>
          </div>
          <div className="fmkt-pricing-hero__summary">
            <span>From</span>
            <strong>$9</strong>
            <p>
              per active employee, monthly. Early access remains available while
              billing is finalised.
            </p>
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-tiers">
        <div className="fmkt-container">
          <div className="fmkt-pricing-tier-grid">
            {tiers.map((tier) => (
              <article
                className={`fmkt-price-tier ${
                  tier.featured ? "fmkt-price-tier--featured" : ""
                }`}
                key={tier.name}
              >
                {tier.featured ? (
                  <span className="fmkt-price-tier__badge">Most teams</span>
                ) : null}
                <h2>{tier.name}</h2>
                <div className="fmkt-price-tier__price">
                  <strong>{tier.price}</strong>
                  <span>{tier.unit}</span>
                </div>
                <p>{tier.description}</p>
                <a
                  className={`marketing-btn ${
                    tier.featured
                      ? "marketing-btn--primary"
                      : "marketing-btn--secondary"
                  }`}
                  href={tier.name === "Enterprise" ? "#contact" : "/contact"}
                >
                  {tier.cta}
                </a>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <MarketingIcon id="check" size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-estimator">
        <div className="fmkt-container fmkt-pricing-estimator__grid">
          <div>
            <p className="fmkt-overline">Estimator</p>
            <h2 className="fmkt-section-title">
              Model the monthly cost before you talk to anyone.
            </h2>
            <p>
              Move the slider to match the number of active people you expect to
              publish into calendars.
            </p>
            <label htmlFor="employee-estimate">
              Active employees
              <strong>{employees}</strong>
            </label>
            <input
              id="employee-estimate"
              max={250}
              min={5}
              onChange={(event) => setEmployees(Number(event.target.value))}
              suppressHydrationWarning
              type="range"
              value={employees}
            />
          </div>
          <div className="fmkt-pricing-estimator__results">
            <div>
              <span>Starter</span>
              <strong>${estimate.starter.toLocaleString()}</strong>
              <small>per month</small>
            </div>
            <div>
              <span>Premium</span>
              <strong>${estimate.premium.toLocaleString()}</strong>
              <small>per month</small>
            </div>
            <div>
              <span>Admin time saved</span>
              <strong>{estimate.hoursSaved} hrs</strong>
              <small>estimated each month</small>
            </div>
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-compare">
        <div className="fmkt-container">
          <div className="fmkt-section-header">
            <p className="fmkt-overline">Compare</p>
            <h2 className="fmkt-section-title">
              The same calendar foundation, more control as you grow.
            </h2>
          </div>
          <div className="fmkt-pricing-table-wrap">
            <table className="fmkt-pricing-table">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Starter</th>
                  <th>Premium</th>
                  <th>Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.capability}>
                    <td>{row.capability}</td>
                    <td>{row.starter}</td>
                    <td>{row.premium}</td>
                    <td>{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-setup">
        <div className="fmkt-container">
          <div className="fmkt-section-header">
            <p className="fmkt-overline">Setup</p>
            <h2 className="fmkt-section-title">
              Start light, add guidance when the rollout needs it.
            </h2>
          </div>
          <div className="fmkt-pricing-setup__grid">
            {setupOptions.map((option) => (
              <article className="fmkt-pricing-setup-card" key={option.title}>
                <span>
                  <MarketingIcon id={option.icon} size={22} />
                </span>
                <h3>{option.title}</h3>
                <p>{option.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-faq">
        <div className="fmkt-container fmkt-pricing-faq__grid">
          <div>
            <p className="fmkt-overline">FAQ</p>
            <h2 className="fmkt-section-title">Common pricing questions.</h2>
          </div>
          <div className="fmkt-pricing-faq__list">
            {faqs.map((faq, index) => (
              <div className="fmkt-pricing-faq__item" key={faq.question}>
                <button
                  aria-expanded={openFaq === index}
                  onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                  type="button"
                >
                  {faq.question}
                  <span>{openFaq === index ? "−" : "+"}</span>
                </button>
                {openFaq === index ? <p>{faq.answer}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-contact" id="contact">
        <div className="fmkt-container fmkt-pricing-contact__grid">
          <div>
            <p className="fmkt-overline">Contact</p>
            <h2 className="fmkt-section-title">Need help choosing a plan?</h2>
            <p>
              Send a few details and we will help you map the right plan,
              rollout shape, and feed structure.
            </p>
          </div>
          <form
            className="fmkt-pricing-form"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <label>
              Work email
              <input required suppressHydrationWarning type="email" />
            </label>
            <label>
              Company
              <input required suppressHydrationWarning type="text" />
            </label>
            <label>
              Payroll size
              <select defaultValue="25-100">
                <option>Under 25</option>
                <option>25-100</option>
                <option>101-250</option>
                <option>250+</option>
              </select>
            </label>
            <label>
              What do you need?
              <textarea rows={4} suppressHydrationWarning />
            </label>
            <button
              className="marketing-btn marketing-btn--primary"
              type="submit"
            >
              Send enquiry
            </button>
            {submitted ? (
              <p className="fmkt-pricing-form__success">
                Thanks. Your enquiry is ready for follow-up.
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
};

"use client";

import { useState } from "react";
import { MarketingIcon } from "../../(home)/components/marketing-icons";
import { PricingPlans } from "./pricing-plans";

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
    question: "How does billing work?",
    answer:
      "Team Calendar bills per organisation plan, not per seat. Each plan covers your whole Xero Payroll organisation, so adding people never changes the price.",
  },
  {
    question: "What if we run more than one Xero file?",
    answer:
      "Each Xero Payroll file is its own organisation. Multi-entity teams run on Enterprise, which covers several organisations under one agreement.",
  },
  {
    question: "Can we change plans later?",
    answer:
      "Yes. You can start smaller and move to a larger plan when your feed structure or support needs change.",
  },
  {
    question: "Is a credit card required for early access?",
    answer:
      "No. Early access teams can connect Xero and validate their calendar workflow before paid billing begins.",
  },
] as const;

export const PricingExperience = () => {
  const [openFaq, setOpenFaq] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="fmkt-page fmkt-pricing-page">
      <section className="fmkt-pricing-hero">
        <div className="fmkt-container fmkt-pricing-hero__grid">
          <div>
            <h1>
              One plan per organisation. <em>No per-seat maths.</em>
            </h1>
            <p>
              Flat plans for Xero Payroll teams that want approved leave and
              availability in shared calendars without manual re-entry. Add as
              many people as your payroll file holds; the price stays the same.
            </p>
          </div>
          <div className="fmkt-pricing-hero__summary">
            <span>No per-seat billing</span>
            <p>
              Every plan covers your whole Xero Payroll organisation. Early
              access is open now while plans are finalised.
            </p>
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-plans">
        <div className="fmkt-container">
          <div className="fmkt-section-header">
            <h2 className="fmkt-section-title">
              Plans that scale with your rollout, not your headcount.
            </h2>
          </div>
          <div className="fmkt-pricing-plans__table">
            <PricingPlans />
          </div>
        </div>
      </section>

      <section className="fmkt-pricing-compare">
        <div className="fmkt-container">
          <div className="fmkt-section-header">
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

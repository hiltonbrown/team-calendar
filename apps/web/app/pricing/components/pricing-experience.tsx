import type { LaunchMode } from "@repo/next-config/launch-mode";
import {
  supportEmail,
  supportHoursLong,
  supportMailtoHref,
} from "@/src/data/support";
import { PricingComparison } from "./pricing-comparison";
import { PricingCurrencySelector } from "./pricing-currency-selector";
import { PricingFaq } from "./pricing-faq";
import { PricingPlans } from "./pricing-plans";

const EarlyAccess = () => (
  <>
    <section className="fmkt-pricing-plans">
      <div className="fmkt-container">
        <div className="fmkt-section-header">
          <h2 className="fmkt-section-title">
            A focused Australian early-access cohort
          </h2>
          <p>
            We are admitting a small number of Australian Xero Payroll teams for
            guided setup and product feedback.
          </p>
        </div>
        <div className="fmkt-pricing-cohort">
          <article>
            <h3>What is included</h3>
            <ul>
              <li>One Australian Xero Payroll connection</li>
              <li>Approved leave and manual availability</li>
              <li>Secure Outlook, Google and Apple calendar feeds</li>
              <li>Guided setup during {supportHoursLong}</li>
            </ul>
          </article>
          <article>
            <h3>Who it suits</h3>
            <p>
              Australian small businesses ready to test their real leave and
              availability workflow with our team.
            </p>
            <p>
              Future commercial terms will be confirmed before paid billing
              begins.
            </p>
            <a
              className="marketing-btn marketing-btn--primary"
              href={supportMailtoHref}
            >
              Enquire about early access
            </a>
          </article>
        </div>
      </div>
    </section>
  </>
);

const EarlyAccessContact = () => (
  <section className="fmkt-pricing-contact">
    <div className="fmkt-container fmkt-pricing-contact__grid">
      <div>
        <h2 className="fmkt-section-title">One clear next step</h2>
        <p>
          Tell us your organisation name, team size, Xero Payroll region and the
          help you need.
        </p>
      </div>
      <div className="fmkt-pricing-form">
        <h3>Email the Team Calendar team</h3>
        <a href={supportMailtoHref}>{supportEmail}</a>
        <p>
          Staffed {supportHoursLong}. This is a response window, not a
          guaranteed resolution time.
        </p>
      </div>
    </div>
  </section>
);

export const PricingExperience = ({ mode }: { mode: LaunchMode }) => (
  <main className="fmkt-page fmkt-pricing-page" id="pricing-main" tabIndex={-1}>
    <section className="fmkt-pricing-hero">
      <div className="fmkt-container fmkt-pricing-hero__grid">
        <div>
          <h1>
            {mode === "early_access"
              ? "Join Team Calendar’s Australian early access."
              : "Straightforward plans for Australian Xero Payroll teams."}
          </h1>
          <p>
            {mode === "early_access"
              ? "A closed, guided cohort for teams ready to publish trusted leave and availability into the calendars they already use."
              : "Choose by staff coverage, feed flexibility, analytics and support. AUD is selected by default."}
          </p>
        </div>
        <div className="fmkt-pricing-hero__summary">
          <span>
            {mode === "early_access" ? "Closed cohort" : "Australia first"}
          </span>
          <strong>{mode === "early_access" ? "Guided" : "AUD"}</strong>
          <p>
            {mode === "early_access"
              ? "Eligibility and onboarding are confirmed directly with our team."
              : "Starter is $9/month. Premium is $19/month."}
          </p>
        </div>
      </div>
    </section>
    {mode === "early_access" ? (
      <EarlyAccess />
    ) : (
      <PricingCurrencySelector
        audPricing={
          <>
            <section className="fmkt-pricing-plans">
              <div className="fmkt-container">
                <PricingPlans />
              </div>
            </section>
            <PricingComparison />
          </>
        }
      />
    )}
    <PricingFaq mode={mode} />
    {mode === "early_access" ? <EarlyAccessContact /> : null}
  </main>
);

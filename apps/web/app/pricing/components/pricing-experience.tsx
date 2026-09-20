import type { LaunchMode } from "@repo/next-config/launch-mode";
import Link from "next/link";
import {
  supportEmail,
  supportHoursLong,
  supportMailtoHref,
} from "@/src/data/support";
import { signUpHref } from "@/src/lib/auth-links";
import { PricingComparison } from "./pricing-comparison";
import { PricingCurrencySelector } from "./pricing-currency-selector";
import { PricingFaq } from "./pricing-faq";
import { PricingPlans } from "./pricing-plans";

const EarlyAccess = () => (
  <section className="fmkt-pricing-plans">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <h2 className="fmkt-section-title">
          A focused Australian early-access cohort
        </h2>
        <p className="fmkt-section-subtitle">
          We are admitting a small number of Australian Xero Payroll teams for
          guided setup and product feedback.
        </p>
      </div>
      <div className="fmkt-pricing-cohort">
        <article className="fmkt-pricing-cohort-card">
          <div className="fmkt-pricing-cohort-card__header">
            <span className="fmkt-pricing-cohort-card__pill">Included</span>
            <h3>What is included</h3>
          </div>
          <ul className="fmkt-pricing-cohort-card__list">
            <li>
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                width="16"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>One Australian Xero Payroll connection</span>
            </li>
            <li>
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                width="16"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Approved leave and manual availability</span>
            </li>
            <li>
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                width="16"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Secure Outlook, Google and Apple calendar feeds</span>
            </li>
            <li>
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                width="16"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Guided setup during {supportHoursLong}</span>
            </li>
          </ul>
        </article>
        <article className="fmkt-pricing-cohort-card">
          <div className="fmkt-pricing-cohort-card__header">
            <span className="fmkt-pricing-cohort-card__pill">Eligibility</span>
            <h3>Who it suits</h3>
          </div>
          <p className="fmkt-pricing-cohort-card__desc">
            Australian small businesses ready to test their real leave and
            availability workflow with our team.
          </p>
          <p className="fmkt-pricing-cohort-card__note">
            Future commercial terms will be confirmed before paid billing
            begins.
          </p>
          <a
            className="marketing-btn marketing-btn--primary fmkt-pricing-cohort-card__btn"
            href="/contact"
          >
            Enquire about early access
          </a>
        </article>
      </div>
    </div>
  </section>
);

const EarlyAccessContact = () => (
  <section className="fmkt-pricing-contact">
    <div className="fmkt-container fmkt-pricing-contact__grid">
      <div className="fmkt-pricing-contact__info">
        <h2 className="fmkt-section-title">One clear next step</h2>
        <p className="fmkt-pricing-contact__desc">
          Tell us your organisation name, team size and the help you need with
          Australian Xero Payroll.
        </p>
      </div>
      <div className="fmkt-pricing-form">
        <h3>Email the Team Calendar team</h3>
        <a className="fmkt-pricing-email-link" href={supportMailtoHref}>
          {supportEmail}
        </a>
        <p className="fmkt-pricing-email-sub">
          Staffed {supportHoursLong}. This is a response window, not a
          guaranteed resolution time.
        </p>
      </div>
    </div>
  </section>
);

const PricingFinalCta = () => (
  <section className="fmkt-pricing-final-cta">
    <div className="fmkt-container">
      <div className="fmkt-pricing-final-cta__card">
        <h2 className="fmkt-pricing-final-cta__title">
          Ready to give your team calendar clarity?
        </h2>
        <p className="fmkt-pricing-final-cta__sub">
          Connect your Australian Xero Payroll organisation, invite your team,
          and publish your first live calendar feed in minutes.
        </p>
        <div className="fmkt-pricing-final-cta__actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Start your free 14-day trial
          </Link>
          <a className="marketing-btn marketing-btn--secondary" href="/contact">
            Book a guided demo
          </a>
        </div>
        <div className="fmkt-pricing-final-cta__guarantees">
          <div className="fmkt-pricing-guarantee-item">
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Bank-grade AES-256 encryption</span>
          </div>
          <div className="fmkt-pricing-guarantee-item">
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <span>14-day free trial on all plans</span>
          </div>
          <div className="fmkt-pricing-guarantee-item">
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Cancel or change plans anytime</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export const PricingExperience = ({ mode }: { mode: LaunchMode }) => (
  <main className="fmkt-page fmkt-pricing-page" id="main-content" tabIndex={-1}>
    <section className="fmkt-pricing-hero">
      <div className="fmkt-container">
        <div className="fmkt-pricing-hero__content">
          <h1 className="fmkt-pricing-hero__title">
            {mode === "early_access"
              ? "Join Team Calendar’s Australian early access."
              : "Simple, straightforward pricing"}
          </h1>
          <p className="fmkt-pricing-hero__lead">
            {mode === "early_access"
              ? "A closed, guided cohort for teams ready to publish trusted leave and availability into the calendars they already use."
              : "Transparent plans with no per-user fees or surprise add-ons. Every tier includes automated Xero Payroll leave sync, manual availability, and live calendar feeds."}
          </p>
          {mode === "paid" ? (
            <div className="fmkt-pricing-hero__trust-strip">
              <span className="fmkt-pricing-trust-badge">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                14-day free trial
              </span>
              <span className="fmkt-pricing-trust-badge">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Connects in 2 minutes
              </span>
              <span className="fmkt-pricing-trust-badge">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                No credit card required
              </span>
            </div>
          ) : null}
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

    {mode === "paid" ? <PricingFinalCta /> : null}

    {mode === "early_access" ? <EarlyAccessContact /> : null}
  </main>
);

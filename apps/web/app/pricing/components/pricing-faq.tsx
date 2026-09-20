import type { LaunchMode } from "@repo/next-config/launch-mode";

const paidFaqs = [
  {
    answer:
      "Starter includes up to 9 staff. Premium includes up to 50 staff. Choose the plan that covers your current team.",
    question: "How do staff limits work?",
  },
  {
    answer:
      "Starter and Premium each include one Xero Payroll connection. Enterprise support for multiple connections is coming soon.",
    question: "What if we run more than one Xero file?",
  },
  {
    answer:
      "Premium unlocks advanced analytics including team and department leave utilisation trends, real-time absence clash detection to prevent understaffing, visual coverage heatmaps, and audit-ready CSV exports for compliance and payroll reconciliation.",
    question:
      "What analytics and reporting features are included in the Premium plan?",
  },
  {
    answer:
      "Every paid plan includes a 14-day free trial with full feature access. No credit card is required to sign up. If you decide not to continue, your feeds simply pause, and your Xero data remains completely untouched.",
    question: "Is there a free trial, and is a credit card required?",
  },
  {
    answer:
      "Connecting to Xero takes less than two minutes via official Xero OAuth. Team Calendar reads your employee directory and approved leave, and writes back newly approved requests synchronously. Xero remains your authoritative single source of truth for leave balances and payroll accruals.",
    question: "How does Team Calendar connect to Australian Xero Payroll?",
  },
  {
    answer:
      "Team Calendar generates standard, secure iCalendar feeds (webcal/ICS) compatible with Microsoft Outlook (desktop, web, and Mac), Google Calendar, Apple Calendar (iOS and macOS), and any other calendar client that supports subscription feeds.",
    question: "Which calendar applications can subscribe to our feeds?",
  },
  {
    answer:
      "Yes. Alongside Xero-synced leave, Team Calendar allows you to record manual availability entries such as working from home, travelling, client site visits, and training for both payroll and non-payroll team members.",
    question: "Can we track contractors or staff who are not on Xero Payroll?",
  },
  {
    answer:
      "Feed tokens are cryptographically signed and revocable at any moment. Feeds only expose the level of detail you choose, with privacy-masked modes available so medical or confidential leave reasons are kept private.",
    question: "How secure are calendar feed URLs?",
  },
  {
    answer:
      "Yes. You can upgrade, downgrade, or cancel your subscription at any time directly from your billing settings. Plan upgrades take effect immediately with prorated billing.",
    question: "Can we change plans or cancel at any time?",
  },
] as const;

const earlyFaqs = [
  {
    answer: "No. We confirm any future pricing before paid billing begins.",
    question: "Is a credit card required?",
  },
  {
    answer:
      "The cohort is for Australian organisations using Xero Payroll. Email us with your team size and rollout needs.",
    question: "Who is eligible?",
  },
  {
    answer:
      "You receive guided setup from our team during Australian business hours, direct support, and early access to all leave syncing and calendar publishing features.",
    question: "What is included during early access?",
  },
  {
    answer:
      "We guide you through connecting your Australian Xero Payroll account, inviting your team, and configuring your first calendar feeds in Outlook, Google Calendar, or Apple Calendar.",
    question: "How does onboarding work?",
  },
] as const;

export const PricingFaq = ({ mode }: { mode: LaunchMode }) => {
  const faqs = mode === "paid" ? paidFaqs : earlyFaqs;
  return (
    <section className="fmkt-pricing-faq">
      <div className="fmkt-container fmkt-pricing-faq__grid">
        <div className="fmkt-pricing-faq__header">
          <h2 className="fmkt-section-title">Common questions</h2>
          <p className="fmkt-pricing-faq__subtitle">
            Everything you need to know about Team Calendar, Xero Payroll
            syncing, and subscription feeds.
          </p>
        </div>
        <div className="fmkt-pricing-faq__list">
          {faqs.map((faq) => (
            <details className="fmkt-pricing-faq__item" key={faq.question}>
              <summary>
                <span className="fmkt-pricing-faq__q">{faq.question}</span>
                <span aria-hidden="true" className="fmkt-pricing-faq__icon">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="18"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

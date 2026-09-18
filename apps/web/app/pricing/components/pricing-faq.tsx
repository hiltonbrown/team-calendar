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
] as const;

export const PricingFaq = ({ mode }: { mode: LaunchMode }) => {
  const faqs = mode === "paid" ? paidFaqs : earlyFaqs;
  return (
    <section className="fmkt-pricing-faq">
      <div className="fmkt-container fmkt-pricing-faq__grid">
        <h2 className="fmkt-section-title">Common questions</h2>
        <div className="fmkt-pricing-faq__list">
          {faqs.map((faq) => (
            <details className="fmkt-pricing-faq__item" key={faq.question}>
              <summary>
                {faq.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

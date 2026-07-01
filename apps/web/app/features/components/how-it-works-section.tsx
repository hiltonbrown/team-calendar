interface ProcessStep {
  readonly copy: string;
  readonly number: number;
  readonly title: string;
}

const steps: ProcessStep[] = [
  {
    number: 1,
    title: "Request leave",
    copy: "Employees add dates, leave type and notes in one place.",
  },
  {
    number: 2,
    title: "Review with context",
    copy: "Managers approve requests with team availability in view.",
  },
  {
    number: 3,
    title: "Update the source of truth",
    copy: "Approved requests write back to Xero Payroll.",
  },
  {
    number: 4,
    title: "Publish to calendars",
    copy: "Shared calendars show who is available and when, updated within 60 seconds of approval.",
  },
];

export const HowItWorksSection = () => (
  <section className="fmkt-how" id="how-it-works">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <h2 className="fmkt-section-title">Four steps. One calm workflow.</h2>
      </div>
      <div className="fmkt-how__steps">
        {steps.map((step) => (
          <div className="fmkt-how__item" key={step.number}>
            <h3 className="fmkt-how__title">{step.title}</h3>
            <p className="fmkt-how__copy">{step.copy}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

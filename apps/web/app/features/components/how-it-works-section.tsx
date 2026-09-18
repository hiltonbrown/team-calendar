interface ProcessStep {
  readonly copy: string;
  readonly number: number;
  readonly title: string;
}

const steps: ProcessStep[] = [
  {
    copy: "Employees add dates, leave type and notes in one place.",
    number: 1,
    title: "Request leave",
  },
  {
    copy: "Managers approve requests with team availability in view.",
    number: 2,
    title: "Review with context",
  },
  {
    copy: "Approved requests write back to Xero Payroll.",
    number: 3,
    title: "Update the source of truth",
  },
  {
    copy: "Team Calendar republishes approved changes; calendar apps refresh subscribed feeds on their own schedules.",
    number: 4,
    title: "Publish to calendars",
  },
];

export const HowItWorksSection = () => (
  <section className="fmkt-how" id="how-it-works">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <h2 className="fmkt-section-title">One easy workflow</h2>
      </div>
      <div className="fmkt-how__steps">
        {steps.map((step) => (
          <div className="fmkt-how__item" key={step.number}>
            <span aria-hidden="true" className="fmkt-how__node" />
            <h3 className="fmkt-how__title">{step.title}</h3>
            <p className="fmkt-how__copy">{step.copy}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

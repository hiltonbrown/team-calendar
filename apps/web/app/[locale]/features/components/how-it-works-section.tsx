interface ProcessStep {
  readonly copy: string;
  readonly number: number;
  readonly title: string;
}

const steps: ProcessStep[] = [
  {
    number: 1,
    title: "Enter leave",
    copy: "Add leave in seconds with a simple form.",
  },
  {
    number: 2,
    title: "Review and approve",
    copy: "Managers review and approve in one place.",
  },
  {
    number: 3,
    title: "Publish automatically",
    copy: "We update Outlook, Google Calendar and Xero.",
  },
  {
    number: 4,
    title: "Stay visible everywhere",
    copy: "Your team stays informed and business keeps moving.",
  },
];

export const HowItWorksSection = () => (
  <section className="fmkt-how" id="how-it-works">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <p className="fmkt-overline">How it works</p>
        <h2 className="fmkt-section-title">Four steps. No manual work.</h2>
      </div>
      <div className="fmkt-how__steps">
        {steps.map((step) => (
          <div className="fmkt-how__item" key={step.number}>
            <span aria-hidden="true" className="fmkt-how__num">
              0{step.number}
            </span>
            <h3 className="fmkt-how__title">{step.title}</h3>
            <p className="fmkt-how__copy">{step.copy}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

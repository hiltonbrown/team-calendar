export interface WorkflowStep {
  body: string;
  kicker: string;
  title: string;
}

const workflowSteps: WorkflowStep[] = [
  {
    kicker: "Choose",
    title: "Pick your availability type.",
    body: "Choose what you're doing: leave, travel, a client visit, or working from home.",
  },
  {
    kicker: "Add details",
    title: "Add the essentials.",
    body: "Add the dates, a quick note, and how contactable you'll be.",
  },
  {
    kicker: "Submit",
    title: "Send it through.",
    body: "Leave goes to your manager for approval; everything else publishes straight away.",
  },
  {
    kicker: "Update",
    title: "Keep calendars current.",
    body: "Your team calendar and connected calendars (Outlook, Google, Apple) update automatically.",
  },
];

export const WorkflowSection = () => (
  <section className="marketing-section marketing-story-panel marketing-story-panel--workflow marketing-workflow-section">
    <div className="marketing-workflow">
      <div className="marketing-workflow__intro">
        <p className="marketing-overline">Workflow</p>
        <h2>From request to calendar, automatically.</h2>
        <p>
          Team Calendar keeps the operational loop short: people choose the
          right availability type, add the details once, and the right calendars
          stay current.
        </p>
      </div>
      <ol className="marketing-workflow__steps">
        {workflowSteps.map((step, index) => (
          <li key={step.title}>
            <div className="marketing-workflow__marker">
              {String(index + 1).padStart(2, "0")}
            </div>
            <p>{step.kicker}</p>
            <h3>{step.title}</h3>
            <span>{step.body}</span>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

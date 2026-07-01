import { MarketingIcon } from "./marketing-icons";

interface ProblemCard {
  readonly copy: string;
  readonly icon: "calendar" | "check" | "sync";
  readonly title: string;
}

const cards: ProblemCard[] = [
  {
    icon: "check",
    title: "Staff flag leave inconsistently",
    copy: "Some use a form, some send a text, some just don't. You find out when someone doesn't turn up.",
  },
  {
    icon: "sync",
    title: "The calendar and Xero disagree",
    copy: "Approved leave gets entered twice, or not at all. The two drift, and payroll pays for it.",
  },
  {
    icon: "calendar",
    title: "No single view of who is in",
    copy: "Availability lives in your head, a spreadsheet and three chat threads. Nobody can answer who is off next week quickly.",
  },
];

export const ProblemSection = () => (
  <section className="fmkt-problem" id="why-teams-switch">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <p className="fmkt-overline">Why teams switch</p>
        <h2 className="fmkt-section-title">
          The admin is small until it costs you a shift.
        </h2>
        <p className="fmkt-problem__lead">
          A text here, a leave form there, a calendar invite someone forgot to
          send. On a small team it holds together until it doesn&rsquo;t: two
          people book the same week, someone is away and nobody covered, or a
          leave day never made it into Xero and payroll is wrong. The bigger the
          team gets, the more Monday morning is spent reconstructing who is
          actually in.
        </p>
      </div>
      <div className="fmkt-problem__grid">
        {cards.map((card) => (
          <article className="fmkt-problem__card" key={card.title}>
            <span aria-hidden="true" className="fmkt-problem__icon">
              <MarketingIcon id={card.icon} size={20} />
            </span>
            <h3 className="fmkt-problem__title">{card.title}</h3>
            <p className="fmkt-problem__copy">{card.copy}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

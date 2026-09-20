import { MarketingIcon } from "./marketing-icons";

interface ProblemCard {
  readonly copy: string;
  readonly icon: "calendar" | "check" | "sync";
  readonly title: string;
}

const cards: ProblemCard[] = [
  {
    copy: "Some use a form, some send a text, some just don't. You find out when someone doesn't turn up.",
    icon: "check",
    title: "Staff flag leave inconsistently",
  },
  {
    copy: "Approved leave gets entered twice, or not at all. The two drift, and payroll pays for it.",
    icon: "sync",
    title: "The calendar and Xero disagree",
  },
  {
    copy: "Availability lives in your head, a spreadsheet and three chat threads. Nobody can answer who is off next week quickly.",
    icon: "calendar",
    title: "No single view of who is in",
  },
];

export const ProblemSection = () => (
  <section className="fmkt-problem" id="why-teams-switch">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <p className="fmkt-overline">Why teams switch</p>
        <h2 className="fmkt-section-title">
          Don&rsquo;t find out someone&rsquo;s away when you need them.
        </h2>
        <p className="fmkt-problem__lead">
          Leave approved in a text message can still be missing from Xero and
          the team calendar. You end up chasing confirmations, finding cover at
          short notice and correcting payroll.
        </p>
        <p className="fmkt-problem__lead">
          Keep leave, travel and out of office plans where the whole team can
          see them.
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

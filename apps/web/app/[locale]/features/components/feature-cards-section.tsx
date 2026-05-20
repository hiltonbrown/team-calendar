import type { ReactNode } from "react";

const CheckIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={16}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2.5}
    viewBox="0 0 24 24"
    width={16}
  >
    <path d="M4 12l5 5L20 6" />
  </svg>
);

const LeaveFormMock = () => (
  <div className="fmkt-mock-form">
    <div className="fmkt-mock-form__header">New leave request</div>
    <div className="fmkt-mock-form__rows">
      {[
        { label: "Type", value: "Annual leave" },
        { label: "Date range", value: "Mon 12 to Fri 16 May" },
        { label: "Days", value: "5 days" },
        { label: "Reason (optional)", value: "Family trip" },
      ].map((row) => (
        <div className="fmkt-mock-form__row" key={row.label}>
          <span className="fmkt-mock-form__label">{row.label}</span>
          <span className="fmkt-mock-form__value">{row.value}</span>
        </div>
      ))}
    </div>
    <div className="fmkt-mock-form__saved">
      <span className="fmkt-mock-form__saved-icon">
        <CheckIcon />
      </span>
      <div>
        <span className="fmkt-mock-form__saved-title">Saved</span>
        <span className="fmkt-mock-form__saved-sub">Leave request created</span>
      </div>
    </div>
  </div>
);

const days = ["Mon 11", "Tue 12", "Wed 13", "Thu 14", "Fri 15"];

interface CalRow {
  barClass: string;
  label: string;
  span: [number, number];
  tone: string;
}

const calRows: CalRow[] = [
  {
    tone: "sage",
    label: "S",
    barClass: "fmkt-mock-cal__bar--leave",
    span: [0, 5],
  },
  {
    tone: "mauve",
    label: "A",
    barClass: "fmkt-mock-cal__bar--wfh",
    span: [2, 5],
  },
  {
    tone: "cream",
    label: "J",
    barClass: "fmkt-mock-cal__bar--sick",
    span: [0, 2],
  },
  {
    tone: "ink",
    label: "R",
    barClass: "fmkt-mock-cal__bar--training",
    span: [3, 4],
  },
];

const TeamCalendarMock = () => (
  <div className="fmkt-mock-cal">
    <div className="fmkt-mock-cal__header">
      <span className="fmkt-mock-cal__corner">Team calendar</span>
      <div className="fmkt-mock-cal__days">
        {days.map((d) => (
          <span className="fmkt-mock-cal__day" key={d}>
            {d}
          </span>
        ))}
      </div>
    </div>
    {calRows.map((row) => (
      <div className="fmkt-mock-cal__row" key={row.label}>
        <span
          className={`fmkt-mock-cal__avatar fmkt-mock-cal__avatar--${row.tone}`}
        >
          {row.label}
        </span>
        <div className="fmkt-mock-cal__grid">
          {days.map((day, i) => {
            const inSpan = i >= row.span[0] && i < row.span[1];
            return (
              <div
                className={`fmkt-mock-cal__cell ${inSpan ? `${row.barClass} fmkt-mock-cal__cell--filled` : ""}`}
                key={day}
              />
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

const PayrollSyncMock = () => (
  <div className="fmkt-mock-payroll">
    <div className="fmkt-mock-payroll__header">
      <span className="fmkt-mock-payroll__check-icon">
        <CheckIcon />
      </span>
      Payroll sync
    </div>
    <div className="fmkt-mock-payroll__status">
      <span aria-hidden="true" className="fmkt-mock-payroll__status-dot" />
      Synced to Xero
    </div>
    <div className="fmkt-mock-payroll__rows">
      {[
        { label: "Pay run", value: "Weekly" },
        { label: "Total leave", value: "8 days" },
        { label: "Last synced", value: "Today, 9:15 am" },
      ].map((row) => (
        <div className="fmkt-mock-payroll__row" key={row.label}>
          <span className="fmkt-mock-payroll__row-label">{row.label}</span>
          <span className="fmkt-mock-payroll__row-value">{row.value}</span>
        </div>
      ))}
    </div>
  </div>
);

interface FeatureCard {
  readonly copy: string;
  readonly mock: ReactNode;
  readonly number: number;
  readonly title: string;
}

const cards: FeatureCard[] = [
  {
    number: 1,
    title: "Request leave without chasing forms",
    copy: "Employees add dates, leave type and notes in one place, with fewer follow-up questions.",
    mock: <LeaveFormMock />,
  },
  {
    number: 2,
    title: "Make availability visible",
    copy: "Approved leave, WFH and training appear in team calendars, so managers can plan cover before clashes happen.",
    mock: <TeamCalendarMock />,
  },
  {
    number: 3,
    title: "Keep Xero aligned",
    copy: "Approved requests write back to Xero Payroll, reducing duplicate entry and reconciliation.",
    mock: <PayrollSyncMock />,
  },
];

export const FeatureCardsSection = () => (
  <section className="fmkt-cards-section">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <p className="fmkt-overline">Leave. Calendars. Payroll.</p>
        <h2 className="fmkt-section-title">
          One simple flow from request to calendar.
        </h2>
        <p className="fmkt-cards-section__lead">
          Sage means the record came from Xero. Purple means someone added it
          manually. The split is scannable at a glance, on every calendar.
        </p>
      </div>
      <div className="fmkt-card-grid">
        {cards.map((card) => (
          <article className="fmkt-card" key={card.number}>
            <div aria-hidden="true" className="fmkt-card__mock">
              {card.mock}
            </div>
            <div className="fmkt-card__body">
              <span aria-hidden="true" className="fmkt-card__number">
                {card.number}
              </span>
              <h3 className="fmkt-card__title">{card.title}</h3>
              <p className="fmkt-card__copy">{card.copy}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

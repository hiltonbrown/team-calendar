import type { ReactNode } from "react";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

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

// Beat 1 (in): the request goes in once, in one place.
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

// Beat 2 (through): approval writes back to Xero. Sage = the Xero-synced
// provenance the rest of the page teaches.
const WriteBackReceiptMock = () => (
  <div className="fmkt-mock-receipt">
    <div className="fmkt-mock-receipt__head">
      <span className="fmkt-mock-receipt__badge">
        <MarketingIcon id="sync" size={14} />
      </span>
      <div>
        <span className="fmkt-mock-receipt__title">Written back to Xero</span>
        <span className="fmkt-mock-receipt__sub">
          Leave application · approved
        </span>
      </div>
    </div>
    <div className="fmkt-mock-receipt__rows">
      {[
        { label: "Employee", value: "Sam Aboud" },
        { label: "Leave type", value: "Annual leave" },
        { label: "Dates", value: "Mon 12 to Fri 16 May" },
        { label: "Units", value: "5 days" },
      ].map((row) => (
        <div className="fmkt-mock-receipt__row" key={row.label}>
          <span className="fmkt-mock-receipt__label">{row.label}</span>
          <span className="fmkt-mock-receipt__value">{row.value}</span>
        </div>
      ))}
    </div>
    <div className="fmkt-mock-receipt__foot">
      <span aria-hidden="true" className="fmkt-mock-receipt__foot-dot" />
      Updated in Xero · today, 9:15 am
    </div>
  </div>
);

// Beat 3 (out): the same record appears in the calendar app, subscribed once.
const FeedSubscriptionMock = () => (
  <div className="fmkt-mock-sub">
    <div className="fmkt-mock-sub__head">
      <span className="fmkt-mock-sub__app">
        <MarketingIcon id="calendar" size={14} />
      </span>
      <span className="fmkt-mock-sub__name">Team availability</span>
      <span className="fmkt-mock-sub__check">
        <MarketingIcon id="check" size={12} />
      </span>
    </div>
    <div className="fmkt-mock-sub__events">
      <div className="fmkt-mock-sub__event fmkt-mock-sub__event--sage">
        <MarketingIcon id="leaf" size={11} />
        James · Annual leave
      </div>
      <div className="fmkt-mock-sub__event fmkt-mock-sub__event--purple">
        <MarketingIcon id="home" size={11} />
        Sarah · Working from home
      </div>
    </div>
    <div className="fmkt-mock-sub__foot">
      <MarketingIcon id="sync" size={11} />
      Subscribed · updates automatically
    </div>
  </div>
);

interface FeatureCard {
  readonly copy: string;
  readonly mock: ReactNode;
  readonly title: string;
}

const cards: FeatureCard[] = [
  {
    title: "Request leave without chasing forms",
    copy: "Employees add dates, leave type and notes in one place, with fewer follow-up questions.",
    mock: <LeaveFormMock />,
  },
  {
    title: "Approved leave writes back to Xero",
    copy: "Each approval syncs to Xero Payroll as a leave application, so records stay correct without re-keying.",
    mock: <WriteBackReceiptMock />,
  },
  {
    title: "It shows up in everyone's calendar",
    copy: "The same approved leave and manual entries publish to one secure feed your team subscribes to once.",
    mock: <FeedSubscriptionMock />,
  },
];

export const FeatureCardsSection = () => (
  <section className="fmkt-cards-section">
    <div className="fmkt-container">
      <div className="fmkt-section-header">
        <h2 className="fmkt-section-title">
          From a leave request to <em>everyone&rsquo;s calendar.</em>
        </h2>
        <p className="fmkt-cards-section__lead">
          Employees submit once. Approved leave writes back to Xero Payroll,
          then publishes to the calendars your team already opens. No re-keying,
          no separate planner to maintain.
        </p>
      </div>
      <div className="fmkt-card-grid">
        {cards.map((card) => (
          <article className="fmkt-card" key={card.title}>
            <div aria-hidden="true" className="fmkt-card__mock">
              {card.mock}
            </div>
            <div className="fmkt-card__body">
              <h3 className="fmkt-card__title">{card.title}</h3>
              <p className="fmkt-card__copy">{card.copy}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

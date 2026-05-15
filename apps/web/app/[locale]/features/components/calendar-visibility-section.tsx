import Image from "next/image";

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

const calChecklist = [
  "Real-time calendar updates",
  "Fewer clashes and surprises",
  "One source of truth for availability",
];

const days = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16"];

interface BigCalRow {
  barClass: string;
  initial: string;
  label: string;
  span: [number, number];
  tone: string;
}

const bigCalRows: BigCalRow[] = [
  {
    tone: "sage",
    initial: "S",
    label: "Annual leave",
    barClass: "fmkt-bigcal__bar--leave",
    span: [0, 5],
  },
  {
    tone: "mauve",
    initial: "A",
    label: "Working from home",
    barClass: "fmkt-bigcal__bar--wfh",
    span: [2, 5],
  },
  {
    tone: "cream",
    initial: "J",
    label: "Sick leave",
    barClass: "fmkt-bigcal__bar--sick",
    span: [0, 2],
  },
  {
    tone: "ink",
    initial: "R",
    label: "Training",
    barClass: "fmkt-bigcal__bar--training",
    span: [3, 4],
  },
  {
    tone: "sky",
    initial: "M",
    label: "Public holiday",
    barClass: "fmkt-bigcal__bar--holiday",
    span: [0, 1],
  },
];

const OutlookBadge = () => (
  <span className="fmkt-bigcal__badge fmkt-bigcal__badge--outlook">
    <svg
      aria-hidden="true"
      fill="none"
      height={14}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={14}
    >
      <rect height="16" rx="3" width="18" x="3" y="4" />
      <path d="M3 9h18" />
    </svg>
    Synced to Outlook
  </span>
);

const GoogleBadge = () => (
  <span className="fmkt-bigcal__badge fmkt-bigcal__badge--google">
    <svg
      aria-hidden="true"
      fill="none"
      height={14}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={14}
    >
      <rect height="16" rx="3" width="18" x="3" y="4" />
      <path d="M3 9h18M8 4v2M16 4v2" />
    </svg>
    Synced to Google Calendar
  </span>
);

const BigCalendarMock = () => (
  <div className="fmkt-bigcal">
    <div className="fmkt-bigcal__header">
      <span className="fmkt-bigcal__month">May 2025</span>
      <div className="fmkt-bigcal__days">
        {days.map((d) => (
          <span className="fmkt-bigcal__day" key={d}>
            {d}
          </span>
        ))}
      </div>
    </div>
    <div className="fmkt-bigcal__rows">
      {bigCalRows.map((row) => (
        <div className="fmkt-bigcal__row" key={row.initial}>
          <span
            className={`fmkt-bigcal__avatar fmkt-bigcal__avatar--${row.tone}`}
          >
            {row.initial}
          </span>
          <div className="fmkt-bigcal__grid">
            {days.map((day, i) => {
              const inSpan = i >= row.span[0] && i < row.span[1];
              const isFirst = i === row.span[0];
              return (
                <div
                  className={`fmkt-bigcal__cell ${inSpan ? `${row.barClass} fmkt-bigcal__cell--filled` : ""} ${isFirst && inSpan ? "fmkt-bigcal__cell--start" : ""}`}
                  key={day}
                >
                  {isFirst && inSpan && (
                    <span className="fmkt-bigcal__event-label">
                      {row.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    <div className="fmkt-bigcal__footer">
      <OutlookBadge />
      <GoogleBadge />
    </div>
  </div>
);

export const CalendarVisibilitySection = () => (
  <section className="fmkt-calvis">
    <div className="fmkt-container">
      <div className="fmkt-calvis__inner">
        <div aria-hidden="true" className="fmkt-calvis__image">
          <Image
            alt=""
            className="fmkt-calvis__photo"
            height={520}
            src="/marketing/week-planning.png"
            width={380}
          />
        </div>
        <div className="fmkt-calvis__copy">
          <p className="fmkt-overline">Visible where your team works</p>
          <h2 className="fmkt-section-title">
            Leave and availability in the calendars you already use
          </h2>
          <p className="fmkt-calvis__body">
            Once approved, leave shows up in Outlook and Google Calendar, so
            everyone knows who&rsquo;s away, when.
          </p>
          <ul aria-label="Key benefits" className="fmkt-calvis__checklist">
            {calChecklist.map((item) => (
              <li className="fmkt-calvis__check-item" key={item}>
                <span aria-hidden="true" className="fmkt-calvis__check-icon">
                  <CheckIcon />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <section aria-label="Team calendar showing synced availability">
          <BigCalendarMock />
        </section>
      </div>
    </div>
  </section>
);

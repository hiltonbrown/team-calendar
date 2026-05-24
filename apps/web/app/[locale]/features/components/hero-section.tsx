import Link from "next/link";
import { Fragment } from "react";
import { env } from "@/env";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const calendarRows = [
  {
    who: "Sam",
    span: [0, 5] as [number, number],
    bg: "#CAE8BC",
    fg: "#336A3B",
  },
  {
    who: "Jess",
    span: [2, 5] as [number, number],
    bg: "#E5DFFF",
    fg: "#5E4F99",
  },
  {
    who: "Kiri",
    span: [0, 2] as [number, number],
    bg: "#FFDAD6",
    fg: "#BA1A1A",
  },
  {
    who: "Lara",
    span: [3, 4] as [number, number],
    bg: "#E5DFFF",
    fg: "#5E4F99",
  },
];

const HeroVisual = () => (
  <div aria-hidden="true" className="fmkt-hero__visual">
    {/* Sage radial glow */}
    <div className="fmkt-hero__glow" />

    {/* Card 1: leave form, back left */}
    <div className="fmkt-hero__card fmkt-hero__card--request">
      <div className="fmkt-hero__card-title">New leave request</div>
      {(
        [
          ["Type", "Annual leave"],
          ["Date range", "Mon 12 to Fri 16 May"],
          ["Days", "5 days"],
        ] as [string, string][]
      ).map(([k, v]) => (
        <div className="fmkt-hero__card-row" key={k}>
          <span className="fmkt-hero__card-label">{k}</span>
          <span className="fmkt-hero__card-value">{v}</span>
        </div>
      ))}
      <div className="fmkt-hero__status-banner">
        <span className="fmkt-hero__status-icon-wrapper">
          <MarketingIcon id="check" size={12} />
        </span>
        <div>
          <div className="fmkt-hero__status-text">Submitted to manager</div>
          <div className="fmkt-hero__status-subtext">
            Sam Aboud · today, 9:14 am
          </div>
        </div>
      </div>
    </div>

    {/* Card 2: team calendar, front right */}
    <div className="fmkt-hero__card fmkt-hero__card--calendar">
      <div className="fmkt-hero__calendar-header">
        <div>
          <div className="fmkt-hero__card-title">Team · Operations</div>
          <div className="fmkt-hero__calendar-title">Mon 12 to Fri 16 May</div>
        </div>
        <span className="fmkt-hero__badge">
          <MarketingIcon id="leaf" size={10} /> Xero
        </span>
      </div>
      {/* Week grid */}
      <div className="fmkt-hero__calendar-grid">
        {[
          { id: "name-col", label: "", align: "left" as const },
          { id: "mon", label: "M", align: "center" as const },
          { id: "tue", label: "T", align: "center" as const },
          { id: "wed", label: "W", align: "center" as const },
          { id: "thu", label: "T", align: "center" as const },
          { id: "fri", label: "F", align: "center" as const },
        ].map((col) => (
          <div
            className={`fmkt-hero__calendar-dayhead fmkt-hero__calendar-dayhead--${col.align}`}
            key={col.id}
          >
            {col.label}
          </div>
        ))}
        {calendarRows.map((row) => (
          <Fragment key={row.who}>
            <div className="fmkt-hero__calendar-row-name">{row.who}</div>
            <div className="fmkt-hero__calendar-bar-cell">
              <div
                className="fmkt-hero__calendar-bar"
                style={{
                  left: `${(row.span[0] / 5) * 100}%`,
                  width: `${((row.span[1] - row.span[0]) / 5) * 100}%`,
                  background: row.bg,
                  boxShadow: `inset 2px 0 0 ${row.fg}`,
                }}
              />
            </div>
          </Fragment>
        ))}
      </div>
    </div>

    {/* Card 3: calendar subscription chips, bottom left */}
    <div className="fmkt-hero__card fmkt-hero__card--subscriptions">
      <div className="fmkt-hero__subs-title">Published to</div>
      <div className="fmkt-hero__subs-list">
        {(
          [
            ["outlook", "Outlook"],
            ["gcal", "Google Calendar"],
            ["applecal", "Apple Calendar"],
          ] as [string, string][]
        ).map(([id, name]) => (
          <span className="fmkt-hero__sub-chip" key={id}>
            <MarketingIcon
              id={id as Parameters<typeof MarketingIcon>[0]["id"]}
              size={14}
            />
            {name}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-hero__copy-inner">
        <div className="fmkt-pill">Now in early access</div>
        <h1 className="fmkt-hero__title">
          Simple leave requests.
          <em>Clear calendars for everyone.</em>
        </h1>
        <p className="fmkt-hero__body">
          Sync your Outlook Calendar to Xero. Manage leave requests.
          Automatically publish availability to Outlook or Google Calendar.{" "}
        </p>
        <div className="fmkt-hero__actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Sign up
          </Link>
          <Link
            className="marketing-btn marketing-btn--outline"
            href="#how-it-works"
          >
            See how it works
          </Link>
        </div>
        <div className="fmkt-hero__stat-row">
          <div className="fmkt-hero__stat">
            <strong>A better Team calendar</strong>
            <span>AU, NZ and UK Xero Payroll</span>
          </div>
        </div>
      </div>
    </div>
    <HeroVisual />
  </section>
);

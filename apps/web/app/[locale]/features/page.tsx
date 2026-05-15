import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { env } from "@/env";
import { SnapshotSection } from "../(home)/components/snapshot-section";

export const metadata: Metadata = createMetadata({
  title: "LeaveSync — Features",
  description:
    "See team leave, travel, working from home, and availability in the calendars your organisation already uses.",
});

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const walkthroughHref = "/contact";

const iconPaths = {
  activity: <path d="M3 12h4l3-9 4 18 3-9h4" />,
  arrowUpRight: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  calendar: (
    <>
      <rect height="16" rx="3" width="18" x="3" y="5" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  copy: (
    <>
      <rect height="12" rx="2.5" width="12" x="9" y="9" />
      <path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m6 12 6 6 6-6" />
      <path d="M5 21h14" />
    </>
  ),
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4z" />,
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-9 7-16 16-16 0 9-7 16-16 16z" />
      <path d="M4 20l8-8" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66L11.5 7" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66L12.5 17" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  play: <path d="M7 5l13 7-13 7z" />,
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 4.5 3.5 8 8 9 4.5-1 8-4.5 8-9V6z" />,
  sync: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" />
      <path d="M4 20v-5h5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20V8" />
      <path d="m6 12 6-6 6 6" />
      <path d="M5 21h14" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.5 3.3-6 6.5-6s6 2.5 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 15c2.5 0 4.5 1.7 5 4" />
    </>
  ),
} as const;

type IconId = keyof typeof iconPaths;
type AvatarTone = "cream" | "ink" | "mauve" | "rose" | "sage" | "sky";

interface IconProps {
  readonly id: IconId;
  readonly size?: number;
  readonly stroke?: number;
}

interface AvatarProps {
  readonly initials: string;
  readonly size?: number;
  readonly tone?: AvatarTone;
}

interface FeatureBullet {
  readonly b: string;
  readonly t: string;
}

interface FeatureSection {
  readonly bullets: FeatureBullet[];
  readonly eyebrow: string;
  readonly flip?: boolean;
  readonly index: number;
  readonly mock: ReactNode;
  readonly summary: string;
  readonly title: string;
}

const outcomeProofs = [
  {
    body: "Approved leave imports from the payroll source of truth, so the first calendar starts with real records.",
    icon: "sync",
    title: "Start with Xero",
  },
  {
    body: "Leave, WFH, travel, training, and public holidays become one consistent availability model.",
    icon: "users",
    title: "Normalise availability",
  },
  {
    body: "Scoped feeds keep Outlook, Google, Apple, and iCal calendars current without extra admin.",
    icon: "calendar",
    title: "Publish to calendars",
  },
] as const satisfies ReadonlyArray<{
  readonly body: string;
  readonly icon: IconId;
  readonly title: string;
}>;

const adminConfidenceCards = [
  {
    body: "Sync status, feed usage, and exceptions stay visible to the people who maintain the system.",
    icon: "activity",
    title: "Operational health",
  },
  {
    body: "Leave and out-of-office reports give managers a clean answer before anyone exports to Excel.",
    icon: "download",
    title: "Readable reports",
  },
  {
    body: "Feed scopes and privacy modes control who sees names, types, or simple busy blocks.",
    icon: "shield",
    title: "Privacy by feed",
  },
] as const satisfies ReadonlyArray<{
  readonly body: string;
  readonly icon: IconId;
  readonly title: string;
}>;

const Icon = ({ id, size = 20, stroke = 1.75 }: IconProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={stroke}
    viewBox="0 0 24 24"
    width={size}
  >
    {iconPaths[id]}
  </svg>
);

const Avatar = ({ initials, size = 32, tone = "sage" }: AvatarProps) => (
  <span
    className={`feature-avatar feature-avatar--${tone}`}
    style={{
      fontSize: Math.round(size * 0.36),
      height: size,
      width: size,
    }}
  >
    {initials}
  </span>
);

const FeaturesPage = () => (
  <main className="features-prototype">
    <FeaturesHero />
    <OutcomeProofStrip />
    <SnapshotSection />
    {featureSections.map((section) => (
      <div key={section.eyebrow}>
        <div className="feat-divider-rule" />
        <FeatureBlock {...section} />
      </div>
    ))}
    <AdminConfidenceStrip />
    <div className="features-prototype__pre-cta" />
    <FeaturesCTA />
  </main>
);

const FeaturesHero = () => (
  <section className="features-hero">
    <div>
      <div className="features-hero__copy">
        <div className="feature-pill feature-pill--sage">
          <span className="feature-dot" />
          Xero to Outlook, Google, and Apple Calendar.
        </div>
        <h1>
          Team availability,
          <br />
          <span>already in the calendar.</span>
        </h1>
        <p>
          LeaveSync turns Xero-approved leave, travel, WFH, training, and public
          holidays into clear, privacy-aware calendar feeds. Your team keeps
          using the calendars already open on their screens.
        </p>
        <div className="features-hero__actions">
          <Link className="feature-btn feature-btn--primary" href={signUpHref}>
            START FREE TRIAL
          </Link>
          <Link
            className="feature-btn feature-btn--tertiary"
            href={walkthroughHref}
          >
            BOOK A WALKTHROUGH <Icon id="arrowUpRight" size={14} />
          </Link>
        </div>
        <ul className="features-hero__proof">
          <li>Recent leave imported from Xero</li>
          <li>Subscribe once</li>
          <li>Names, types, or busy-only feeds</li>
        </ul>
      </div>
    </div>
    <div className="features-hero__visual">
      <MockDashboard />
    </div>
  </section>
);

const OutcomeProofStrip = () => (
  <section aria-label="How LeaveSync works" className="features-flow">
    <div className="features-flow__intro">
      <p className="feat-eyebrow">How it works</p>
      <h2>From Xero to every team calendar.</h2>
      <p>
        LeaveSync sits between Xero and the calendars people already trust, so
        availability is visible without another reporting routine.
      </p>
    </div>
    <div className="features-flow__steps">
      {outcomeProofs.map((proof, index) => (
        <article className="features-flow-step" key={proof.title}>
          <div className="features-flow-step__top">
            <span className="features-flow-step__number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="features-proof__icon">
              <Icon id={proof.icon} size={18} />
            </span>
          </div>
          <h3>{proof.title}</h3>
          <p>{proof.body}</p>
        </article>
      ))}
    </div>
  </section>
);

const FeatureBlock = ({
  index,
  eyebrow,
  title,
  summary,
  bullets,
  mock,
  flip = false,
}: FeatureSection) => (
  <section className="feat-section" id={`s${index}`}>
    <div className={flip ? "feat-grid feat-grid--flip" : "feat-grid"}>
      <div className="feat-mock">{mock}</div>
      <div className="feat-copy">
        <div className="feat-eyebrow">
          <span className="num">{String(index).padStart(2, "0")}</span>
          <span className="feat-eyebrow__rule" />
          {eyebrow}
        </div>
        <h2 className="feat-title">{title}</h2>
        <p className="feat-summary">{summary}</p>
        <ul className="feat-bullets">
          {bullets.map((bullet) => (
            <li key={bullet.t}>
              <Icon id="check" size={18} />
              <span>
                <strong>{bullet.t}.</strong> {bullet.b}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

const AdminConfidenceStrip = () => (
  <section className="features-admin-strip">
    <div className="features-admin-strip__intro">
      <p className="feat-eyebrow">Admin confidence</p>
      <h2>The control layer stays calm.</h2>
      <p>
        The team gets simple calendar visibility. Admins still get the detail
        they need to keep sync, reporting, and privacy under control.
      </p>
    </div>
    <div className="features-admin-strip__grid">
      {adminConfidenceCards.map((card) => (
        <article className="features-admin-card" key={card.title}>
          <span>
            <Icon id={card.icon} size={18} />
          </span>
          <div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </div>
        </article>
      ))}
    </div>
  </section>
);

const MockDashboard = () => {
  const stats = [
    { k: "Out today", s: "of 24", v: "4" },
    { k: "On leave", s: "incl. you Fri", v: "2" },
    { k: "Awaiting you", s: "requests", v: "3" },
  ];
  const people = [
    {
      i: "HW",
      kind: "Annual leave",
      n: "Hana Watanabe",
      t: "sage",
      until: "until Fri",
    },
    { i: "ML", kind: "WFH", n: "Marcus Lee", t: "mauve", until: "today" },
    {
      i: "EB",
      kind: "Travelling",
      n: "Esi Boateng",
      t: "cream",
      until: "Mel → Syd",
    },
  ] as const;

  return (
    <div className="feature-mock-card feature-mock-card--low">
      <div className="feature-row-between feature-mock-header">
        <div>
          <div className="feature-label muted">Tuesday 21 April</div>
          <div className="feature-mock-title">Good morning, Priya.</div>
        </div>
        <span className="feature-pill feature-pill--primary">Manager view</span>
      </div>

      <div className="feature-stat-grid">
        {stats.map((stat) => (
          <div className="feature-stat-card" key={stat.k}>
            <div className="feature-label muted tiny">{stat.k}</div>
            <div className="feature-num feature-num--small">{stat.v}</div>
            <div className="feature-small-copy">{stat.s}</div>
          </div>
        ))}
      </div>

      <div className="feature-panel">
        <div className="feature-row-between feature-gap-bottom">
          <div className="feature-label muted">Out today</div>
          <span className="feature-pill feature-pill--outline feature-pill--tiny">
            4 PEOPLE
          </span>
        </div>
        <div className="feature-stack">
          {people.map((person) => (
            <div className="feature-row-between" key={person.n}>
              <div className="feature-row">
                <Avatar
                  initials={person.i}
                  size={28}
                  tone={person.t as AvatarTone}
                />
                <span className="feature-body-strong">{person.n}</span>
              </div>
              <div className="feature-row feature-row--tight">
                <span className="feature-pill feature-pill--sage feature-pill--tiny">
                  {person.kind}
                </span>
                <span className="feature-small-copy">{person.until}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="feature-onboarding">
        <div>
          <div className="feature-label">Onboarding</div>
          <div className="feature-onboarding__copy">
            Connect Xero to import the last 90 days of leave.
          </div>
        </div>
        <button className="feature-btn feature-btn--inverse" type="button">
          CONNECT
        </button>
      </div>
    </div>
  );
};

const _MockPlans = () => {
  const rows = [
    {
      d: "Mon 5 – Fri 9 May",
      d2: "5 days",
      s: "submitted",
      t: "Annual leave",
      tone: "primary",
    },
    { d: "Wed 14 May", d2: "1 day", s: "approved", t: "WFH", tone: "sage" },
    {
      d: "Mon 2 – Tue 3 Jun",
      d2: "2 days",
      s: "draft",
      t: "Training",
      tone: "outline",
    },
    {
      d: "Fri 12 Jun",
      d2: "1 day",
      s: "approved",
      t: "Travelling",
      tone: "sage",
    },
    {
      d: "Mon 14 Jul – Fri 25 Jul",
      d2: "10 days",
      s: "submitted",
      t: "Annual leave",
      tone: "primary",
    },
  ] as const;

  return (
    <div className="feature-window feature-scroll">
      <div className="feature-window__top">
        <div className="feature-row-between feature-window__bar">
          <div className="feature-row feature-row--tabs">
            <span className="feature-pill feature-pill--primary">
              My records
            </span>
            <span>Team records</span>
            <span>Archived</span>
          </div>
          <button className="feature-btn feature-btn--primary" type="button">
            <Icon id="plus" size={14} /> NEW PLAN
          </button>
        </div>
      </div>

      <div className="feature-filter-row">
        <span className="feature-pill feature-pill--outline">All types</span>
        <span className="feature-pill feature-pill--outline">
          <Icon id="filter" size={11} /> Status
        </span>
        <span className="feature-pill feature-pill--outline">2026</span>
        <span className="feature-pill feature-pill--sage">14 records</span>
      </div>

      <div className="feature-plan-list">
        {rows.map((row) => (
          <div className="feature-plan-row" key={`${row.d}-${row.t}`}>
            <div>
              <div className="feature-title-sm">{row.d}</div>
              <div className="feature-small-copy">{row.t}</div>
            </div>
            <div className="feature-small-copy">{row.d2}</div>
            <span
              className={`feature-pill feature-pill--${row.tone} feature-pill--tiny`}
            >
              {row.s}
            </span>
            <Icon id="chevronRight" size={16} stroke={1.5} />
          </div>
        ))}
      </div>
    </div>
  );
};

type CalendarTone = "primary" | "sage" | "slate";

const calendarToneBg: Record<CalendarTone, string> = {
  primary:
    "color-mix(in oklch, var(--feature-primary-container) 65%, transparent)",
  sage: "var(--feature-secondary-container)",
  slate: "var(--feature-surface-highest)",
};

const calendarToneFg: Record<CalendarTone, string> = {
  primary: "var(--feature-on-primary-container)",
  sage: "var(--feature-on-secondary-container)",
  slate: "var(--feature-on-surface)",
};

const MockCalendar = () => {
  const days = ["Mon 20", "Tue 21", "Wed 22", "Thu 23", "Fri 24"] as const;
  const people = [
    {
      cells: [{ label: "Annual leave", l: 5, s: 0, tone: "primary" }],
      i: "PM",
      n: "Priya M.",
      t: "mauve",
    },
    {
      cells: [{ label: "Annual leave", l: 5, s: 0, tone: "primary" }],
      i: "HW",
      n: "Hana W.",
      t: "sage",
    },
    {
      cells: [
        { label: "WFH", l: 1, s: 1, tone: "sage" },
        { label: "WFH", l: 1, s: 3, tone: "sage" },
      ],
      i: "ML",
      n: "Marcus L.",
      t: "mauve",
    },
    {
      cells: [{ label: "Travelling", l: 2, s: 0, tone: "slate" }],
      i: "EB",
      n: "Esi B.",
      t: "cream",
    },
    {
      cells: [{ label: "Training", l: 2, s: 2, tone: "sage" }],
      i: "TK",
      n: "Tom K.",
      t: "sky",
    },
    { cells: [], i: "RS", n: "Ravi S.", t: "rose" },
  ] as const;

  return (
    <div className="feature-window feature-calendar feature-scroll">
      <div className="feature-calendar__toolbar">
        <div className="feature-row feature-row--tight">
          <span className="feature-pill feature-pill--slate">Day</span>
          <span className="feature-pill feature-pill--primary">Week</span>
          <span className="feature-pill feature-pill--slate">Month</span>
        </div>
        <div className="feature-row">
          <span className="feature-title-md">20 – 24 April</span>
          <Icon id="chevronRight" size={16} />
        </div>
        <div className="feature-row feature-row--tight">
          <span className="feature-pill feature-pill--outline">
            Harbour Lane Group
          </span>
          <span className="feature-pill feature-pill--outline">All types</span>
        </div>
      </div>

      <div className="feature-calendar__grid">
        <div className="feature-calendar__head">
          <div>Person</div>
          {days.map((day) => (
            <div className={day === "Tue 21" ? "is-active" : ""} key={day}>
              {day}
            </div>
          ))}
        </div>
        {people.map((person) => (
          <div className="feature-calendar__row" key={person.n}>
            <div className="feature-calendar__person">
              <Avatar
                initials={person.i}
                size={24}
                tone={person.t as AvatarTone}
              />
              <span>{person.n}</span>
            </div>
            {days.map((day) => (
              <div
                className="feature-calendar__cell"
                key={`${person.n}-${day}`}
              />
            ))}
            {person.cells.map((cell) => (
              <div
                className="feature-calendar__event"
                key={`${person.n}-${cell.label}-${cell.s}`}
                style={{
                  background: calendarToneBg[cell.tone as CalendarTone],
                  color: calendarToneFg[cell.tone as CalendarTone],
                  left: `calc(160px + ${cell.s} * (100% - 160px) / 5)`,
                  width: `calc(${cell.l} * (100% - 160px) / 5 - 6px)`,
                }}
              >
                {cell.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const _MockNotifications = () => {
  const items = [
    {
      d: "Mon 5 – Fri 9 May. Awaiting your approval.",
      i: "leaf",
      t: "Hana Watanabe submitted annual leave",
      tone: "primary",
      unread: true,
      when: "2m",
    },
    {
      d: "Wed 14 May. Synced to calendars.",
      i: "check",
      t: "Marcus Lee approved your WFH",
      tone: "sage",
      unread: true,
      when: "1h",
    },
    {
      d: "14 records imported from the last run.",
      i: "sync",
      t: "Xero sync completed",
      tone: "slate",
      unread: false,
      when: "3h",
    },
    {
      d: "Mon 9 Jun. Auto-published to all feeds.",
      i: "bell",
      t: "Public holiday added — Kings Birthday",
      tone: "slate",
      unread: false,
      when: "1d",
    },
  ] as const;

  return (
    <div className="feature-window">
      <div className="feature-notifications__top">
        <div className="feature-row">
          <span className="feature-title-md">Notifications</span>
          <span className="feature-pill feature-pill--primary feature-pill--tiny">
            2 UNREAD
          </span>
        </div>
        <div className="feature-row feature-row--tight">
          <span className="feature-pill feature-pill--primary">Feed</span>
          <span className="feature-pill feature-pill--outline">
            Preferences
          </span>
        </div>
      </div>
      <div className="feature-notification-list">
        {items.map((item) => (
          <div className="feature-notification-row" key={item.t}>
            <span
              className={`feature-icon-disc feature-icon-disc--${item.tone}`}
            >
              <Icon id={item.i as IconId} size={16} />
            </span>
            <div>
              <div className="feature-title-sm feature-notification-title">
                {item.t}
                {item.unread && <span className="feature-unread-dot" />}
              </div>
              <div className="feature-small-copy">{item.d}</div>
            </div>
            <span className="feature-label muted">{item.when}</span>
          </div>
        ))}
      </div>
      <div className="feature-window__footer">
        <span>Mark all as read</span>
        <span>Settings →</span>
      </div>
    </div>
  );
};

const MockPeople = () => {
  const team = [
    {
      i: "HW",
      live: "Annual leave",
      loc: "Melbourne",
      n: "Hana Watanabe",
      role: "Head of People",
      t: "sage",
      tone: "primary",
      x: "linked",
    },
    {
      i: "ML",
      live: "WFH",
      loc: "Sydney",
      n: "Marcus Lee",
      role: "Senior Engineer",
      t: "mauve",
      tone: "sage",
      x: "linked",
    },
    {
      i: "EB",
      live: "Travelling",
      loc: "Melbourne",
      n: "Esi Boateng",
      role: "Operations Lead",
      t: "cream",
      tone: "slate",
      x: "linked",
    },
    {
      i: "TK",
      live: "In office",
      loc: "Auckland",
      n: "Tom Karangi",
      role: "Account Manager",
      t: "sky",
      tone: "outline",
      x: "pending",
    },
    {
      i: "RS",
      live: "In office",
      loc: "Sydney",
      n: "Ravi Sharma",
      role: "Product Designer",
      t: "rose",
      tone: "outline",
      x: "linked",
    },
  ] as const;

  return (
    <div className="feature-window feature-scroll">
      <div className="feature-people__top">
        <div className="feature-row feature-row--wrap">
          <div className="feature-search">
            <Icon id="search" size={14} />
            <span>Search 24 people</span>
          </div>
          <span className="feature-pill feature-pill--outline">
            Engineering
          </span>
          <span className="feature-pill feature-pill--outline">
            All locations
          </span>
        </div>
        <span className="feature-label muted">Page 1 / 3</span>
      </div>
      <div className="feature-people-table">
        <div className="feature-people-head">
          <span>Person</span>
          <span>Role</span>
          <span>Location</span>
          <span>Today</span>
          <span>Xero</span>
        </div>
        {team.map((person) => (
          <div className="feature-people-row" key={person.n}>
            <div className="feature-row">
              <Avatar
                initials={person.i}
                size={32}
                tone={person.t as AvatarTone}
              />
              <span className="feature-title-sm">{person.n}</span>
            </div>
            <span className="feature-small-copy">{person.role}</span>
            <span className="feature-row feature-row--tight feature-small-copy">
              <Icon id="mapPin" size={12} /> {person.loc}
            </span>
            <span
              className={`feature-pill feature-pill--${person.tone} feature-pill--tiny`}
            >
              {person.live}
            </span>
            <span
              className={
                person.x === "linked"
                  ? "feature-xero-state is-linked"
                  : "feature-xero-state"
              }
            >
              <span />
              {person.x}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MockFeeds = () => {
  const feeds = [
    {
      name: "Whole org",
      privacy: "Names + types",
      scope: "All teams",
      status: "active",
      subs: 184,
    },
    {
      name: "Engineering",
      privacy: "Names + types",
      scope: "12 people",
      status: "active",
      subs: 47,
    },
    {
      name: "Engineering (busy)",
      privacy: "Busy only",
      scope: "12 people",
      status: "active",
      subs: 16,
    },
    {
      name: "Auckland office",
      privacy: "Names + types",
      scope: "Location",
      status: "paused",
      subs: 8,
    },
  ] as const;

  return (
    <div className="feature-mock-card feature-scroll">
      <div className="feature-row-between feature-mock-header">
        <div>
          <div className="feature-label muted">Calendar feeds</div>
          <div className="feature-mock-title">4 feeds, 255 subscribers</div>
        </div>
        <button className="feature-btn feature-btn--primary" type="button">
          <Icon id="plus" size={14} /> NEW FEED
        </button>
      </div>

      <div className="feature-feed-list">
        {feeds.map((feed) => (
          <div className="feature-feed-row" key={feed.name}>
            <div className="feature-row">
              <span className="feature-icon-square">
                <Icon id="link" size={16} />
              </span>
              <div>
                <div className="feature-title-sm">{feed.name}</div>
                <div className="feature-small-copy">{feed.scope}</div>
              </div>
            </div>
            <span className="feature-pill feature-pill--slate feature-pill--tiny">
              {feed.privacy}
            </span>
            <span className="feature-small-copy">{feed.subs} subscribers</span>
            <span
              className={`feature-pill feature-pill--${
                feed.status === "active" ? "sage" : "outline"
              } feature-pill--tiny`}
            >
              <span className="feature-dot" /> {feed.status}
            </span>
            <Icon id="copy" size={16} stroke={1.5} />
          </div>
        ))}
      </div>

      <div className="feature-help-note">
        <Icon id="shield" size={16} />
        <span>
          Subscribe URLs are signed and rotatable. Revoke any feed without
          breaking the others.
        </span>
      </div>
    </div>
  );
};

const MockApprovals = () => {
  const stats = [
    { k: "Awaiting", v: 7 },
    { k: "Approved", v: 23 },
    { k: "Declined", v: 1 },
    { k: "Failed sync", v: 1 },
  ];
  const rows = [
    {
      d: "Annual leave · Mon 5 – Fri 9 May (5 days)",
      i: "HW",
      n: "Hana Watanabe",
      sub: "Submitted 12 min ago",
      t: "sage",
    },
    {
      d: "Annual leave · Mon 14 – Fri 25 Jul (10 days)",
      i: "TK",
      n: "Tom Karangi",
      sub: "Submitted 1 h ago, retry needed",
      t: "sky",
    },
    {
      d: "WFH · Wed 14 May (1 day)",
      i: "RS",
      n: "Ravi Sharma",
      sub: "Submitted yesterday",
      t: "rose",
    },
  ] as const;

  return (
    <div className="feature-window feature-scroll">
      <div className="feature-approval-stats">
        {stats.map((stat) => (
          <div className="feature-stat-card" key={stat.k}>
            <div className="feature-label muted tiny">{stat.k}</div>
            <div className="feature-row feature-row--tight">
              <span className="feature-num feature-num--compact">{stat.v}</span>
              <span className="feature-pill feature-pill--outline feature-pill--tiny">
                this week
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="feature-filter-row feature-filter-row--split">
        <div className="feature-row feature-row--tight">
          <span className="feature-pill feature-pill--primary">Awaiting</span>
          <span className="feature-pill feature-pill--outline">All</span>
          <span className="feature-pill feature-pill--outline">Failed</span>
        </div>
        <span className="feature-label muted">Newest first</span>
      </div>

      {rows.map((row) => (
        <div className="feature-approval-row" key={row.n}>
          <Avatar initials={row.i} size={40} tone={row.t as AvatarTone} />
          <div>
            <div className="feature-title-sm">{row.n}</div>
            <div className="feature-small-copy">{row.d}</div>
            <div
              className={`feature-label ${
                row.n === "Tom Karangi" ? "danger" : "muted"
              }`}
            >
              {row.sub}
            </div>
          </div>
          <div className="feature-row feature-row--tight">
            {row.n === "Tom Karangi" ? (
              <button
                className="feature-btn feature-btn--secondary"
                type="button"
              >
                <Icon id="refresh" size={14} /> RETRY
              </button>
            ) : (
              <button
                className="feature-btn feature-btn--tertiary"
                type="button"
              >
                MORE INFO
              </button>
            )}
            <button className="feature-btn feature-btn--primary" type="button">
              APPROVE
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const _MockHolidays = () => {
  const holidays = [
    {
      d: "Fri 25 Apr",
      loc: "AU · all",
      n: "Anzac Day",
      src: "imported",
      state: "active",
    },
    {
      d: "Mon 9 Jun",
      loc: "AU · all",
      n: "King's Birthday",
      src: "imported",
      state: "active",
    },
    {
      d: "Mon 6 Oct",
      loc: "AU · NSW",
      n: "Labour Day",
      src: "imported",
      state: "active",
    },
    {
      d: "Wed 24 Dec",
      loc: "All",
      n: "Office close (half)",
      src: "custom",
      state: "active",
    },
    {
      d: "Mon 27 Jan",
      loc: "AU · all",
      n: "Australia Day (obs)",
      src: "imported",
      state: "suppressed",
    },
  ] as const;

  return (
    <div className="feature-mock-card feature-scroll">
      <div className="feature-row-between feature-mock-header">
        <div>
          <div className="feature-label muted">Public holidays · 2026</div>
          <div className="feature-mock-title">14 holidays · AU + NZ</div>
        </div>
        <div className="feature-row feature-row--tight">
          <button className="feature-btn feature-btn--tertiary" type="button">
            <Icon id="upload" size={14} /> IMPORT
          </button>
          <button className="feature-btn feature-btn--primary" type="button">
            <Icon id="plus" size={14} /> CUSTOM
          </button>
        </div>
      </div>

      <div className="feature-holiday-head">
        <span>Date</span>
        <span>Holiday</span>
        <span>Location</span>
        <span>Source</span>
        <span>State</span>
      </div>
      <div className="feature-holiday-list">
        {holidays.map((holiday) => (
          <div
            className={
              holiday.state === "suppressed"
                ? "feature-holiday-row is-suppressed"
                : "feature-holiday-row"
            }
            key={`${holiday.d}-${holiday.n}`}
          >
            <span className="feature-title-sm">{holiday.d}</span>
            <span className="feature-body-strong">{holiday.n}</span>
            <span className="feature-small-copy">{holiday.loc}</span>
            <span
              className={`feature-pill feature-pill--${
                holiday.src === "imported" ? "slate" : "sage"
              } feature-pill--tiny`}
            >
              {holiday.src}
            </span>
            <span
              className={`feature-pill feature-pill--${
                holiday.state === "active" ? "primary" : "outline"
              } feature-pill--tiny`}
            >
              {holiday.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const _MockSync = () => {
  const tenants = [
    {
      last: "2 min ago",
      n: "Harbour Lane Group",
      runs: 142,
      status: "healthy",
    },
    {
      last: "6 min ago",
      n: "North Harbour Group",
      runs: 312,
      status: "healthy",
    },
    { last: "1 h ago", n: "Oakline Studio", runs: 88, status: "warning" },
    { last: "4 h ago", n: "Mildura & Co", runs: 17, status: "failed" },
  ] as const;
  const bars = [12, 18, 14, 22, 19, 24, 21, 28, 26, 30, 27, 32].map(
    (height, index) => ({ height, id: `bar-${index}` })
  );

  return (
    <div className="feature-sync-card feature-scroll">
      <div className="feature-row-between feature-mock-header">
        <div>
          <div className="feature-label feature-label--inverse-muted">
            Sync health · admin
          </div>
          <div className="feature-mock-title inverse">
            4 tenants · 1 needs attention
          </div>
        </div>
        <button className="feature-btn feature-btn--primary" type="button">
          <Icon id="play" size={14} /> RUN ALL
        </button>
      </div>

      <div className="feature-sync-chart">
        <div className="feature-row-between feature-gap-bottom">
          <span className="feature-label feature-label--inverse-muted">
            Runs, last 12 hours
          </span>
          <span className="feature-label feature-label--success">
            ↑ 14% vs yesterday
          </span>
        </div>
        <div className="feature-bars">
          {bars.map((bar) => (
            <div
              className={bar.id === "bar-11" ? "is-latest" : ""}
              key={bar.id}
              style={{ height: bar.height * 2 }}
            />
          ))}
        </div>
      </div>

      <div className="feature-stack feature-stack--tight">
        {tenants.map((tenant) => (
          <div className="feature-sync-row" key={tenant.n}>
            <div className="feature-row">
              <span className={`feature-status-dot is-${tenant.status}`} />
              <span className="feature-title-sm inverse">{tenant.n}</span>
            </div>
            <span>Last run {tenant.last}</span>
            <span>{tenant.runs} runs</span>
            <button className="feature-text-button" type="button">
              VIEW
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const _MockLeaveReports = () => {
  const months = [
    { label: "Jan", value: 22 },
    { label: "Feb", value: 18 },
    { label: "Mar", value: 26 },
    { label: "Apr", value: 31 },
    { label: "May", value: 28 },
    { label: "Jun", value: 24 },
    { label: "Jul", value: 38 },
    { label: "Aug", value: 41 },
    { label: "Sep", value: 29 },
  ];
  const stats = [
    { k: "Days taken", sub: "+12% YoY", v: "257" },
    { k: "Avg request", sub: "days", v: "3.2" },
    { k: "Outstanding", sub: "days accrued", v: "412" },
  ];
  const max = Math.max(...months.map((month) => month.value));

  return (
    <div className="feature-mock-card">
      <div className="feature-row-between feature-mock-header">
        <div>
          <div className="feature-label muted">Leave reports · YTD 2026</div>
          <div className="feature-mock-title">Approved leave, by month</div>
        </div>
        <button className="feature-btn feature-btn--tertiary" type="button">
          <Icon id="download" size={14} /> EXPORT CSV
        </button>
      </div>

      <div className="feature-stat-grid">
        {stats.map((stat) => (
          <div
            className="feature-stat-card feature-stat-card--lowest"
            key={stat.k}
          >
            <div className="feature-label muted tiny">{stat.k}</div>
            <div className="feature-num feature-num--small">{stat.v}</div>
            <div className="feature-small-copy">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="feature-report-chart">
        <div className="feature-row-between feature-gap-bottom">
          <span className="feature-label muted">Days, by month</span>
          <div className="feature-row feature-report-legend">
            <span className="feature-row feature-row--legend">
              <span className="is-annual" />
              Annual
            </span>
            <span className="feature-row feature-row--legend">
              <span className="is-other" />
              Other
            </span>
          </div>
        </div>
        <div className="feature-month-bars">
          {months.map((month) => (
            <div className="feature-month-bar" key={month.label}>
              <div style={{ height: `${(month.value / max) * 100}%` }}>
                <div className="is-other" />
                <div className="is-annual" />
              </div>
              <span>{month.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const _MockOOO = () => {
  const breakdown = [
    { c: "var(--feature-primary)", k: "WFH", v: 188 },
    { c: "var(--feature-secondary)", k: "Travelling", v: 64 },
    { c: "var(--feature-primary-container)", k: "Training", v: 28 },
    { c: "var(--feature-surface-highest)", k: "Client site", v: 21 },
  ];
  const total = breakdown.reduce((sum, item) => sum + item.v, 0);
  let accumulatedDash = 0;

  return (
    <div className="feature-mock-card feature-mock-card--lowest">
      <div className="feature-row-between feature-mock-header">
        <div>
          <div className="feature-label muted">Out of office · YTD 2026</div>
          <div className="feature-mock-title">301 approved records</div>
        </div>
        <button className="feature-btn feature-btn--tertiary" type="button">
          <Icon id="download" size={14} /> EXPORT
        </button>
      </div>

      <div className="feature-ooo-grid">
        <div className="feature-donut">
          <svg
            aria-hidden="true"
            focusable="false"
            height="220"
            style={{ transform: "rotate(-90deg)" }}
            viewBox="0 0 100 100"
            width="220"
          >
            {breakdown.map((item) => {
              const dash = (item.v / total) * 251.2;
              const offset = -accumulatedDash;
              accumulatedDash += dash;
              return (
                <circle
                  cx="50"
                  cy="50"
                  fill="none"
                  key={item.k}
                  r="40"
                  stroke={item.c}
                  strokeDasharray={`${dash} 251.2`}
                  strokeDashoffset={offset}
                  strokeWidth="14"
                />
              );
            })}
          </svg>
          <div>
            <div className="feature-num">{total}</div>
            <div className="feature-label muted tiny">total days</div>
          </div>
        </div>

        <div className="feature-stack">
          {breakdown.map((item) => (
            <div className="feature-breakdown-row" key={item.k}>
              <span style={{ background: item.c }} />
              <span className="feature-title-sm">{item.k}</span>
              <span className="feature-small-copy">
                {Math.round((item.v / total) * 100)}%
              </span>
              <span className="feature-title-sm">{item.v}d</span>
            </div>
          ))}
          <div className="feature-insight">
            WFH overtook in-office mid-March. Drill in to see who, where, when.
          </div>
        </div>
      </div>
    </div>
  );
};

const FeaturesCTA = () => (
  <section className="feat-section features-cta-section">
    <div className="features-cta">
      <Image
        alt=""
        className="features-cta__botanical"
        height={400}
        src="/marketing/botanical-vine.svg"
        width={400}
      />
      <div className="features-cta__copy">
        <div className="feature-label features-cta__label">
          Ready when the team is.
        </div>
        <h2>Start with your real team calendar.</h2>
        <p>
          Connect Xero, import recent approved leave, and publish availability
          to the calendars your organisation already opens every day.
        </p>
        <div className="features-cta__actions">
          <Link className="feature-btn feature-btn--primary" href={signUpHref}>
            START FREE TRIAL
          </Link>
          <Link
            className="feature-btn feature-btn--tertiary feature-btn--inverse-copy"
            href={walkthroughHref}
          >
            BOOK A WALKTHROUGH <Icon id="arrowUpRight" size={14} />
          </Link>
        </div>
      </div>
      <div className="features-cta__icons">
        {(
          [
            "home",
            "calendar",
            "users",
            "link",
            "bell",
            "sync",
            "leaf",
            "shield",
          ] as const
        ).map((icon) => (
          <span key={icon}>
            <Icon id={icon} size={20} />
          </span>
        ))}
      </div>
    </div>
  </section>
);

const featureSections: FeatureSection[] = [
  {
    bullets: [
      {
        b: "Leave, WFH, travel, training, public holidays, and office days appear together before the day starts.",
        t: "One readable week",
      },
      {
        b: "Managers can move from today to week or month planning without rebuilding the same view in a spreadsheet.",
        t: "Fast planning zoom",
      },
      {
        b: "People, teams, and locations stay visible enough for quick cover decisions.",
        t: "Context included",
      },
    ],
    eyebrow: "Calendar visibility",
    index: 1,
    mock: <MockCalendar />,
    title: "See the week without opening another system.",
    summary:
      "The core advantage is simple: the team calendar becomes a live availability picture, not a stale export or a second place to check.",
  },
  {
    bullets: [
      {
        b: "Recent approved leave imports from Xero so the first calendar starts with trusted data.",
        t: "Real data quickly",
      },
      {
        b: "Managers can review requests near the calendar impact instead of turning payroll into a follow-up task.",
        t: "Short approval loop",
      },
      {
        b: "Failed writes and sync exceptions are visible to the person who can fix them.",
        t: "Clear exceptions",
      },
    ],
    eyebrow: "Xero accuracy",
    flip: true,
    index: 2,
    mock: <MockApprovals />,
    title: "Keep payroll as the source of truth.",
    summary:
      "LeaveSync does not ask the team to maintain a parallel leave system. Xero remains the payroll record, while LeaveSync makes approved availability useful day to day.",
  },
  {
    bullets: [
      {
        b: "Outlook, Google, Apple, and other iCal calendars receive the same up-to-date availability.",
        t: "Subscribe once",
      },
      {
        b: "Whole organisation, team, and location feeds let each audience subscribe to the view they need.",
        t: "Useful scopes",
      },
      {
        b: "Publish names and types for trusted teams, or simple busy blocks where privacy matters more.",
        t: "Practical privacy",
      },
    ],
    eyebrow: "Calendar feeds",
    index: 3,
    mock: <MockFeeds />,
    title: "Publish the right view to the right people.",
    summary:
      "A single source can produce different subscriptions for the whole organisation, a team, a location, or a privacy-sensitive audience.",
  },
  {
    bullets: [
      {
        b: "Working from home, travelling, training, and client site days sit beside leave instead of living in side channels.",
        t: "Beyond leave",
      },
      {
        b: "Location and holiday context helps people plan cover across offices, regions, and mixed work patterns.",
        t: "Office reality",
      },
      {
        b: "Reports show the patterns behind the calendar without forcing managers to rebuild the story in Excel.",
        t: "Patterns included",
      },
    ],
    eyebrow: "Planning context",
    flip: true,
    index: 4,
    mock: <MockPeople />,
    title: "Plan for the work patterns leave does not explain.",
    summary:
      "Annual leave is only part of the operational picture. LeaveSync captures the everyday availability signals that decide whether a week runs smoothly.",
  },
];

export default FeaturesPage;

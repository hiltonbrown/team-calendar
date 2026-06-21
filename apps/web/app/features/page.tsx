import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { MarketingIcon } from "../(home)/components/marketing-icons";
import { FinalCtaSection } from "./components/final-cta-section";
import { InteractiveHeroSection } from "./components/interactive-hero";
import { ScrollReveal } from "./components/scroll-reveal";

export const metadata: Metadata = createMetadata({
  title: "Team Calendar: Features",
  description:
    "Every absence, every person on the calendar. Employees, contractors and directors enter leave or out-of-office once. Team Calendar publishes the combined view to Outlook, Google Calendar and Apple Calendar.",
});

// ---- Personas ----------------------------------------------------------------

interface Persona {
  readonly copy: string;
  readonly mod: string;
  readonly role: string;
  readonly source: {
    readonly label: string;
    readonly mod: string;
    readonly sub: string;
  };
  readonly title: string;
}

const personas: Persona[] = [
  {
    mod: "employee",
    role: "Employee · on payroll",
    title: "Annual, sick, parental, TOIL.",
    copy: "Your Xero Payroll people request leave once. Approvals route to their manager, balances stay accurate, and the approved dates ship straight to every calendar they share.",
    source: {
      mod: "sage",
      label: "Synced from Xero Payroll",
      sub: "Two-way · live",
    },
  },
  {
    mod: "contractor",
    role: "Contractor · off payroll",
    title: "Unavailable days, WFH, deep work.",
    copy: "Contractors don't need a Xero record. Add them as a non-payroll teammate and they can mark unavailable days, project work and out-of-office, visible to everyone they collaborate with.",
    source: {
      mod: "purple",
      label: "Added in Team Calendar",
      sub: "Manual entry",
    },
  },
  {
    mod: "director",
    role: "Director · off payroll",
    title: "Board days, travel, out of office.",
    copy: "Directors who draw fees rather than wages stay invisible to payroll-only tools. In Team Calendar they get the same calendar presence as the rest of the team, without showing up in pay runs.",
    source: {
      mod: "purple",
      label: "Added in Team Calendar",
      sub: "No payroll impact",
    },
  },
];

const FeaturesPersonas = () => (
  <section className="ft-section" id="coverage">
    <div className="fmkt-container">
      <p className="fmkt-overline">Built for everyone you work with</p>
      <h2>Three kinds of people. One availability view.</h2>
      <p className="ft-section__lead">
        Most leave tools only see the payroll list. Team Calendar covers the
        whole team, and keeps the source of each entry obvious. Sage came from
        Xero. Purple was added by hand.
      </p>
      <div className="ft-personas">
        {personas.map((p) => (
          <article className={`ft-persona ft-persona--${p.mod}`} key={p.mod}>
            <span className="ft-persona__role">{p.role}</span>
            <h3 className="ft-persona__title">{p.title}</h3>
            <p className="ft-persona__copy">{p.copy}</p>
            <div
              className={`ft-persona__source ft-persona__source--${p.source.mod}`}
            >
              <span className="ft-persona__source__dot" />
              {p.source.label}
              <span className="ft-persona__source__sub">{p.source.sub}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

// ---- Capabilities ------------------------------------------------------------

type CapIcon = "calendar" | "check" | "leaf" | "link" | "shield" | "sync";

interface Cap {
  readonly accent?: boolean;
  readonly copy: string;
  readonly icon: CapIcon;
  readonly title: string;
}

const caps: Cap[] = [
  {
    icon: "calendar",
    title: "One entry box for every kind of away",
    copy: "Annual leave, sick, parental, TOIL, WFH, training, jury duty, conferences, out-of-office. If it removes you from a team's plan, it belongs here.",
  },
  {
    icon: "sync",
    title: "Two-way sync with Xero Payroll",
    copy: "Approved payroll leave writes back to Xero in the right type. Anything already in Xero shows up in Team Calendar. You only key it once, whichever side you keyed it on.",
  },
  {
    icon: "link",
    title: "Outlook · Google · Apple",
    copy: "Each person and team gets a read-only calendar feed. Subscribe once in the app you already use; Team Calendar keeps it current.",
  },
  {
    icon: "leaf",
    title: "Covers off-payroll people",
    copy: "Contractors, directors, board members, advisors. Anyone whose availability affects the team can sit on the calendar, without showing up in pay runs.",
    accent: true,
  },
  {
    icon: "check",
    title: "Approvals in context",
    copy: "Managers see who else is away before they approve. No more rubber-stamping a fourth person off the same week.",
  },
  {
    icon: "shield",
    title: "Source-of-record, visible",
    copy: "Every entry is colour-coded by where it came from, synced from Xero or added manually, so you always know what's authoritative.",
  },
];

const FeaturesCaps = () => (
  <section className="ft-section">
    <div className="fmkt-container">
      <p className="fmkt-overline">Capabilities</p>
      <h2>The work the calendar tab can&apos;t do.</h2>
      <p className="ft-section__lead">
        Email threads, spreadsheets and Xero alone leave gaps. Team Calendar
        closes them with one place to enter, approve, sync and publish.
      </p>
      <div className="ft-caps">
        {caps.map((cap) => (
          <article
            className={cap.accent ? "ft-cap ft-cap--accent" : "ft-cap"}
            key={cap.title}
          >
            <div className="ft-cap__icon">
              <MarketingIcon id={cap.icon} size={20} />
            </div>
            <h3 className="ft-cap__title">{cap.title}</h3>
            <p className="ft-cap__copy">{cap.copy}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

// ---- Sync flow diagram -------------------------------------------------------

const FeaturesFlow = () => (
  <section className="ft-section">
    <div className="fmkt-container">
      <p className="fmkt-overline">Sync model</p>
      <h2>Xero is the source. Calendars are the destination.</h2>
      <p className="ft-section__lead">
        We don&apos;t ask you to replace Xero or re-do its leave types. We treat
        it as the system of record and add the people and detail it can&apos;t
        carry.
      </p>

      <div className="ft-flow">
        <div className="ft-flow__col">
          <span className="ft-flow__label">Inputs</span>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon">
              <MarketingIcon id="leaf" size={16} />
            </span>
            Xero Payroll leave
            <span className="ft-flow__chip__sub">two-way</span>
          </div>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon">
              <MarketingIcon id="calendar" size={16} />
            </span>
            Contractor entries
            <span className="ft-flow__chip__sub">manual</span>
          </div>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon">
              <MarketingIcon id="shield" size={16} />
            </span>
            Director time
            <span className="ft-flow__chip__sub">manual</span>
          </div>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon">
              <MarketingIcon id="check" size={16} />
            </span>
            Out of office &amp; WFH
            <span className="ft-flow__chip__sub">anyone</span>
          </div>
        </div>

        <div className="ft-flow__hub">
          <div className="ft-flow__hub__brand">
            <Image
              alt=""
              height={28}
              src="/marketing/brand-mark.svg"
              width={28}
            />
            <span>Team Calendar</span>
          </div>
          <p className="ft-flow__hub__body">
            One reconciled record per person per day. Approvals applied.
            Conflicts flagged. Source labelled.
          </p>
          <span className="ft-flow__hub__rule">
            <MarketingIcon id="sync" size={12} /> Updates within 60s
          </span>
        </div>

        <div className="ft-flow__col">
          <span className="ft-flow__label">Destinations</span>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon ft-flow__icon--accent">
              <MarketingIcon id="outlook" size={16} />
            </span>
            Outlook subscription
            <span className="ft-flow__chip__sub">.ics</span>
          </div>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon ft-flow__icon--accent">
              <MarketingIcon id="gcal" size={16} />
            </span>
            Google Calendar feed
            <span className="ft-flow__chip__sub">.ics</span>
          </div>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon ft-flow__icon--accent">
              <MarketingIcon id="applecal" size={16} />
            </span>
            Apple Calendar feed
            <span className="ft-flow__chip__sub">.ics</span>
          </div>
          <div className="ft-flow__chip">
            <span className="ft-input-card__icon ft-flow__icon--accent">
              <MarketingIcon id="arrowUpRight" size={16} />
            </span>
            In-app team view
            <span className="ft-flow__chip__sub">live</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ---- Coverage matrix ---------------------------------------------------------

type MarkKind = "mute" | "purple" | "sage";

const Mark = ({
  kind = "sage",
  label = "Yes",
}: {
  kind?: MarkKind;
  label?: string;
}) => (
  <span className={`ft-mark ft-mark--${kind}`}>
    <span className="ft-mark__dot">
      {kind === "mute" ? (
        <span
          style={{
            background: "currentColor",
            borderRadius: 2,
            display: "block",
            height: 2,
            width: 8,
          }}
        />
      ) : (
        <MarketingIcon id="check" size={12} />
      )}
    </span>
    {label}
  </span>
);

interface MatrixRow {
  readonly contractors: ReactNode;
  readonly directors: ReactNode;
  readonly employees: ReactNode;
  readonly label: string;
  readonly sub: string;
}

const matrixRows: MatrixRow[] = [
  {
    label: "Request leave & out-of-office",
    sub: "Annual, sick, WFH, board days, anything that removes you from the plan",
    employees: <Mark kind="sage" label="Yes" />,
    contractors: <Mark kind="purple" label="Yes" />,
    directors: <Mark kind="purple" label="Yes" />,
  },
  {
    label: "Auto-sync from Xero",
    sub: "Leave already keyed in Xero appears without re-entry",
    employees: <Mark kind="sage" label="Two-way" />,
    contractors: <Mark kind="mute" label="N/A" />,
    directors: <Mark kind="mute" label="N/A" />,
  },
  {
    label: "Manager approvals",
    sub: "Routed with team availability in view",
    employees: <Mark kind="sage" label="Required" />,
    contractors: <Mark kind="purple" label="Optional" />,
    directors: <Mark kind="mute" label="Self-managed" />,
  },
  {
    label: "Published to Outlook / Google / Apple",
    sub: "Live .ics feed per person and per team",
    employees: <Mark kind="sage" label="Yes" />,
    contractors: <Mark kind="sage" label="Yes" />,
    directors: <Mark kind="sage" label="Yes" />,
  },
  {
    label: "Counted in leave balances",
    sub: "Drawn from Xero Payroll where applicable",
    employees: <Mark kind="sage" label="Yes" />,
    contractors: <Mark kind="mute" label="No balance" />,
    directors: <Mark kind="mute" label="No balance" />,
  },
  {
    label: "Visible to the whole team",
    sub: "On the calendar everyone already uses",
    employees: <Mark kind="sage" label="Yes" />,
    contractors: <Mark kind="sage" label="Yes" />,
    directors: <Mark kind="sage" label="Yes" />,
  },
];

const FeaturesMatrix = () => (
  <section className="ft-section">
    <div className="fmkt-container">
      <p className="fmkt-overline">Coverage matrix</p>
      <h2>What each kind of teammate can do.</h2>
      <p className="ft-section__lead">
        The short version: everyone gets calendar presence. Only payroll people
        get balances and the Xero round-trip.
      </p>
      <div className="ft-matrix">
        <table className="ft-matrix__table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>
                Employees
                <br />
                <span className="ft-matrix__col-sub">On Xero Payroll</span>
              </th>
              <th>
                Contractors
                <br />
                <span className="ft-matrix__col-sub">Off payroll</span>
              </th>
              <th>
                Directors
                <br />
                <span className="ft-matrix__col-sub">Off payroll</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr key={row.label}>
                <td>
                  {row.label}
                  <span className="ft-matrix__row-sub">{row.sub}</span>
                </td>
                <td>{row.employees}</td>
                <td>{row.contractors}</td>
                <td>{row.directors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
);

// ---- FAQ --------------------------------------------------------------------

const faqs = [
  {
    q: "Do contractors and directors need a Xero record?",
    a: "No. They're added directly in Team Calendar and never appear in Xero or your pay runs. They only show up on the calendar.",
  },
  {
    q: "What happens to leave I've already keyed into Xero?",
    a: "It flows in on first connect. We don't ask you to re-enter it, and we don't change the leave types you've configured in Xero.",
  },
  {
    q: "Is the calendar feed read-only?",
    a: "Yes. Outlook, Google and Apple subscribe to a .ics feed per person or per team. Edits happen in Team Calendar; calendars refresh within a minute.",
  },
  {
    q: "Can I tell which entries came from where?",
    a: "Every entry carries its source. Sage means it came from Xero Payroll. Purple means it was added by hand in Team Calendar.",
  },
  {
    q: "Which regions of Xero Payroll are supported?",
    a: "Australia, New Zealand and the United Kingdom. We use Xero's official Payroll APIs for each.",
  },
  {
    q: "Does an out-of-office count against a leave balance?",
    a: "Only if you map it to a Xero leave type. Out-of-office, WFH and travel default to calendar-only.",
  },
] as const;

const FeaturesFAQ = () => (
  <section className="ft-section ft-section--tight">
    <div className="fmkt-container">
      <p className="fmkt-overline">Common questions</p>
      <h2>Short answers.</h2>
      <div className="ft-faq">
        {faqs.map((f) => (
          <div className="ft-faq__item" key={f.q}>
            <h3 className="ft-faq__q">{f.q}</h3>
            <p className="ft-faq__a">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ---- Page -------------------------------------------------------------------

const FeaturesPage = () => (
  <main className="fmkt-page">
    <div className="fmkt-container">
      <InteractiveHeroSection />
    </div>
    <ScrollReveal>
      <FeaturesPersonas />
    </ScrollReveal>
    <ScrollReveal delayMs={100}>
      <FeaturesCaps />
    </ScrollReveal>
    <ScrollReveal>
      <FeaturesFlow />
    </ScrollReveal>
    <ScrollReveal>
      <FeaturesMatrix />
    </ScrollReveal>
    <ScrollReveal>
      <FeaturesFAQ />
    </ScrollReveal>
    <FinalCtaSection />
  </main>
);

export default FeaturesPage;

import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../styles/home.css";
import "../styles/features.css";
import "../styles/motion.css";
import { MarketingIcon } from "../(home)/components/marketing-icons";
import { integrationCapabilities } from "../integrations/capabilities";
import { AnalyticsDemo } from "./components/analytics-demo";
import { FinalCtaSection } from "./components/final-cta-section";
import { InteractiveHeroSection } from "./components/interactive-hero";
import { LivingCalendarStory } from "./components/living-calendar-story";

export const metadata: Metadata = createMetadata({
  description:
    "Every absence, every person on the calendar. Employees, contractors and directors enter leave or out-of-office once. Team Calendar publishes the combined view to Outlook, Google Calendar and Apple Calendar.",
  title: "Team Calendar: Features",
});

// ---- Coverage matrix ---------------------------------------------------------

type MarkKind = "mute" | "neutral" | "purple" | "sage";

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
    contractors: <Mark kind="purple" label="Yes" />,
    directors: <Mark kind="purple" label="Yes" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "Request leave or share availability",
    sub: "Annual leave, sick leave, working from home and time away",
  },
  {
    contractors: <Mark kind="mute" label="N/A" />,
    directors: <Mark kind="mute" label="N/A" />,
    employees: <Mark kind="sage" label="Two-way" />,
    label: "Sync leave with Xero",
    sub: "Existing Xero leave appears without re-entry",
  },
  {
    contractors: <Mark kind="purple" label="Optional" />,
    directors: <Mark kind="mute" label="Self-managed" />,
    employees: <Mark kind="sage" label="Required" />,
    label: "Manager approvals",
    sub: "Review requests alongside team availability",
  },
  {
    contractors: <Mark kind="neutral" label="Yes" />,
    directors: <Mark kind="neutral" label="Yes" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "Subscribe in your calendar app",
    sub: "Read-only feeds for Outlook, Google Calendar and Apple Calendar",
  },
  {
    contractors: <Mark kind="mute" label="No balance" />,
    directors: <Mark kind="mute" label="No balance" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "View leave balances",
    sub: "Balances come from Xero Payroll",
  },
  {
    contractors: <Mark kind="neutral" label="Yes" />,
    directors: <Mark kind="neutral" label="Yes" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "Share team availability",
    sub: "See who is away and when",
  },
];

const FeaturesMatrix = () => (
  <section className="ft-section">
    <div className="fmkt-container">
      <h2 id="teammate-comparison-title">What each kind of teammate can do.</h2>
      <p className="ft-section__lead">
        Everyone can share availability. Xero sync and leave balances apply to
        employees on payroll.
      </p>
      <p className="ft-matrix__hint" id="teammate-comparison-hint">
        Scroll across to compare employees, contractors and directors.
      </p>
      <section
        aria-describedby="teammate-comparison-hint"
        aria-label="Coverage matrix, scroll for more columns"
        className="ft-matrix"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: labelled focusable scroll region per DESIGN.md's narrow-table pattern; tabIndex is required for keyboard users to reach the horizontal scroll
        tabIndex={0}
      >
        <table
          aria-labelledby="teammate-comparison-title"
          className="ft-matrix__table"
        >
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">
                Employees
                <br />
                <span className="ft-matrix__col-sub">On Xero Payroll</span>
              </th>
              <th scope="col">
                Contractors
                <br />
                <span className="ft-matrix__col-sub">Off payroll</span>
              </th>
              <th scope="col">
                Directors
                <br />
                <span className="ft-matrix__col-sub">Off payroll</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  <span className="ft-matrix__row-sub">{row.sub}</span>
                </th>
                <td>{row.employees}</td>
                <td>{row.contractors}</td>
                <td>{row.directors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  </section>
);

// ---- FAQ --------------------------------------------------------------------

const shippedRegionNames = integrationCapabilities.xeroPayrollRegions
  .filter((region) => region.status === "shipped")
  .map((region) => region.name);

const plannedRegionNames = integrationCapabilities.xeroPayrollRegions
  .filter((region) => region.status === "planned")
  .map((region) => region.name);

const faqs = [
  {
    a: "No. Add them directly in Team Calendar. Their availability appears on the calendar without adding them to Xero or a pay run.",
    q: "Do contractors and directors need a Xero record?",
  },
  {
    a: "It syncs when you first connect. You do not need to re-enter it, and your Xero leave types stay unchanged.",
    q: "What happens to leave I've already keyed into Xero?",
  },
  {
    a: "Yes. Edit entries in Team Calendar. Outlook, Google Calendar and Apple Calendar subscribe to read-only feeds. Calendar apps refresh on their own schedules.",
    q: "Is the calendar feed read-only?",
  },
  {
    a: "Yes. Select an entry to see its source. Sage entries come from Xero Payroll; purple entries are added in Team Calendar.",
    q: "Can I tell which entries came from where?",
  },
  {
    a: `Early access is available for Xero Payroll ${shippedRegionNames.join(" and ")}. ${plannedRegionNames.join(" and ")} support is planned for future releases.`,
    q: "Which regions of Xero Payroll are supported?",
  },
  {
    a: "No, unless you map the entry to a Xero leave type. Working from home, travel and other availability are calendar-only by default.",
    q: "Does working from home or travel reduce leave balances?",
  },
] as const;

const FeaturesFAQ = () => (
  <section className="ft-section ft-section--tight">
    <div className="fmkt-container">
      <h2 id="ics-feeds">Short answers.</h2>
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
  <main className="fmkt-page" id="main-content" tabIndex={-1}>
    <div className="fmkt-container">
      <InteractiveHeroSection />
    </div>
    <LivingCalendarStory />
    <FeaturesMatrix />
    <AnalyticsDemo />
    <FeaturesFAQ />
    <FinalCtaSection />
  </main>
);

export default FeaturesPage;

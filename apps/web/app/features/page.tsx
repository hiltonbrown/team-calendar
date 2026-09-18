import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../styles/home.css";
import "../styles/features.css";
import "../styles/motion.css";
import { MarketingIcon } from "../(home)/components/marketing-icons";
import { integrationCapabilities } from "../integrations/capabilities";
import { FinalCtaSection } from "./components/final-cta-section";
import { InteractiveHeroSection } from "./components/interactive-hero";
import { LivingCalendarStory } from "./components/living-calendar-story";
import { ScrollReveal } from "./components/scroll-reveal";

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
    label: "Request leave & out-of-office",
    sub: "Annual, sick, WFH, board days, anything that removes you from the plan",
  },
  {
    contractors: <Mark kind="mute" label="N/A" />,
    directors: <Mark kind="mute" label="N/A" />,
    employees: <Mark kind="sage" label="Two-way" />,
    label: "Auto-sync from Xero",
    sub: "Leave already keyed in Xero appears without re-entry",
  },
  {
    contractors: <Mark kind="purple" label="Optional" />,
    directors: <Mark kind="mute" label="Self-managed" />,
    employees: <Mark kind="sage" label="Required" />,
    label: "Manager approvals",
    sub: "Routed with team availability in view",
  },
  {
    contractors: <Mark kind="neutral" label="Yes" />,
    directors: <Mark kind="neutral" label="Yes" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "Published to Outlook / Google / Apple",
    sub: "Live .ics feed per person and per team",
  },
  {
    contractors: <Mark kind="mute" label="No balance" />,
    directors: <Mark kind="mute" label="No balance" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "Counted in leave balances",
    sub: "Drawn from Xero Payroll where applicable",
  },
  {
    contractors: <Mark kind="neutral" label="Yes" />,
    directors: <Mark kind="neutral" label="Yes" />,
    employees: <Mark kind="sage" label="Yes" />,
    label: "Visible to the whole team",
    sub: "On the calendar everyone already uses",
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
      <section
        aria-label="Coverage matrix, scroll for more columns"
        className="ft-matrix"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: labelled focusable scroll region per DESIGN.md's narrow-table pattern; tabIndex is required for keyboard users to reach the horizontal scroll
        tabIndex={0}
      >
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
    a: "No. They're added directly in Team Calendar and never appear in Xero or your pay runs. They only show up on the calendar.",
    q: "Do contractors and directors need a Xero record?",
  },
  {
    a: "It flows in on first connect. We don't ask you to re-enter it, and we don't change the leave types you've configured in Xero.",
    q: "What happens to leave I've already keyed into Xero?",
  },
  {
    a: "Yes. Outlook, Google and Apple subscribe to a read-only .ics feed per person or team. Edits happen in Team Calendar; each calendar app refreshes the subscription on its own schedule.",
    q: "Is the calendar feed read-only?",
  },
  {
    a: "Every entry carries its source. Sage means it came from Xero Payroll. Purple means it was added by hand in Team Calendar.",
    q: "Can I tell which entries came from where?",
  },
  {
    a: `${shippedRegionNames.join(" and ")} is supported at launch. ${plannedRegionNames.join(" and ")} support is planned for future releases.`,
    q: "Which regions of Xero Payroll are supported?",
  },
  {
    a: "Only if you map it to a Xero leave type. Out-of-office, WFH and travel default to calendar-only.",
    q: "Does an out-of-office count against a leave balance?",
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
    <LivingCalendarStory />
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

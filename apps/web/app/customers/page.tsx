import { createMetadata } from "@repo/seo/metadata";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./customers.module.css";

export const metadata: Metadata = createMetadata({
  alternates: { canonical: "/customers" },
  description:
    "Who Team Calendar fits: Australian Xero Payroll businesses in closed early access that manage leave and availability in shared calendars.",
  openGraph: { url: "/customers" },
  title: "Who it’s for",
});

const fitSignals = [
  {
    copy: "The initial guided cohort has 8–30 people, and leave admin is already taking more time than it should.",
    icon: UsersRound,
    title: "Team size and admin burden",
  },
  {
    copy: "Outlook, Google Calendar or Apple Calendar is where people already check who is away and when.",
    icon: CalendarDays,
    title: "Calendar-led planning",
  },
  {
    copy: "Payroll leave and non-payroll availability, such as working from home, training and client visits, need one useful view.",
    icon: CalendarRange,
    title: "Mixed payroll and non-payroll availability",
  },
];

const workflow = [
  {
    copy: "Approved leave remains anchored to your payroll source of truth.",
    title: "Xero Payroll",
  },
  {
    copy: "Leave and everyday availability become one consistent team view.",
    title: "Team Calendar",
  },
  {
    copy: "People subscribe from the calendars they already use to plan work.",
    title: "Outlook, Google Calendar and Apple Calendar",
  },
];

const CustomersPage = () => (
  <main
    className={["fmkt-page", styles.root].join(" ")}
    id="customers-main"
    tabIndex={-1}
  >
    <section className={styles.hero}>
      <div className={["fmkt-container", styles.heroInner].join(" ")}>
        <div className={styles.heroCopy}>
          <p className="fmkt-overline">Who it’s for</p>
          <h1 className={styles.title}>
            A clearer way to plan around everyone’s availability.
          </h1>
          <p className={styles.lead}>
            Built for Australian Xero Payroll businesses where leave admin and
            shared-calendar planning have started pulling apart.
          </p>
          <p className={styles.launchNote}>
            Australian closed early access, beginning with a guided cohort of
            8–30 people.
          </p>
          <div className={styles.actions}>
            <Link
              className="marketing-btn marketing-btn--primary"
              href="/contact"
            >
              Talk to us
            </Link>
            <Link
              className="marketing-btn marketing-btn--secondary"
              href="/integrations"
            >
              See how it works
            </Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <Building2 aria-hidden="true" size={28} strokeWidth={1.5} />
          <p>Likely a strong fit</p>
          <h2>One admin burden, three places to keep aligned.</h2>
          <span>
            Payroll records, everyday availability and the calendars your team
            actually checks.
          </span>
        </aside>
      </div>
    </section>

    <section aria-labelledby="fit-heading" className={styles.section}>
      <div className="fmkt-container">
        <div className={styles.sectionIntro}>
          <p className="fmkt-overline">The fit signals</p>
          <h2 className="fmkt-section-title" id="fit-heading">
            The problem is usually visible before the software decision is.
          </h2>
        </div>
        <ul className={styles.fitSurface}>
          {fitSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <li className={styles.fitRow} key={signal.title}>
                <Icon aria-hidden="true" size={24} strokeWidth={1.5} />
                <div>
                  <h3>{signal.title}</h3>
                  <p>{signal.copy}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>

    <section
      aria-labelledby="workflow-heading"
      className={[styles.section, styles.tonal].join(" ")}
    >
      <div className={["fmkt-container", styles.fitLayout].join(" ")}>
        <div className={styles.sectionIntro}>
          <p className="fmkt-overline">The working pattern</p>
          <h2 className="fmkt-section-title" id="workflow-heading">
            Payroll stays authoritative. Calendars become useful.
          </h2>
          <p>
            The goal is not another destination to monitor. It is one dependable
            path from approved leave to the planning tools your team already
            opens.
          </p>
        </div>
        <ol className={styles.workflowSurface}>
          {workflow.map((step, index) => (
            <li className={styles.workflow} key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    <section className={styles.section}>
      <div className="fmkt-container">
        <div className={styles.callout}>
          <div>
            <p className={["fmkt-overline", styles.calloutOverline].join(" ")}>
              A considered start
            </p>
            <h2 className="fmkt-section-title">
              The first cohort is focused. The product is not capped there.
            </h2>
            <p>
              We are starting with 8–30 people so early access can be genuinely
              guided. Larger teams and multi-entity businesses are welcome to
              talk with us about fit and timing.
            </p>
          </div>
          <Link
            className="marketing-btn marketing-btn--primary"
            href="/contact"
          >
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  </main>
);

export default CustomersPage;

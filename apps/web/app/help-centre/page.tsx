import { createMetadata } from "@repo/seo/metadata";
import {
  ArrowRight,
  BadgeCheck,
  CalendarSync,
  LifeBuoy,
  Link2,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  helpLastReviewed,
  helpLaunchScope,
  helpSupport,
  helpTasks,
} from "./content";
import styles from "./help-centre.module.css";

export const metadata: Metadata = createMetadata({
  description:
    "Task-led help for setting up Team Calendar with Australian Xero Payroll, verifying leave workflows and publishing secure calendar feeds.",
  title: "Help centre",
});

const taskIcons = [UsersRound, Link2, BadgeCheck, CalendarSync] as const;

const HelpCentrePage = () => (
  <main
    className={`fmkt-page ${styles.page}`}
    id="help-centre-main"
    tabIndex={-1}
  >
    <header className={styles.hero}>
      <div className={styles.readingColumn}>
        <p className={styles.scope}>{helpLaunchScope}</p>
        <h1>Set up, verify and recover with confidence.</h1>
        <p className={styles.lead}>
          Start with the task in front of you. Each phase names the person who
          can act, the exact control to use and the receipt that proves it
          worked.
        </p>
        <div className={styles.heroMeta}>
          <span>Customer help for launch</span>
          <span>Last reviewed {helpLastReviewed}</span>
        </div>
      </div>
    </header>

    <section aria-labelledby="recommended-heading" className={styles.section}>
      <div className={styles.layout}>
        <div className={styles.recommended}>
          <p className={styles.eyebrow}>Recommended setup</p>
          <h2 id="recommended-heading">Begin with the eight-step AU guide.</h2>
          <p>
            Move from invitation and roles through Xero connection, a test leave
            decision and a privacy-safe calendar subscription.
          </p>
          <Link
            className={`marketing-content-link ${styles.primaryLink}`}
            href="/help-centre/onboarding#prepare"
          >
            Start onboarding <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>

        <div className={styles.taskList}>
          {helpTasks.map((task, index) => {
            const Icon = taskIcons[index];

            return (
              <article className={styles.task} key={task.href}>
                <Icon
                  aria-hidden="true"
                  className={styles.taskIcon}
                  size={21}
                />
                <div>
                  <p className={styles.taskLabel}>{task.label}</p>
                  <h2>{task.title}</h2>
                  <p>{task.description}</p>
                </div>
                <Link
                  aria-label={`${task.label}: ${task.title}`}
                  className={`marketing-content-link ${styles.taskLink}`}
                  href={task.href}
                >
                  Open phase <ArrowRight aria-hidden="true" size={17} />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <section aria-labelledby="support-heading" className={styles.supportBand}>
      <div className={styles.supportInner}>
        <LifeBuoy aria-hidden="true" size={24} />
        <div>
          <p className={styles.eyebrow}>Escalation</p>
          <h2 id="support-heading">Still seeing the wrong result?</h2>
          <p>
            Contact support for sync discrepancies, Xero write failures, privacy
            concerns or unresolved feed-token incidents. Include your
            organisation name and the visible error, but never send a subscribe
            URL.
          </p>
          <p className={styles.supportDetails}>
            <a className="marketing-content-link" href={helpSupport.mailtoHref}>
              {helpSupport.email}
            </a>
            <span>{helpSupport.hours}</span>
          </p>
        </div>
      </div>
    </section>
  </main>
);

export default HelpCentrePage;

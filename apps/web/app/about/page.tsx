import { brandNameDisplay } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import {
  ArrowDown,
  ArrowRight,
  CalendarCheck,
  ExternalLink,
  FileCheck,
  Laptop,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./about.module.css";

export const metadata: Metadata = createMetadata({
  alternates: { canonical: "/about" },
  description:
    "Meet the people behind Team Calendar and see how trusted Xero Payroll leave and manual availability become one privacy-controlled calendar view.",
  openGraph: { url: "/about" },
  title: "About",
});

const calendarDestinations = ["Outlook", "Google Calendar", "Apple Calendar"];

const AboutPage = () => (
  <main className={`fmkt-page ${styles.root}`} id="main-content" tabIndex={-1}>
    <header className={styles.hero}>
      <div className={`fmkt-container ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <h1>Availability should be visible where work already happens.</h1>
          <p>
            {brandNameDisplay} helps small businesses bring approved Xero
            Payroll leave and everyday availability into the calendars their
            teams already check.
          </p>
        </div>
        <p className={styles.heroAside}>
          A focused product, built close to the work.
        </p>
      </div>
    </header>

    <section className={styles.section}>
      <div className="fmkt-container">
        <div className={styles.sectionIntro}>
          <h2>A narrow product, by design.</h2>
          <p>
            We are not replacing Xero Payroll, and we are not trying to become a
            full HR system. Team Calendar does one job: turn trusted leave and
            availability records into a clear, privacy-controlled calendar view.
          </p>
        </div>

        <div className={styles.boundary}>
          <div className={styles.sources}>
            <article className={`${styles.source} ${styles.xeroSource}`}>
              <FileCheck aria-hidden="true" size={24} strokeWidth={1.6} />
              <div>
                <p className={styles.meta}>Payroll source</p>
                <h3>Xero leave</h3>
                <p>Approved leave remains anchored in Xero Payroll.</p>
              </div>
            </article>

            <article className={`${styles.source} ${styles.manualSource}`}>
              <Laptop aria-hidden="true" size={24} strokeWidth={1.6} />
              <div>
                <p className={styles.meta}>Team-entered source</p>
                <h3>Manual availability</h3>
                <p>Working from home, training, travel and client visits.</p>
              </div>
            </article>
          </div>

          <div aria-hidden="true" className={styles.flow}>
            <ArrowRight className={styles.flowWide} size={28} />
            <ArrowDown className={styles.flowNarrow} size={28} />
          </div>

          <article className={styles.output}>
            <div className={styles.outputHeading}>
              <CalendarCheck aria-hidden="true" size={26} strokeWidth={1.6} />
              <div>
                <p className={styles.meta}>Published outcome</p>
                <h3>One privacy-controlled calendar view</h3>
              </div>
            </div>
            <p className={styles.exampleNote}>
              Illustrative records, not customer data.
            </p>
            <div className={styles.exampleRows}>
              <div className={styles.exampleRow}>
                <span>Avery · Annual leave</span>
                <span>Xero</span>
              </div>
              <div className={styles.exampleRow}>
                <span>Jordan · Working from home</span>
                <span>Manual</span>
              </div>
            </div>
            <ul className={styles.destinations}>
              {calendarDestinations.map((destination) => (
                <li key={destination}>{destination}</li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>

    <section className={`${styles.section} ${styles.peopleSection}`}>
      <div className="fmkt-container">
        <div className={styles.sectionIntro}>
          <h2>The people behind the product.</h2>
          <p>
            Team Calendar is a small, focused product with a clear point of
            accountability for the details that matter.
          </p>
        </div>

        <article className={styles.founder}>
          <div className={styles.personCopy}>
            <h3>Hilton Brown</h3>
            <p className={styles.role}>Founder, Team Calendar</p>
            <p>
              Hilton Brown is the founder of Team Calendar. The product is built
              and run on the Gold Coast for small businesses that want leave and
              availability to stay accurate without adding another place to
              check.
            </p>
            <a
              className="marketing-btn marketing-btn--tertiary"
              href="https://www.linkedin.com/in/hiltonbrown/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Connect on LinkedIn
              <ExternalLink aria-hidden="true" size={17} strokeWidth={1.7} />
            </a>
          </div>
        </article>
      </div>
    </section>

    <section className={styles.section}>
      <div className="fmkt-container">
        <div className={styles.finalCallout}>
          <div>
            <h2>Choose the next useful step.</h2>
            <p>
              Talk through your setup with us, or see how Team Calendar works
              with the calendar tools your team already uses.
            </p>
          </div>
          <div className={styles.finalActions}>
            <Link
              className="marketing-btn marketing-btn--primary"
              href="/contact"
            >
              Talk to us
            </Link>
            <Link
              className={`marketing-btn ${styles.finalSecondary}`}
              href="/integrations"
            >
              View integrations
            </Link>
          </div>
        </div>
      </div>
    </section>
  </main>
);

export default AboutPage;

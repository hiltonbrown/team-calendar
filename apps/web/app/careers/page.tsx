import { primaryDomain } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import { BriefcaseBusiness, Mail, MapPin, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import styles from "./careers.module.css";

export const metadata: Metadata = createMetadata({
  description:
    "Careers at Team Calendar. Learn how we approach product engineering, design systems and payroll operations work.",
  title: "Careers",
});

const practices = [
  {
    copy: "We prefer narrow, reliable product work over feature sprawl. A change earns its place when it makes leave and availability easier to understand.",
    icon: BriefcaseBusiness,
    title: "Reduce the problem before adding features",
  },
  {
    copy: "The product starts with Australian Xero Payroll teams and practical business admin. Product decisions should reflect how leave is actually managed, not an abstract workflow.",
    icon: MapPin,
    title: "Stay close to payroll operations",
  },
  {
    copy: "Leave, payroll and availability data need clear boundaries, direct language and conservative engineering. Design and implementation must make those boundaries visible.",
    icon: ShieldCheck,
    title: "Protect trust in the details",
  },
] as const;

const careersEmail = `careers@${primaryDomain}`;
const careersMailto = `mailto:${careersEmail}?subject=Future%20Team%20Calendar%20opportunity`;

const CareersPage = () => (
  <main
    className={`fmkt-page marketing-simple ${styles.page}`}
    id="careers-main"
    tabIndex={-1}
  >
    <header className={`marketing-simple__hero ${styles.hero}`}>
      <div className="fmkt-container">
        <div className={`marketing-simple__intro ${styles.heroCopy}`}>
          <p className={styles.status}>No open roles</p>
          <h1 className="marketing-simple__title">
            Build calm software for teams handling real leave and payroll data.
          </h1>
          <p className="marketing-simple__lead">
            We do not have open roles or a hiring timeline right now. When that
            changes, confirmed roles will be listed here.
          </p>
        </div>
      </div>
    </header>

    <section
      aria-labelledby="working-practices-title"
      className={`marketing-simple__section ${styles.practices}`}
    >
      <div className="fmkt-container">
        <div className={styles.sectionHeading}>
          <p>How we work</p>
          <h2 id="working-practices-title">
            Small product decisions, made carefully.
          </h2>
          <p>
            Team Calendar is built close to real payroll and leave admin. These
            principles shape the work.
          </p>
        </div>

        <div className={styles.practiceGrid}>
          {practices.map((practice) => {
            const Icon = practice.icon;
            return (
              <article
                className={`marketing-simple__panel ${styles.practice}`}
                data-careers-practice="true"
                key={practice.title}
              >
                <div className="marketing-simple__icon">
                  <Icon aria-hidden="true" size={22} strokeWidth={1.5} />
                </div>
                <h3>{practice.title}</h3>
                <p>{practice.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <section
      aria-labelledby="future-opportunities-title"
      className="marketing-simple__section marketing-simple__section--tonal"
    >
      <div className="fmkt-container">
        <div className={styles.futureCallout}>
          <div className={`marketing-simple__icon ${styles.futureIcon}`}>
            <Mail aria-hidden="true" size={22} strokeWidth={1.5} />
          </div>
          <div className={styles.futureCopy}>
            <h2 id="future-opportunities-title">Future opportunities</h2>
            <p>
              If your work is in product engineering, design systems or payroll
              operations, you can send a short introduction even though no role
              is open.
            </p>
            <p>
              Tell us which discipline is closest to your work and include a
              link to work you are comfortable sharing.
            </p>
            <p>
              Please do not send identity documents, payroll records or other
              sensitive personal information at this stage.
            </p>
          </div>
          <div className={styles.futureAction}>
            <a
              className="marketing-btn marketing-btn--primary"
              href={careersMailto}
            >
              Introduce yourself by email
            </a>
            <p>
              Or email <a href={careersMailto}>{careersEmail}</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  </main>
);

export default CareersPage;

import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { integrationCapabilities } from "./capabilities";
import { ConnectionMap } from "./integration-experience";
import styles from "./integrations.module.css";

export const metadata: Metadata = createMetadata({
  description:
    "Explore Team Calendar’s payroll and accounting connections: Xero in Australian early access, planned integrations and requests for new systems.",
  title: "Integrations",
});

const dataMoves = [
  {
    items: integrationCapabilities.inboundDataCategories.map(
      (category) => category.name
    ),
    title: "Reads from Xero",
  },
  {
    items: [
      "Leave applications submitted in Team Calendar",
      "Manager approval and decline decisions",
      "Leave application status updates",
    ],
    title: "Writes to Xero",
  },
  {
    items: [
      "Salary, banking, tax, or superannuation data",
      "Personal calendar contents",
    ],
    title: "Never reads",
  },
];

const plannedProviders =
  integrationCapabilities.australianPayrollProviders.filter(
    (provider) => provider.status === "planned"
  );
const plannedRegions = integrationCapabilities.xeroPayrollRegions
  .filter((region) => region.status === "planned")
  .map((region) => region.name)
  .join(" and ");

const IntegrationsPage = () => (
  <main className={`fmkt-page ${styles.root}`} id="main-content" tabIndex={-1}>
    <section className={styles.hero} data-integrations-section="hero">
      <div className="fmkt-container">
        <div className={styles.heroGrid}>
          <div>
            <h1 className={styles.title}>
              See planned and unplanned leave in Outlook.
            </h1>
            <p className={styles.lead}>
              Simplify leave requests and keep your team informed. From annual
              leave to unexpected sick leave, approved absences appear alongside
              WFH, travel and other availability in a shared Outlook calendar.
            </p>
            <div className={styles.actions}>
              <Link
                className="marketing-btn marketing-btn--primary"
                href="/contact"
              >
                Talk to us
              </Link>
              <Link
                className="marketing-btn marketing-btn--tertiary"
                href="/security"
              >
                Review security
              </Link>
            </div>
          </div>
        </div>
        <ConnectionMap />
      </div>
    </section>

    <section aria-labelledby="current-connection" className={styles.section}>
      <div className={`fmkt-container ${styles.split}`}>
        <div>
          <h2 className="fmkt-section-title" id="current-connection">
            Connect with Xero.
          </h2>
          <p className={styles.copy}>
            Our first integration connects Team Calendar to Xero Payroll in
            Australia. Early access includes guided setup with our team.
          </p>
          <Link className={styles.helpLink} href="/contact">
            Discuss your Xero connection
          </Link>
        </div>
        <article className={styles.currentProvider} data-status="shipped">
          <div className={styles.providerHeading}>
            <h3>Xero Payroll</h3>
            <span className={styles.currentStatus}>
              Australian early access
            </span>
          </div>
          <p className={styles.note}>
            Xero remains the source of truth for payroll balances and accruals.
          </p>
          <Link className={styles.helpLink} href="/help-centre/onboarding">
            Read the connection guide
          </Link>
        </article>
      </div>
    </section>

    <section aria-labelledby="data-moves" className={styles.section}>
      <div className="fmkt-container">
        <h2 className="fmkt-section-title" id="data-moves">
          What moves between systems.
        </h2>
        <p className={styles.copy}>
          Xero remains the source for payroll records and leave balances. Team
          Calendar sends leave requests and decisions back to Xero, and shares
          availability with your team’s calendars.
        </p>
        <div className={styles.dataGrid}>
          {dataMoves.map((group) => (
            <article className={styles.dataPanel} key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section
      aria-labelledby="planned-connections"
      className={`${styles.section} ${styles.tonal}`}
    >
      <div className={`fmkt-container ${styles.split}`}>
        <div>
          <h2 className="fmkt-section-title" id="planned-connections">
            More connections planned.
          </h2>
          <p className={styles.copy}>
            These Australian payroll connections are not available yet. Release
            dates will be shared when confirmed.
          </p>
          <p className={styles.regionNote}>
            Xero support for {plannedRegions} is also planned.
          </p>
        </div>
        <ul
          aria-label="Planned payroll integrations"
          className={styles.providerList}
        >
          {plannedProviders.map((provider) => (
            <li
              className={styles.provider}
              data-status={provider.status}
              key={provider.id}
            >
              <h3>{provider.name}</h3>
              <span className={styles.providerStatus}>Planned</span>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className={styles.section}>
      <div className={`fmkt-container ${styles.split}`}>
        <div>
          <h2 className="fmkt-section-title">Use another system?</h2>
          <p className={styles.copy}>
            Tell us which payroll or accounting system you use and where your
            business operates. Your requests help us prioritise new connections.
          </p>
          <Link
            className={`marketing-btn marketing-btn--primary ${styles.request}`}
            href="/contact"
          >
            Request an integration
          </Link>
        </div>
        <p className={styles.featureLink}>
          Looking for what Team Calendar can do?
          <Link className={styles.helpLink} href="/features">
            Explore features
          </Link>
        </p>
      </div>
    </section>
  </main>
);

export default IntegrationsPage;

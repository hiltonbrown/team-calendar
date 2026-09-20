import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { MarketingIcon } from "../(home)/components/marketing-icons";
import { integrationCapabilities } from "./capabilities";
import { ConnectionMap, IntegrationJourney } from "./integration-experience";
import styles from "./integrations.module.css";

export const metadata: Metadata = createMetadata({
  description:
    "How Team Calendar connects Xero Payroll to Outlook, Google Calendar, and Apple Calendar through secure calendar feeds.",
  title: "Integrations",
});

const regions = integrationCapabilities.xeroPayrollRegions.map((region) => ({
  ...region,
  detail:
    region.status === "shipped"
      ? "Annual leave, sick leave, long service leave, personal carer's leave, and public holidays."
      : "Planned for a future release.",
  statusLabel:
    region.status === "shipped" ? "Australian early access" : "Planned",
}));

const shippedRegionNames = integrationCapabilities.xeroPayrollRegions
  .filter((region) => region.status === "shipped")
  .map((region) => region.name);

const plannedRegionNames = integrationCapabilities.xeroPayrollRegions
  .filter((region) => region.status === "planned")
  .map((region) => region.name);

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

const setupSteps = [
  "Confirm early-access eligibility and setup with our team.",
  "Connect Xero Payroll and choose your payroll file.",
  "Check your employees, leave and balances after the first sync.",
  "Choose who each calendar shows, then share its subscription link.",
];

const destinationPresentation = {
  "apple-calendar": {
    copy: "Create a calendar subscription on macOS or iOS.",
    icon: "applecal",
  },
  "google-calendar": {
    copy: "Add the feed URL from calendar settings.",
    icon: "gcal",
  },
  outlook: {
    copy: "Subscribe from web in Microsoft 365 Calendar.",
    icon: "outlook",
  },
} as const;

const destinations = integrationCapabilities.calendarDestinations.map(
  (destination) => ({
    ...destination,
    ...destinationPresentation[destination.id],
  })
);

const syncDetails = [
  {
    copy: "Employees, leave and balances update regularly from your connected Australian Xero Payroll file.",
    title: "Payroll stays connected",
  },
  {
    copy: "Submitting, approving, declining or withdrawing leave updates Xero as part of that action. If it fails, you see an error so you can resolve it.",
    title: "Leave decisions update Xero",
  },
  {
    copy: "Team Calendar updates your feeds when availability changes. Calendar apps refresh subscriptions on their own schedules, so changes may not appear straight away.",
    title: "Calendar apps set refresh timing",
  },
];

const IntegrationsPage = () => (
  <main className={`fmkt-page ${styles.root}`} id="main-content" tabIndex={-1}>
    <section className={styles.hero} data-integrations-section="hero">
      <div className="fmkt-container">
        <div className={styles.heroGrid}>
          <div>
            <h1 className={styles.title}>
              See who is away in the calendars your team already uses.
            </h1>
            <p className={styles.lead}>
              Staff request leave in Team Calendar. Approved leave syncs back to
              Xero Payroll Australia and appears alongside travel, WFH and other
              availability updates in Outlook, Google Calendar or Apple
              Calendar.
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

    <IntegrationJourney />

    <section className={styles.section}>
      <div className={`fmkt-container ${styles.split}`}>
        <div className="fmkt-section-header">
          <h2 className="fmkt-section-title">
            Australian Xero Payroll in early access.
          </h2>
          <p className={styles.copy}>
            Team Calendar early access is available for Xero Payroll{" "}
            {shippedRegionNames.join(" and ")}.{" "}
            {plannedRegionNames.join(" and ")} support is planned for future
            releases.
          </p>
        </div>
        <div className={styles.regionList}>
          {regions.map((region) => (
            <article
              className={styles.region}
              data-status={region.status}
              key={region.code}
            >
              <span className={styles.regionCode}>{region.code}</span>
              <div>
                <div className={styles.regionHeading}>
                  <h3>{region.name}</h3>
                  <span className={styles.regionStatus}>
                    {region.statusLabel}
                  </span>
                </div>
                <p>{region.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className={`${styles.section} ${styles.tonal}`}>
      <div className="fmkt-container">
        <div className={styles.compactHeader}>
          <h2 className={`fmkt-section-title ${styles.compactTitle}`}>
            What moves between systems.
          </h2>
          <p className={styles.copy}>
            Xero remains the source for payroll records and leave balances. Team
            Calendar sends leave requests and decisions back to Xero, and shares
            availability with your team’s calendars.
          </p>
        </div>
        <div className={styles.dataGrid}>
          {dataMoves.map((group) => (
            <article className={styles.dataPanel} key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <MarketingIcon id="check" size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className={styles.section}>
      <div className={`fmkt-container ${styles.workflow}`}>
        <div>
          <h2 className="fmkt-section-title">
            Get connected with guided setup.
          </h2>
          <p className={styles.copy}>
            Australian early access includes guided setup. We confirm
            eligibility and onboarding with you, then help you connect payroll
            and choose what your team can see in their calendars.
          </p>
          <Link
            className={`marketing-content-link ${styles.helpLink}`}
            href="/help-centre/onboarding"
          >
            Read the setup guide
          </Link>
        </div>
        <ol className={styles.steps}>
          {setupSteps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>

    <section className={`${styles.section} ${styles.tonal}`}>
      <div className={`fmkt-container ${styles.destinationGrid}`}>
        <div>
          <h2 className="fmkt-section-title">
            Subscribe once in the calendar app.
          </h2>
          <p className={styles.copy}>
            Add a secure calendar subscription (ICS) to the app your team
            already uses. See approved leave, WFH, travel, training and client
            visits without installing another calendar app.
          </p>
          <Link
            className={`marketing-content-link ${styles.helpLink}`}
            href="/help-centre/onboarding#publish"
          >
            Learn how to subscribe
          </Link>
        </div>
        <div className={styles.destinations}>
          {destinations.map((destination) => (
            <article className={styles.destination} key={destination.name}>
              <span>
                <MarketingIcon id={destination.icon} size={20} />
              </span>
              <div>
                <h3>{destination.name}</h3>
                <p>{destination.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className={styles.section}>
      <div className="fmkt-container">
        <div className={styles.syncPanel}>
          <div className={styles.syncHeading}>
            <span>
              <MarketingIcon id="shieldCheck" size={24} />
            </span>
            <div>
              <h2>Stay in control of what your team can see.</h2>
              <p>
                Choose which people and details appear in each feed, and revoke
                access when needed. Your Xero connection credentials are stored
                encrypted.
              </p>
              <Link
                className={`marketing-content-link ${styles.helpLink}`}
                href="/security"
              >
                See how your data is protected
              </Link>
            </div>
          </div>
          <div className={styles.syncList}>
            {syncDetails.map((detail) => (
              <article key={detail.title}>
                <h3>{detail.title}</h3>
                <p>{detail.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  </main>
);

export default IntegrationsPage;

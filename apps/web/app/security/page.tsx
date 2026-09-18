import { createMetadata } from "@repo/seo/metadata";
import {
  ArrowRight,
  Check,
  Database,
  KeyRound,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./security.module.css";

export const metadata: Metadata = createMetadata({
  description:
    "Verified Team Calendar access, data protection, processing and vulnerability response controls.",
  title: "Security",
});

const topics = [
  { href: "#access", label: "Who can access data?" },
  { href: "#protection", label: "How is data protected?" },
  { href: "#data-flow", label: "Where does data move and live?" },
  { href: "#response", label: "What happens when something goes wrong?" },
] as const;

const SecurityPage = () => (
  <main className={`fmkt-page ${styles.page}`} id="security-main" tabIndex={-1}>
    <header className={styles.hero}>
      <div className="fmkt-container">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Trust and safeguards</p>
          <h1>Security controls you can assess</h1>
          <p className={styles.lead}>
            Team Calendar handles payroll-connected leave and availability data.
            This page describes the controls implemented today, the systems that
            process data, and the private path for reporting a vulnerability.
          </p>
          <p className={styles.reviewed}>
            Evidence last reviewed{" "}
            <time dateTime="2026-08-30">30 August 2026</time>
          </p>
        </div>
        <section
          aria-labelledby="trust-summary-title"
          className={styles.summary}
        >
          <div className={styles.summaryHeading}>
            <ShieldCheck aria-hidden="true" size={24} strokeWidth={1.7} />
            <h2 id="trust-summary-title">Implemented control summary</h2>
          </div>
          <ul>
            <li>
              <Check aria-hidden="true" size={18} />
              Clerk-authenticated product routes
            </li>
            <li>
              <Check aria-hidden="true" size={18} />
              Tenant and organisation-scoped services
            </li>
            <li>
              <Check aria-hidden="true" size={18} />
              Encrypted Xero OAuth credentials
            </li>
            <li>
              <Check aria-hidden="true" size={18} />
              Signed, revocable calendar feed tokens
            </li>
          </ul>
        </section>
        <nav aria-label="Security topics" className={styles.topicNav}>
          <p>Security topics</p>
          <ul>
            {topics.map((topic) => (
              <li key={topic.href}>
                <a className="marketing-content-link" href={topic.href}>
                  {topic.label}
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>

    <div className={styles.body}>
      <section className={styles.topic} data-security-topic="true" id="access">
        <TopicHeading
          icon={<UsersRound aria-hidden="true" size={25} strokeWidth={1.6} />}
          kicker="Access"
          title="Who can access data?"
        />
        <div className={styles.controlRows}>
          <Control title="Identity and route boundary">
            Clerk provides identity and organisation membership. Authenticated
            product routes are protected at the route boundary, while sensitive
            services also enforce their own scope.
          </Control>
          <Control title="Tenant and organisation scope">
            A Clerk Organisation is the top-level tenant boundary. Data access
            applies both the Clerk organisation ID and the selected payroll
            organisation where required.
          </Control>
          <Control title="Role boundaries">
            Owners and admins administer configuration. Managers are limited to
            permitted teams and reports. The baseline employee membership is
            read-only outside that employee’s own leave and availability.
          </Control>
        </div>
      </section>

      <section
        className={styles.topic}
        data-security-topic="true"
        id="protection"
      >
        <TopicHeading
          icon={<KeyRound aria-hidden="true" size={25} strokeWidth={1.6} />}
          kicker="Protection"
          title="How is data protected?"
        />
        <div className={styles.controlRows}>
          <Control title="Xero credentials">
            Xero OAuth tokens use application-level AES-256-GCM encryption.
            Token operations stay server-side and credentials are not sent to
            client code.
          </Control>
          <Control title="Calendar subscriptions">
            Feed URLs use signed, revocable tokens. Plaintext tokens are not
            persisted, while authorised viewers intentionally receive the
            complete active subscribe URL.
          </Control>
          <Control title="Effective event privacy">
            Published events use the stricter of the feed and record privacy
            modes. A record can be excluded from feeds with{" "}
            <code>include_in_feed</code>. Team Calendar does not expose category
            or type selectors.
          </Control>
          <Control title="Transport and diagnostics">
            Supported network transport uses HTTPS/TLS. Observability events,
            breadcrumbs and logs are scrubbed before delivery, and server
            stack-frame local variables are disabled.
          </Control>
        </div>
      </section>

      <section
        className={`${styles.topic} ${styles.flowTopic}`}
        data-security-topic="true"
        id="data-flow"
      >
        <TopicHeading
          icon={<Database aria-hidden="true" size={25} strokeWidth={1.6} />}
          kicker="Data flow"
          title="Where does data move and live?"
        />
        <p className={styles.topicIntro}>
          This is the implemented path from payroll source to a subscribed
          calendar.
        </p>
        <ol className={styles.flow}>
          <FlowStep title="Xero Payroll">
            Payroll people, approved leave and balances enter through the
            authenticated Xero integration.
          </FlowStep>
          <FlowStep title="Team Calendar tenant boundary">
            Canonical records are processed within Clerk organisation and
            payroll organisation scope.
          </FlowStep>
          <FlowStep title="Encrypted token and primary data storage">
            Primary records are stored in Neon PostgreSQL. Xero OAuth tokens
            receive additional application-level encryption.
          </FlowStep>
          <FlowStep title="Privacy projection">
            Eligibility and effective privacy are applied before publication.
            Published ICS bodies can be cached in configured Redis/KV.
          </FlowStep>
          <FlowStep title="Subscribed calendars">
            Authorised calendar clients retrieve the resulting ICS feed through
            its signed, revocable URL.
          </FlowStep>
        </ol>
        <div className={styles.providerNote}>
          <h3>Processing locations depend on configuration</h3>
          <p>
            Vercel, Neon, Clerk, Redis/KV and configured analytics or
            observability providers participate in processing. Region and
            replication depend on deployed account configuration.{" "}
            <a className="marketing-content-link" href="/contact">
              Ask us about a residency requirement
            </a>
            .
          </p>
        </div>
      </section>

      <section
        className={styles.topic}
        data-security-topic="true"
        id="response"
      >
        <TopicHeading
          icon={<ShieldCheck aria-hidden="true" size={25} strokeWidth={1.6} />}
          kicker="Response"
          title="What happens when something goes wrong?"
        />
        <div className={styles.responseGrid}>
          <article>
            <p className={styles.actionLabel}>Procurement and privacy</p>
            <h3>Assess Team Calendar</h3>
            <p className={styles.responseCopy}>
              Discuss your security, privacy or residency requirements with us,
              or review how the public site handles personal information.
            </p>
            <div className={styles.actions}>
              <a
                className="marketing-btn marketing-btn--primary"
                href="/contact"
              >
                Contact us
              </a>
              <a
                className="marketing-btn marketing-btn--tertiary"
                href="/privacy-policy"
              >
                Privacy policy
              </a>
            </div>
          </article>
          <article className={styles.reportCard}>
            <p className={styles.actionLabel}>Good-faith research</p>
            <h3>Report a vulnerability</h3>
            <p className={`${styles.responseCopy} ${styles.reportCopy}`}>
              Use the repository’s private GitHub Security Advisory form. Do not
              create a public issue. We target acknowledgement within two
              business days and triage within five business days.
            </p>
            <a
              className="marketing-btn marketing-btn--outline"
              href="https://github.com/hiltonbrown/team-calendar/security/advisories/new"
            >
              Open private reporting form
              <ArrowRight aria-hidden="true" size={17} />
            </a>
          </article>
        </div>
      </section>
    </div>
  </main>
);

const TopicHeading = ({
  icon,
  kicker,
  title,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
}) => (
  <div className={styles.topicHeading}>
    <span className={styles.topicIcon}>{icon}</span>
    <div>
      <p>{kicker}</p>
      <h2>{title}</h2>
    </div>
  </div>
);
const Control = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <article>
    <h3>{title}</h3>
    <p>{children}</p>
  </article>
);
const FlowStep = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <li>
    <span>{title}</span>
    <p>{children}</p>
  </li>
);

export default SecurityPage;

import {
  getPublicStatus,
  type PublicComponentState,
  type PublicOverallState,
  type PublicStatusIncident,
  publicComponentNames,
} from "@repo/observability/status";
import { createMetadata } from "@repo/seo/metadata";
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock3,
  ExternalLink,
  MailWarning,
  RefreshCw,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import {
  statusIncidentMailtoHref,
  supportEmail,
  supportHoursLong,
} from "@/src/data/support";
import styles from "./status.module.css";

export const revalidate = 60;

export const metadata: Metadata = createMetadata({
  alternates: { canonical: "/status" },
  description:
    "Current Team Calendar service health, incident updates, maintenance, and support paths.",
  openGraph: { url: "/status" },
  title: "Status",
});

const componentStateDetails = {
  degraded: { icon: CircleAlert, label: "Degraded performance" },
  maintenance: { icon: Wrench, label: "Maintenance" },
  operational: { icon: CircleCheck, label: "Operational" },
  outage: { icon: CircleX, label: "Outage" },
  unknown: { icon: CircleHelp, label: "Unknown" },
} as const satisfies Record<
  PublicComponentState,
  { icon: typeof CircleCheck; label: string }
>;

const overallStateDetails = {
  degraded: {
    icon: CircleAlert,
    label: "Degraded performance",
    message:
      "Some services are responding more slowly or less reliably than expected.",
  },
  maintenance: {
    icon: Wrench,
    label: "Maintenance underway",
    message: "Planned work is affecting at least one service.",
  },
  major_outage: {
    icon: CircleX,
    label: "Major outage",
    message: "All monitored customer services are currently affected.",
  },
  operational: {
    icon: CircleCheck,
    label: "All systems operational",
    message: "All five customer-facing services are reporting normally.",
  },
  partial_outage: {
    icon: CircleX,
    label: "Partial outage",
    message: "One or more customer services are currently unavailable.",
  },
  unknown: {
    icon: CircleHelp,
    label: "Status unknown",
    message:
      "We cannot confirm current service health from our monitoring provider.",
  },
} as const satisfies Record<
  PublicOverallState,
  { icon: typeof CircleCheck; label: string; message: string }
>;

const formatStatusTime = (value: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Australia/Brisbane",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));

const IncidentCard = ({ incident }: { incident: PublicStatusIncident }) => (
  <article className={styles.incidentCard}>
    <div className={styles.incidentHeading}>
      <div>
        <p className={`${styles.incidentState} ${styles[incident.state]}`}>
          {incident.state === "active" && "Active incident"}
          {incident.state === "maintenance" && "Scheduled maintenance"}
          {incident.state === "resolved" && "Resolved"}
        </p>
        <h3>{incident.title}</h3>
      </div>
      <p className={styles.incidentTiming}>
        Started{" "}
        <time dateTime={incident.startedAt}>
          {formatStatusTime(incident.startedAt)}
        </time>
      </p>
    </div>
    {incident.affectedComponents.length > 0 && (
      <p className={styles.affected}>
        <strong>Affected:</strong> {incident.affectedComponents.join(", ")}
      </p>
    )}
    {incident.resolvedAt ? (
      <p className={styles.resolvedTime}>
        Resolved{" "}
        <time dateTime={incident.resolvedAt}>
          {formatStatusTime(incident.resolvedAt)}
        </time>
      </p>
    ) : null}
    {incident.updates.length > 0 && (
      <ol className={styles.updateList}>
        {incident.updates.map((update) => (
          <li key={`${update.publishedAt}-${update.message}`}>
            <time dateTime={update.publishedAt}>
              {formatStatusTime(update.publishedAt)}
            </time>
            <p>{update.message}</p>
          </li>
        ))}
      </ol>
    )}
  </article>
);

type StatusResult = Awaited<ReturnType<typeof getPublicStatus>>;

export const StatusContent = ({ result }: { result: StatusResult }) => {
  const snapshot = result.ok ? result.value : null;
  const overallState = snapshot?.overallState ?? "unknown";
  const overall = overallStateDetails[overallState];
  const OverallIcon = overall.icon;
  const components =
    snapshot?.components ??
    publicComponentNames.map((name) => ({ name, state: "unknown" as const }));
  const hostedStatusPageUrl = result.ok
    ? result.value.hostedStatusPageUrl
    : result.error.hostedStatusPageUrl;
  const incidentsAvailable = snapshot?.incidentAvailability === "available";

  return (
    <main className={`fmkt-page ${styles.root}`} id="status-main" tabIndex={-1}>
      <header className={styles.hero}>
        <div className="fmkt-container">
          <p className={styles.kicker}>Status</p>
          <h1>Team Calendar status</h1>
          <div
            className={`${styles.overall} ${styles[overallState]}`}
            role="status"
          >
            <OverallIcon aria-hidden="true" size={30} strokeWidth={1.7} />
            <div>
              <p className={styles.overallLabel}>{overall.label}</p>
              <p>{overall.message}</p>
            </div>
          </div>
          <div className={styles.utilityRow}>
            {snapshot ? (
              <p className={styles.checkedTime}>
                <Clock3 aria-hidden="true" size={18} />
                Checked{" "}
                <time dateTime={snapshot.checkedAt}>
                  {formatStatusTime(snapshot.checkedAt)}
                </time>
              </p>
            ) : (
              <p className={styles.checkedTime}>
                No verified check time available
              </p>
            )}
            <div className={styles.actions}>
              <a className={styles.secondaryAction} href="/status">
                <RefreshCw aria-hidden="true" size={18} /> Reload status
              </a>
              {snapshot?.subscribable ? (
                <a
                  className={styles.primaryAction}
                  href={snapshot.hostedStatusPageUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Subscribe to updates{" "}
                  <ExternalLink aria-hidden="true" size={17} />
                </a>
              ) : null}
              {!snapshot?.subscribable && hostedStatusPageUrl && (
                <a
                  className={styles.secondaryAction}
                  href={hostedStatusPageUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  View hosted status{" "}
                  <ExternalLink aria-hidden="true" size={17} />
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={`fmkt-container ${styles.sectionInner}`}>
          <div className={styles.sectionIntro}>
            <h2>Current status by service</h2>
            <p>Five customer-facing services are checked independently.</p>
          </div>
          <ul className={styles.componentList}>
            {components.map((component) => {
              const detail = componentStateDetails[component.state];
              const Icon = detail.icon;
              return (
                <li data-status-component="true" key={component.name}>
                  <span>{component.name}</span>
                  <span
                    className={`${styles.stateLabel} ${styles[component.state]}`}
                  >
                    <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                    {detail.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tonalSection}`}>
        <div className={`fmkt-container ${styles.sectionInner}`}>
          <div className={styles.sectionIntro}>
            <h2>Active incidents</h2>
            <p>Current investigations and scheduled maintenance.</p>
          </div>
          {!incidentsAvailable && (
            <div className={styles.emptyState}>
              <CircleHelp aria-hidden="true" size={22} />
              <p>
                Incident history is temporarily unavailable.
                {hostedStatusPageUrl ? (
                  <>
                    {" "}
                    Check the{" "}
                    <a href={hostedStatusPageUrl}>hosted status page</a>.
                  </>
                ) : null}
              </p>
            </div>
          )}
          {incidentsAvailable && snapshot.activeIncidents.length === 0 && (
            <div className={styles.emptyState}>
              <CircleCheck aria-hidden="true" size={22} />
              <p>No active incidents reported.</p>
            </div>
          )}
          {incidentsAvailable && snapshot.activeIncidents.length > 0 && (
            <div className={styles.incidentList}>
              {snapshot.activeIncidents.map((incident) => (
                <IncidentCard
                  incident={incident}
                  key={`${incident.startedAt}-${incident.title}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={`fmkt-container ${styles.sectionInner}`}>
          <div className={styles.sectionIntro}>
            <h2>Recent incidents</h2>
            <p>Resolved service reports, newest resolution first.</p>
          </div>
          {!incidentsAvailable && (
            <p className={styles.mutedCopy}>
              Recent incident history is unavailable.
            </p>
          )}
          {incidentsAvailable && snapshot.recentIncidents.length === 0 && (
            <p className={styles.mutedCopy}>No recent incidents reported.</p>
          )}
          {incidentsAvailable && snapshot.recentIncidents.length > 0 && (
            <div className={styles.incidentList}>
              {snapshot.recentIncidents.map((incident) => (
                <IncidentCard
                  incident={incident}
                  key={`${incident.startedAt}-${incident.title}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.reportSection}`}>
        <div className={`fmkt-container ${styles.reportCard}`}>
          <MailWarning aria-hidden="true" size={28} strokeWidth={1.6} />
          <div className={styles.reportCopy}>
            <h2>Report an issue</h2>
            <p>
              If your issue is not listed, email{" "}
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Our staffed
              response window is {supportHoursLong}. This is not a guaranteed
              resolution time.
            </p>
            <p className={styles.sensitiveWarning}>
              Do not include payroll data, leave details, passwords, API keys,
              calendar feed URLs, or other sensitive information.
            </p>
          </div>
          <a className={styles.primaryAction} href={statusIncidentMailtoHref}>
            Email service support
          </a>
        </div>
      </section>
    </main>
  );
};

const StatusPage = async () => (
  <StatusContent result={await getPublicStatus()} />
);

export default StatusPage;

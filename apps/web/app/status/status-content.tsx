import {
  type getPublicStatus,
  type PublicComponentState,
  type PublicOverallState,
  type PublicStatusIncident,
  publicComponentNames,
} from "@repo/observability/status";
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
import {
  statusIncidentMailtoHref,
  supportEmail,
  supportHoursLong,
} from "@/src/data/support";
import styles from "./status.module.css";

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

export type StatusResult = Awaited<ReturnType<typeof getPublicStatus>>;

export const StatusContent = ({
  result,
  styles: customStyles,
}: {
  result: StatusResult;
  styles?: Record<string, string>;
}) => {
  const activeStyles = customStyles ?? styles;
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
    <main
      className={`fmkt-page ${activeStyles.root}`}
      id="main-content"
      tabIndex={-1}
    >
      <header className={activeStyles.hero}>
        <div className="fmkt-container">
          <p className={activeStyles.kicker}>Status</p>
          <h1>Team Calendar status</h1>
          <div
            className={`${activeStyles.overall} ${activeStyles[overallState]}`}
            role="status"
          >
            <OverallIcon aria-hidden="true" size={30} strokeWidth={1.7} />
            <div>
              <p className={activeStyles.overallLabel}>{overall.label}</p>
              <p>{overall.message}</p>
            </div>
          </div>
          <div className={activeStyles.utilityRow}>
            {snapshot ? (
              <p className={activeStyles.checkedTime}>
                <Clock3 aria-hidden="true" size={18} />
                Checked{" "}
                <time dateTime={snapshot.checkedAt}>
                  {formatStatusTime(snapshot.checkedAt)}
                </time>
              </p>
            ) : (
              <p className={activeStyles.checkedTime}>
                No verified check time available
              </p>
            )}
            <div className={activeStyles.actions}>
              <a className={activeStyles.secondaryAction} href="/status">
                <RefreshCw aria-hidden="true" size={18} /> Reload status
              </a>
              {snapshot?.subscribable ? (
                <a
                  className={activeStyles.primaryAction}
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
                  className={activeStyles.secondaryAction}
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

      <section className={activeStyles.section}>
        <div className={`fmkt-container ${activeStyles.sectionInner}`}>
          <div className={activeStyles.sectionIntro}>
            <h2>Current status by service</h2>
            <p>Five customer-facing services are checked independently.</p>
          </div>
          <ul className={activeStyles.componentList}>
            {components.map((component) => {
              const detail = componentStateDetails[component.state];
              const Icon = detail.icon;
              return (
                <li data-status-component="true" key={component.name}>
                  <span>{component.name}</span>
                  <span
                    className={`${activeStyles.stateLabel} ${activeStyles[component.state]}`}
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

      <section
        className={`${activeStyles.section} ${activeStyles.tonalSection}`}
      >
        <div className={`fmkt-container ${activeStyles.sectionInner}`}>
          <div className={activeStyles.sectionIntro}>
            <h2>Active incidents</h2>
            <p>Current investigations and scheduled maintenance.</p>
          </div>
          {!incidentsAvailable && (
            <div className={activeStyles.emptyState}>
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
            <div className={activeStyles.emptyState}>
              <CircleCheck aria-hidden="true" size={22} />
              <p>No active incidents reported.</p>
            </div>
          )}
          {incidentsAvailable && snapshot.activeIncidents.length > 0 && (
            <div className={activeStyles.incidentList}>
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

      <section className={activeStyles.section}>
        <div className={`fmkt-container ${activeStyles.sectionInner}`}>
          <div className={activeStyles.sectionIntro}>
            <h2>Recent incidents</h2>
            <p>Resolved service reports, newest resolution first.</p>
          </div>
          {!incidentsAvailable && (
            <p className={activeStyles.mutedCopy}>
              Recent incident history is unavailable.
            </p>
          )}
          {incidentsAvailable && snapshot.recentIncidents.length === 0 && (
            <p className={activeStyles.mutedCopy}>
              No recent incidents reported.
            </p>
          )}
          {incidentsAvailable && snapshot.recentIncidents.length > 0 && (
            <div className={activeStyles.incidentList}>
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

      <section
        className={`${activeStyles.section} ${activeStyles.reportSection}`}
      >
        <div className={`fmkt-container ${activeStyles.reportCard}`}>
          <MailWarning aria-hidden="true" size={28} strokeWidth={1.6} />
          <div className={activeStyles.reportCopy}>
            <h2>Report an issue</h2>
            <p>
              If your issue is not listed, email{" "}
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Our staffed
              response window is {supportHoursLong}. This is not a guaranteed
              resolution time.
            </p>
            <p className={activeStyles.sensitiveWarning}>
              Do not include payroll data, leave details, passwords, API keys,
              calendar feed URLs, or other sensitive information.
            </p>
          </div>
          <a
            className={activeStyles.primaryAction}
            href={statusIncidentMailtoHref}
          >
            Email service support
          </a>
        </div>
      </section>
    </main>
  );
};

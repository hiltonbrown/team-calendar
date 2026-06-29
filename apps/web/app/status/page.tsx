import { primaryDomain } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import { Bell, CalendarSync, MailWarning, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Status",
  description:
    "Team Calendar status information for the app, Xero sync, calendar feeds, and notifications.",
});

const monitoredAreas = [
  {
    icon: ShieldCheck,
    title: "App access",
    copy: "Sign-in, organisation switching, and authenticated product routes.",
  },
  {
    icon: CalendarSync,
    title: "Xero sync and calendar feeds",
    copy: "Xero Payroll connectivity, availability normalisation, and published ICS feed delivery.",
  },
  {
    icon: Bell,
    title: "Notifications",
    copy: "In-app and email delivery for leave, approval, sync, and feed events.",
  },
];

const StatusPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Status</p>
          <h1 className="marketing-simple__title">
            Product status and incident updates.
          </h1>
          <p className="marketing-simple__lead">
            This page records platform areas we monitor and where to report an
            active issue. Live automated telemetry is not published here yet.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__section-head">
          <h2 className="marketing-simple__section-title">
            Monitored service areas
          </h2>
          <p className="marketing-simple__section-copy">
            If an incident affects customers, we will use this page and direct
            customer communication to share impact, mitigation, and resolution
            notes.
          </p>
        </div>
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {monitoredAreas.map((area) => {
            const Icon = area.icon;
            return (
              <article className="marketing-simple__panel" key={area.title}>
                <div className="marketing-simple__icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h2>{area.title}</h2>
                <p>{area.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section marketing-simple__section--tonal">
      <div className="fmkt-container">
        <div className="marketing-simple__callout">
          <div className="marketing-simple__icon">
            <MailWarning size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <h2 className="marketing-simple__section-title">
              Seeing an active issue?
            </h2>
            <p className="marketing-simple__section-copy">
              Email support with your organisation name, the affected area, and
              when the issue started.
            </p>
            <p className="marketing-simple__section-copy">
              Contact:{" "}
              <a
                className="marketing-simple__link"
                href={`mailto:support@${primaryDomain}`}
              >
                support@{primaryDomain}
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default StatusPage;

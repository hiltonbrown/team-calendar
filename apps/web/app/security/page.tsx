import { createMetadata } from "@repo/seo/metadata";
import {
  Building2,
  Globe,
  Key,
  Lock,
  Rss,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Security",
  description:
    "How Team Calendar handles data security, encryption, tenant isolation, Clerk-managed auth, and ICS feed token security.",
});

const securitySections = [
  {
    icon: ShieldCheck,
    title: "Clerk-managed authentication",
    description:
      "Team Calendar uses Clerk for all authentication and authorisation. There are no custom user tables or password storage. Clerk handles session management, MFA options, and identity verification. All authenticated routes are protected by Clerk middleware.",
  },
  {
    icon: Building2,
    title: "Tenant isolation",
    description:
      "Team Calendar is multi-tenant. Each Clerk Organisation is a strict tenant boundary. Every database query that accesses tenant data filters by the Clerk organisation ID. It is not possible for one organisation to access another organisation's data.",
  },
  {
    icon: Users,
    title: "Role-based access control",
    description:
      "Roles are managed in Clerk and enforced at the application layer. Owner and admin roles have full organisational access. Manager roles have access scoped to their team and direct reports. Viewer roles have read-only access. Permissions are checked on every request.",
  },
  {
    icon: Lock,
    title: "Encryption at rest and in transit",
    description:
      "All data is encrypted at rest using Neon PostgreSQL's encryption layer. All data in transit is protected by TLS. Xero OAuth tokens are encrypted at rest using application-level encryption and are never stored in plaintext or exposed to client-side code.",
  },
  {
    icon: Key,
    title: "Xero token security",
    description:
      "Team Calendar stores Xero OAuth refresh tokens encrypted at rest. Access tokens are short-lived and refreshed proactively before sync runs. Token refresh is handled server-side. If access is revoked in Xero, the Team Calendar connection is deactivated on the next sync attempt.",
  },
  {
    icon: Rss,
    title: "ICS feed token security",
    description:
      "ICS feed URLs are secured with a signed token. Tokens are short, URL-safe, and revocable. The plaintext token value is never persisted in the database. If a feed URL is compromised, the token can be regenerated, immediately invalidating any existing subscriptions.",
  },
  {
    icon: Globe,
    title: "Data residency",
    description:
      "Team Calendar runs on Vercel (application layer) and Neon PostgreSQL (database layer). Both are cloud-hosted in data centres that comply with standard data protection requirements. Data is not intentionally replicated across regions. Specific data residency requirements for enterprise customers: contact us to discuss.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy controls on feeds",
    description:
      "ICS feeds publish only the availability information you configure. Privacy controls let administrators specify which leave categories and availability types appear on published feeds. Sensitive leave categories can be hidden entirely or shown as unavailable without category detail.",
  },
];

const SecurityPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Security</p>
          <h1 className="marketing-simple__title">Security and privacy</h1>
          <p className="marketing-simple__lead">
            Team Calendar handles real payroll and leave data. Security is not
            an afterthought. Here is how data is protected at every layer.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {securitySections.map((section) => {
            const Icon = section.icon;
            return (
              <div className="marketing-simple__panel" key={section.title}>
                <div className="marketing-simple__icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section marketing-simple__section--tonal">
      <div className="fmkt-container">
        <div className="marketing-simple__callout">
          <div className="marketing-simple__icon">
            <ShieldCheck size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <h2 className="marketing-simple__section-title">
              Security questions or concerns
            </h2>
            <p className="marketing-simple__section-copy">
              If you have specific security requirements, a compliance
              obligation to assess, or want to report a vulnerability, please
              contact us directly. We take all reports seriously and respond
              promptly.
            </p>
            <p className="marketing-simple__section-copy">
              Contact:{" "}
              <a
                className="marketing-simple__link"
                href="mailto:security@teamcalendar.online"
              >
                security@teamcalendar.online
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default SecurityPage;

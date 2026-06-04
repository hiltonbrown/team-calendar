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
    "How LeaveSync handles data security, encryption, tenant isolation, Clerk-managed auth, and ICS feed token security.",
});

const securitySections = [
  {
    icon: ShieldCheck,
    title: "Clerk-managed authentication",
    description:
      "LeaveSync uses Clerk for all authentication and authorisation. There are no custom user tables or password storage. Clerk handles session management, MFA options, and identity verification. All authenticated routes are protected by Clerk middleware.",
  },
  {
    icon: Building2,
    title: "Tenant isolation",
    description:
      "LeaveSync is multi-tenant. Each Clerk Organisation is a strict tenant boundary. Every database query that accesses tenant data filters by the Clerk organisation ID. It is not possible for one organisation to access another organisation's data.",
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
      "LeaveSync stores Xero OAuth refresh tokens encrypted at rest. Access tokens are short-lived and refreshed proactively before sync runs. Token refresh is handled server-side. If access is revoked in Xero, the LeaveSync connection is deactivated on the next sync attempt.",
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
      "LeaveSync runs on Vercel (application layer) and Neon PostgreSQL (database layer). Both are cloud-hosted in data centres that comply with standard data protection requirements. Data is not intentionally replicated across regions. Specific data residency requirements for enterprise customers: contact us to discuss.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy controls on feeds",
    description:
      "ICS feeds publish only the availability information you configure. Privacy controls let administrators specify which leave categories and availability types appear on published feeds. Sensitive leave categories can be hidden entirely or shown as unavailable without category detail.",
  },
];

const SecurityPage = () => (
  <div className="w-full">
    {/* Page header */}
    <div className="w-full bg-muted/50 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-4 lg:max-w-2xl">
          <p className="font-medium text-primary text-sm uppercase tracking-widest">
            Security
          </p>
          <h1 className="font-semibold text-4xl tracking-tight md:text-6xl">
            Security and privacy
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            LeaveSync handles real payroll and leave data. Security is not an
            afterthought. Here is how data is protected at every layer.
          </p>
        </div>
      </div>
    </div>

    {/* Security sections */}
    <div className="w-full py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {securitySections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                className="flex flex-col gap-4 rounded-2xl bg-muted p-6 lg:p-8"
                key={section.title}
              >
                <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                <div className="flex flex-col gap-2">
                  <h2 className="font-medium text-xl">{section.title}</h2>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Contact callout */}
    <div className="w-full bg-muted/30 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-4 lg:max-w-2xl">
          <h2 className="font-semibold text-3xl tracking-tight">
            Security questions or concerns
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            If you have specific security requirements, a compliance obligation
            to assess, or want to report a vulnerability, please contact us
            directly. We take all reports seriously and respond promptly.
          </p>
          <p className="text-base text-muted-foreground">
            Contact:{" "}
            <a
              className="text-primary underline underline-offset-4"
              href="mailto:security@leavesync.com"
            >
              security@leavesync.com
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default SecurityPage;

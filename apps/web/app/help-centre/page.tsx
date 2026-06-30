import { primaryDomain } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import {
  CalendarDays,
  CircleHelp,
  KeyRound,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = createMetadata({
  title: "Help centre",
  description:
    "Help resources for setting up Team Calendar, connecting Xero Payroll, securing feeds, and getting support.",
});

const resources = [
  {
    icon: KeyRound,
    title: "Connect Xero Payroll",
    copy: "Understand the Xero connection flow, supported payroll regions, and how Team Calendar keeps leave data current.",
    href: "/integrations",
    link: "Read integration notes",
  },
  {
    icon: CalendarDays,
    title: "Publish calendar feeds",
    copy: "Learn how approved leave and manual availability become read-only calendar subscriptions for the tools your team already uses.",
    href: "/features#ics-feeds",
    link: "View calendar feed features",
  },
  {
    icon: ShieldCheck,
    title: "Review security controls",
    copy: "See how authentication, tenant isolation, encrypted Xero tokens, and feed token revocation are handled.",
    href: "/security",
    link: "Open security overview",
  },
];

const HelpCentrePage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Help centre</p>
          <h1 className="marketing-simple__title">
            Practical help for setting up Team Calendar.
          </h1>
          <p className="marketing-simple__lead">
            Start with the guides below, or contact us directly if your question
            involves Xero Payroll setup, privacy rules, or feed publishing.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {resources.map((resource) => {
            const Icon = resource.icon;
            return (
              <article className="marketing-simple__panel" key={resource.title}>
                <div className="marketing-simple__icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h2>{resource.title}</h2>
                <p>{resource.copy}</p>
                <p>
                  <Link className="marketing-simple__link" href={resource.href}>
                    {resource.link}
                  </Link>
                </p>
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
            <CircleHelp size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <h2 className="marketing-simple__section-title">
              Need a direct answer?
            </h2>
            <p className="marketing-simple__section-copy">
              Send the question, your organisation name, and the Xero Payroll
              region you use. We will route it to the right person.
            </p>
            <p className="marketing-simple__section-copy">
              <Mail aria-hidden="true" size={16} strokeWidth={1.8} /> Contact:{" "}
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

export default HelpCentrePage;

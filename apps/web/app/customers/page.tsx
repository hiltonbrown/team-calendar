import { createMetadata } from "@repo/seo/metadata";
import { Building2, CalendarDays, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = createMetadata({
  title: "Customers",
  description:
    "The kinds of Xero Payroll teams Team Calendar is built for, from multi-site operators to growing professional services teams.",
});

const customerTypes = [
  {
    icon: Building2,
    title: "Multi-entity operators",
    copy: "Organisations with more than one payroll entity, location, or roster shape that still need one clear view of who is away.",
  },
  {
    icon: CalendarDays,
    title: "Teams that live in calendars",
    copy: "Managers and employees who already plan in Outlook, Google Calendar, or Apple Calendar, and do not want another planner to check.",
  },
  {
    icon: UserRoundCheck,
    title: "Mixed workforces",
    copy: "Teams with employees, contractors, directors, advisors, and people whose availability matters even when they are not in payroll.",
  },
];

const CustomersPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Customers</p>
          <h1 className="marketing-simple__title">
            Built for teams whose absence planning has outgrown spreadsheets.
          </h1>
          <p className="marketing-simple__lead">
            Team Calendar is for organisations that trust Xero Payroll, but need
            a clearer way to publish availability to the people planning the
            week.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {customerTypes.map((type) => {
            const Icon = type.icon;
            return (
              <article className="marketing-simple__panel" key={type.title}>
                <div className="marketing-simple__icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h2>{type.title}</h2>
                <p>{type.copy}</p>
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
            <CalendarDays size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <h2 className="marketing-simple__section-title">
              Check whether your team fits.
            </h2>
            <p className="marketing-simple__section-copy">
              If your leave source is Xero Payroll and your team plans in shared
              calendars, Team Calendar is likely a good fit.
            </p>
            <p className="marketing-simple__section-copy">
              <Link className="marketing-simple__link" href="/contact">
                Talk to us about your organisation
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default CustomersPage;

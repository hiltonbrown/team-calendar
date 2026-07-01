import { createMetadata } from "@repo/seo/metadata";
import { Building2, CalendarDays, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = createMetadata({
  title: "Customers",
  description:
    "The Xero Payroll small businesses Team Calendar is built for, where leave admin has outgrown texts, forms and a shared calendar.",
});

const customerTypes = [
  {
    icon: Building2,
    title: "Small teams on Xero Payroll",
    copy: "5 to 30 staff, where one person carries the leave admin and every missed notification lands on them.",
  },
  {
    icon: CalendarDays,
    title: "Teams that live in calendars",
    copy: "People already in Outlook, Google Calendar or Apple Calendar, who will not adopt a separate planner to check.",
  },
  {
    icon: UserRoundCheck,
    title: "Mixed teams",
    copy: "Employees on payroll plus contractors, directors and advisors whose availability still matters, even when they are not in a pay run.",
  },
];

const CustomersPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Customers</p>
          <h1 className="marketing-simple__title">
            Built for small teams whose leave tracking has outgrown a
            spreadsheet.
          </h1>
          <p className="marketing-simple__lead">
            The Xero Payroll small businesses Team Calendar is built for, where
            leave admin has outgrown texts, forms and a shared calendar.
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
              Check whether your business fits.
            </h2>
            <p className="marketing-simple__section-copy">
              If you run Xero Payroll with roughly 5 to 30 staff, and your team
              plans in shared calendars, Team Calendar is likely a good fit.
            </p>
            <p className="marketing-simple__section-copy">
              <Link className="marketing-simple__link" href="/contact">
                Talk to us about your team
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default CustomersPage;

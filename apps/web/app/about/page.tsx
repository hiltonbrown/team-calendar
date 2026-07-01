import { brandNameDisplay } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import { CalendarCheck, MapPin, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = createMetadata({
  title: "About",
  description:
    "Team Calendar helps small businesses on Xero Payroll publish clear team availability to the calendars people already use, so leave stops slipping through texts, forms and memory.",
});

const principles = [
  {
    icon: CalendarCheck,
    title: "Calendars should stay current",
    copy: "Nobody should compare Xero, a spreadsheet, chat messages and a shared calendar just to know who is away.",
  },
  {
    icon: ShieldCheck,
    title: "Payroll stays the source of truth",
    copy: "Approved payroll leave stays anchored in Xero. Team Calendar adds the availability layer around it, including manual entries that do not belong in payroll.",
  },
  {
    icon: MapPin,
    title: "Built close to the teams using it",
    copy: "Made on the Gold Coast for small operators that need practical, careful tooling around real leave and payroll data.",
  },
];

const AboutPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">About</p>
          <h1 className="marketing-simple__title">
            Availability should be visible where work already happens.
          </h1>
          <p className="marketing-simple__lead">
            {brandNameDisplay} helps small businesses on Xero Payroll publish
            clear team availability to the calendars people already use, so
            leave stops slipping through texts, forms and memory.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__section-head">
          <h2 className="marketing-simple__section-title">
            A narrow product, by design.
          </h2>
          <p className="marketing-simple__section-copy">
            We are not replacing Xero Payroll, and we are not trying to become a
            full HR system. Team Calendar focuses on one job: turn trusted leave
            and availability records into a clear, privacy-controlled calendar
            view.
          </p>
        </div>
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {principles.map((principle) => {
            const Icon = principle.icon;
            return (
              <article
                className="marketing-simple__panel"
                key={principle.title}
              >
                <div className="marketing-simple__icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h2>{principle.title}</h2>
                <p>{principle.copy}</p>
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
            <ShieldCheck size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <h2 className="marketing-simple__section-title">
              Want to understand the product boundary?
            </h2>
            <p className="marketing-simple__section-copy">
              Read how Team Calendar connects Xero Payroll to Outlook, Google
              Calendar, and Apple Calendar, or talk to us about your setup.
            </p>
            <p className="marketing-simple__section-copy">
              <Link className="marketing-simple__link" href="/integrations">
                View the integration model
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default AboutPage;

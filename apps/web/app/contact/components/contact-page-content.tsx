import { CalendarDays, Clock, Layers3, Link2, Mail } from "lucide-react";
import {
  supportEmail,
  supportHoursLong,
  supportMailtoHref,
} from "@/src/data/support";

const pathway = [
  {
    copy: "Authorise Team Calendar for your Australian Xero Payroll organisation.",
    icon: Link2,
    title: "Connect Xero Payroll securely",
  },
  {
    copy: "See approved leave from Xero alongside manual availability in one view.",
    icon: Layers3,
    title: "Bring availability together",
  },
  {
    copy: "Subscribe in Outlook, Google Calendar, or Apple Calendar through secure calendar feeds.",
    icon: CalendarDays,
    title: "Publish to your team’s calendars",
  },
];

export const ContactPageContent = () => (
  <main className="fmkt-page marketing-simple marketing-contact">
    <section className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__grid marketing-simple__grid--two marketing-contact__grid">
          <div className="marketing-simple__intro">
            <h1 className="marketing-simple__title">Get in touch</h1>
            <p className="marketing-simple__lead">
              Talk to us about bringing leave and availability into the
              calendars your team already uses.
            </p>

            <ol
              aria-label="How Team Calendar connects payroll leave to team calendars"
              className="marketing-contact__pathway"
            >
              {pathway.map((step, index) => {
                const Icon = step.icon;

                return (
                  <li className="marketing-contact__step" key={step.title}>
                    <span className="marketing-contact__step-marker">
                      <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                    </span>
                    <div>
                      <span className="marketing-contact__step-number">
                        Step {index + 1}
                      </span>
                      <h2>{step.title}</h2>
                      <p>{step.copy}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <section
            aria-labelledby="contact-panel-title"
            className="marketing-simple__panel marketing-contact__panel"
          >
            <div className="marketing-contact__panel-copy">
              <h2
                className="marketing-contact__panel-title"
                id="contact-panel-title"
              >
                Early access contact and support
              </h2>
              <p className="marketing-contact__panel-lead">
                Team Calendar is in closed early access for Australian
                organisations using Xero Payroll. We respond to onboarding and
                technical enquiries directly.
              </p>
            </div>

            <div className="marketing-contact__action">
              <Mail aria-hidden="true" size={22} strokeWidth={1.8} />
              <a
                className="marketing-btn marketing-btn--primary marketing-contact__cta"
                href={supportMailtoHref}
              >
                Email our support team
              </a>
              <p className="marketing-contact__fallback">
                No email app? Write to{" "}
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              </p>
            </div>

            <dl className="marketing-contact__details">
              <div>
                <dt>
                  <Clock aria-hidden="true" size={18} strokeWidth={1.8} />
                  Response hours
                </dt>
                <dd>{supportHoursLong}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>Australian Xero Payroll organisations only.</dd>
              </div>
              <div>
                <dt>Pricing</dt>
                <dd>
                  Confirmed with your organisation before any future paid
                  billing.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </section>
  </main>
);

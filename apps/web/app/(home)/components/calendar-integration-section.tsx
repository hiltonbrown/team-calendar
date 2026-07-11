import Link from "next/link";
import { MarketingIcon } from "./marketing-icons";

const integrationPoints = [
  "Connect Xero Payroll Australia. New Zealand and United Kingdom support is planned.",
  "Publish secure feeds for Outlook, Google Calendar, and Apple Calendar.",
  "Keep approved leave and manual availability in one calendar view.",
];

export const CalendarIntegrationSection = () => (
  <section className="fmkt-integration-bridge" id="integrations">
    <div className="fmkt-container fmkt-integration-bridge__grid">
      <div>
        <h2 className="fmkt-section-title">
          Xero is the source. Calendars are where the team checks.
        </h2>
        <p className="fmkt-integration-bridge__lead">
          The full integration flow now lives in one place: what Team Calendar
          reads from Xero, what it writes back, and how secure ICS feeds reach
          the calendar apps your team already uses.
        </p>
      </div>
      <div className="fmkt-integration-bridge__panel">
        <ul>
          {integrationPoints.map((point) => (
            <li key={point}>
              <MarketingIcon id="check" size={16} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <Link
          className="marketing-btn marketing-btn--primary"
          href="/integrations"
        >
          View integrations
        </Link>
      </div>
    </div>
  </section>
);

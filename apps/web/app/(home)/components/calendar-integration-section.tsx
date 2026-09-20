import Link from "next/link";
import { integrationCapabilities } from "../../integrations/capabilities";
import { MarketingIcon } from "./marketing-icons";

const shippedRegions = integrationCapabilities.xeroPayrollRegions.filter(
  (region) => region.status === "shipped"
);

const plannedRegions = integrationCapabilities.xeroPayrollRegions.filter(
  (region) => region.status === "planned"
);

const shippedRegionNames = shippedRegions.map((region) => region.name);

const plannedRegionNames = plannedRegions.map((region) => region.name);

const calendarDestinationNames =
  integrationCapabilities.calendarDestinations.map(
    (destination) => destination.name
  );

const integrationPoints = [
  ...(shippedRegions.length > 0
    ? [
        {
          status: "shipped" as const,
          text: `Connect Xero Payroll ${shippedRegionNames.join(" and ")}.`,
        },
      ]
    : []),
  ...(plannedRegions.length > 0
    ? [
        {
          status: "planned" as const,
          text: `${plannedRegionNames.join(" and ")} Xero Payroll support.`,
        },
      ]
    : []),
  {
    status: "shipped" as const,
    text: `Publish secure feeds for ${calendarDestinationNames
      .slice(0, -1)
      .join(", ")}, and ${calendarDestinationNames.at(-1)}.`,
  },
  {
    status: "shipped" as const,
    text: "Keep approved leave and manual availability in one calendar view.",
  },
];

export const CalendarIntegrationSection = () => (
  <section className="fmkt-integration-bridge" id="integrations">
    <div className="fmkt-container fmkt-integration-bridge__grid">
      <div>
        <h2 className="fmkt-section-title">
          Sync Xero leave to Outlook Calendar.
        </h2>
        <p className="fmkt-integration-bridge__lead">
          Team Calendar synchronises approved leave from Xero Payroll to Outlook
          Calendar through a secure calendar subscription. See who’s away
          alongside your meetings, with support for Google Calendar and Apple
          Calendar too.
        </p>
      </div>
      <div className="fmkt-integration-bridge__panel">
        <ul>
          {integrationPoints.map((point) => (
            <li data-status={point.status} key={point.text}>
              {point.status === "shipped" ? (
                <MarketingIcon id="check" size={16} />
              ) : (
                <span className="fmkt-integration-bridge__badge">
                  Coming soon
                </span>
              )}
              <span>{point.text}</span>
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

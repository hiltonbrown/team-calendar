"use client";

import { useCallback, useEffect, useState } from "react";
import { MarketingIcon } from "./marketing-icons";

interface Destination {
  handle: string;
  iconId: "outlook" | "gcal" | "applecal";
  id: string;
  name: string;
  steps: string;
}

const DESTINATIONS: Destination[] = [
  {
    id: "outlook",
    name: "Outlook",
    iconId: "outlook",
    handle: "Calendar in Microsoft 365",
    steps:
      "Open Calendar, choose Add calendar, then Subscribe from web. Paste the URL and save.",
  },
  {
    id: "gcal",
    name: "Google Calendar",
    iconId: "gcal",
    handle: "Calendar in Google Workspace",
    steps:
      "Open Settings, pick Add calendar, then From URL. Paste the URL and add.",
  },
  {
    id: "applecal",
    name: "Apple Calendar",
    iconId: "applecal",
    handle: "Calendar on macOS and iOS",
    steps:
      "Choose File, then New Calendar Subscription. Paste the URL and select an account.",
  },
];

const feedUrl =
  "https://teamcalendar.online/feeds/teams/8a3f4d2c-9b71-44e2/team-availability.ics";

const FlowArrow = () => (
  <svg
    aria-hidden="true"
    className="ci-flow__arrow"
    fill="none"
    height={20}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
    width={20}
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const CalendarIntegrationSection = () => {
  const [activeId, setActiveId] = useState<string>("outlook");
  const [copied, setCopied] = useState<boolean>(false);

  const active = DESTINATIONS.find((d) => d.id === activeId) ?? DESTINATIONS[0];

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(feedUrl);
      }
    } catch {
      // Clipboard may be unavailable in some environments, that is ok
    }
    setCopied(true);
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (index + 1) % DESTINATIONS.length;
        const nextDest = DESTINATIONS[nextIndex];
        if (nextDest) {
          setActiveId(nextDest.id);
          const buttons =
            document.querySelectorAll<HTMLButtonElement>(".ci-tabs .ci-tab");
          buttons[nextIndex]?.focus();
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          (index - 1 + DESTINATIONS.length) % DESTINATIONS.length;
        const prevDest = DESTINATIONS[prevIndex];
        if (prevDest) {
          setActiveId(prevDest.id);
          const buttons =
            document.querySelectorAll<HTMLButtonElement>(".ci-tabs .ci-tab");
          buttons[prevIndex]?.focus();
        }
      }
    },
    []
  );

  return (
    <section className="fmkt-integration" id="calendar-integrations">
      <div className="fmkt-container">
        <h2 className="fmkt-section-title">
          The same feed, inside the calendar app{" "}
          <em>your team already uses.</em>
        </h2>
        <p className="fmkt-timeline__lead">
          Approved leave from Xero and manual entries publish to a single secure
          feed. Subscribe once in Outlook, Google Calendar or Apple Calendar.
          Every change re-flows on the next refresh, with nothing to install.
        </p>

        <div
          aria-label="Calendar destination"
          className="ci-tabs"
          role="tablist"
        >
          {DESTINATIONS.map((d, index) => (
            <button
              aria-controls={`calendar-destination-panel-${d.id}`}
              aria-selected={activeId === d.id}
              className={`ci-tab ${activeId === d.id ? "is-active" : ""}`}
              id={`calendar-destination-tab-${d.id}`}
              key={d.id}
              onClick={() => setActiveId(d.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              role="tab"
              tabIndex={activeId === d.id ? 0 : -1}
              type="button"
            >
              <MarketingIcon id={d.iconId} size={16} />
              {d.name}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`calendar-destination-tab-${active.id}`}
          className="ci-card"
          id={`calendar-destination-panel-${active.id}`}
          role="tabpanel"
        >
          <div className="ci-flow">
            <div className="ci-flow__step ci-flow__step--primary">
              <div className="ci-flow__head">
                <span aria-hidden="true" className="ci-flow__icon">
                  <MarketingIcon id="link" size={17} />
                </span>
                <span className="ci-flow__label">Copy the team feed URL</span>
              </div>
              <div className="ci-flow__url-row">
                <span className="ci-flow__url" title={feedUrl}>
                  {feedUrl}
                </span>
                <button
                  aria-live="polite"
                  className={`ci-copy-btn ${copied ? "is-copied" : ""}`}
                  onClick={handleCopy}
                  type="button"
                >
                  <MarketingIcon id={copied ? "check" : "copy"} size={14} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <span className="ci-flow__hint">
                Secure, revocable link · one per team
              </span>
            </div>

            <FlowArrow />

            <div className="ci-flow__step">
              <div className="ci-flow__head">
                <span aria-hidden="true" className="ci-flow__icon">
                  <MarketingIcon id={active.iconId} size={17} />
                </span>
                <span className="ci-flow__label">Add it to {active.name}</span>
              </div>
              <span className="ci-flow__copy">{active.steps}</span>
              <span className="ci-flow__hint">{active.handle}</span>
            </div>

            <FlowArrow />

            <div className="ci-flow__step">
              <div className="ci-flow__head">
                <span aria-hidden="true" className="ci-flow__icon">
                  <MarketingIcon id="sync" size={17} />
                </span>
                <span className="ci-flow__label">It stays current</span>
              </div>
              <span className="ci-flow__copy">
                Updates every 15 minutes. Nothing to install, and you can revoke
                or rotate the link any time.
              </span>
              <span className="ci-flow__hint">
                <span aria-hidden="true" className="ci-flow__pulse" />
                Live · last refresh 2 min ago
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

"use client";

import { useState } from "react";
import { MarketingIcon } from "./marketing-icons";

const calendarApps = [
  {
    id: "outlook",
    name: "Outlook",
    icon: "outlook",
    accentClass: "fmkt-integration-app--outlook",
    instruction: "Subscribe to the team feed from Outlook calendar settings.",
  },
  {
    id: "google",
    name: "Google",
    icon: "gcal",
    accentClass: "fmkt-integration-app--google",
    instruction:
      "Add the secure URL as a subscribed calendar in Google Calendar.",
  },
  {
    id: "apple",
    name: "Apple",
    icon: "applecal",
    accentClass: "fmkt-integration-app--apple",
    instruction:
      "Paste the feed into Apple Calendar and choose refresh cadence.",
  },
] as const;

const feedUrl = "https://feeds.leavesync.app/ical/team-ops.ics";

export const CalendarIntegrationSection = () => {
  const [activeApp, setActiveApp] =
    useState<(typeof calendarApps)[number]["id"]>("outlook");
  const [copied, setCopied] = useState(false);

  const selected =
    calendarApps.find((app) => app.id === activeApp) ?? calendarApps[0];

  const copyFeedUrl = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(feedUrl);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="fmkt-integration" id="calendar-integrations">
      <div className="fmkt-container fmkt-integration__grid">
        <div className="fmkt-integration__demo">
          <div className="fmkt-integration__feed">
            <div className="fmkt-integration__feed-top">
              <span className="fmkt-integration__lock">
                <MarketingIcon id="lock" size={18} />
              </span>
              <div>
                <strong>Team availability feed</strong>
                <span>Revocable secure calendar subscription</span>
              </div>
            </div>
            <code>{feedUrl}</code>
            <button
              className="fmkt-integration__copy"
              onClick={copyFeedUrl}
              type="button"
            >
              <MarketingIcon id={copied ? "check" : "copy"} size={16} />
              {copied ? "Copied" : "Copy feed URL"}
            </button>
          </div>

          <div className="fmkt-integration__apps" role="tablist">
            {calendarApps.map((app) => (
              <button
                aria-selected={app.id === activeApp}
                className={`fmkt-integration-app ${app.accentClass}`}
                key={app.id}
                onClick={() => setActiveApp(app.id)}
                role="tab"
                type="button"
              >
                <MarketingIcon id={app.icon} size={20} />
                <span>{app.name}</span>
              </button>
            ))}
          </div>

          <div className="fmkt-integration__preview">
            <div className="fmkt-integration__preview-top">
              <span
                className={`fmkt-integration__preview-icon ${selected.accentClass}`}
              >
                <MarketingIcon id={selected.icon} size={18} />
              </span>
              <div>
                <strong>{selected.name} calendar</strong>
                <span>{selected.instruction}</span>
              </div>
            </div>
            <div className="fmkt-integration__mini-calendar">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                <span className="fmkt-integration__mini-day" key={day}>
                  {day}
                </span>
              ))}
              <span className="fmkt-integration__mini-event fmkt-integration__mini-event--leave">
                Samira out
              </span>
              <span className="fmkt-integration__mini-event fmkt-integration__mini-event--wfh">
                Alex WFH
              </span>
              <span className="fmkt-integration__mini-event fmkt-integration__mini-event--training">
                Jordan training
              </span>
            </div>
          </div>
        </div>

        <div className="fmkt-integration__copy-block">
          <p className="fmkt-overline">Calendar integrations</p>
          <h2 className="fmkt-section-title">
            Publish availability where planning already happens.
          </h2>
          <p>
            LeaveSync produces standards-based ICS feeds for Outlook, Google
            Calendar, and Apple Calendar. Staff subscribe once, then approved
            leave and manual availability keep appearing without exports.
          </p>
          <ul className="fmkt-integration__checks">
            <li>
              <MarketingIcon id="shield" size={18} />
              Revocable links, not public calendars
            </li>
            <li>
              <MarketingIcon id="sync" size={18} />
              Automatic refresh as records change
            </li>
            <li>
              <MarketingIcon id="leaf" size={18} />
              Xero and manual availability in one feed
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};

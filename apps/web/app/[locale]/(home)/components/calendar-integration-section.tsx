"use client";

import { addDays, format, isToday, startOfWeek } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { MarketingIcon } from "./marketing-icons";

interface Destination {
  handle: string;
  iconId: "outlook" | "gcal" | "applecal";
  id: string;
  name: string;
  steps: string;
}

interface EventItem {
  icon: "leaf" | "home" | "briefcase";
  sub?: string;
  title: string;
  tone: "sage" | "purple";
}

interface DayData {
  dow: string;
  events: EventItem[];
  meetings: number;
  monthName?: string;
  num: number;
  today: boolean;
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

const DAYS: DayData[] = [
  {
    dow: "Mon",
    num: 18,
    monthName: "May",
    today: false,
    meetings: 2,
    events: [
      { tone: "sage", icon: "leaf", title: "James · Annual leave" },
      {
        tone: "purple",
        icon: "briefcase",
        title: "Patrick · Client visit",
        sub: "Sydney",
      },
      { tone: "purple", icon: "home", title: "Sarah · Working from home" },
      { tone: "purple", icon: "home", title: "Daniel · Working from home" },
    ],
  },
  {
    dow: "Tue",
    num: 19,
    monthName: "May",
    today: false,
    meetings: 3,
    events: [
      { tone: "sage", icon: "leaf", title: "James · Annual leave" },
      {
        tone: "purple",
        icon: "briefcase",
        title: "Patrick · Client visit",
        sub: "Sydney",
      },
      { tone: "purple", icon: "home", title: "Sarah · Working from home" },
      { tone: "purple", icon: "home", title: "Daniel · Working from home" },
    ],
  },
  {
    dow: "Wed",
    num: 20,
    monthName: "May",
    today: false,
    meetings: 2,
    events: [
      { tone: "sage", icon: "leaf", title: "James · Annual leave" },
      { tone: "sage", icon: "leaf", title: "Sarah · Annual leave" },
      {
        tone: "purple",
        icon: "briefcase",
        title: "Daniel · Client visit",
        sub: "Brisbane",
      },
      { tone: "purple", icon: "home", title: "Mia · Working from home" },
    ],
  },
  {
    dow: "Thu",
    num: 21,
    monthName: "May",
    today: true,
    meetings: 1,
    events: [
      { tone: "sage", icon: "leaf", title: "James · Annual leave" },
      { tone: "sage", icon: "leaf", title: "Sarah · Annual leave" },
      {
        tone: "purple",
        icon: "briefcase",
        title: "Ruben · Client visit",
        sub: "Melbourne",
      },
      { tone: "purple", icon: "home", title: "Mia · Working from home" },
    ],
  },
  {
    dow: "Fri",
    num: 22,
    monthName: "May",
    today: false,
    meetings: 2,
    events: [
      { tone: "sage", icon: "leaf", title: "James · Annual leave" },
      { tone: "sage", icon: "leaf", title: "Sarah · Annual leave" },
      { tone: "purple", icon: "home", title: "Daniel · Working from home" },
      { tone: "purple", icon: "home", title: "Mia · Working from home" },
    ],
  },
  {
    dow: "Sat",
    num: 23,
    monthName: "May",
    today: false,
    meetings: 0,
    events: [],
  },
  {
    dow: "Sun",
    num: 24,
    monthName: "May",
    today: false,
    meetings: 0,
    events: [],
  },
];
const feedUrl =
  "https://leavesync.app/feeds/teams/8a3f4d2c-9b71-44e2/team-availability.ics";

export const CalendarIntegrationSection = () => {
  const [days, setDays] = useState<DayData[]>(DAYS);
  const [activeId, setActiveId] = useState<string>("outlook");
  const [copied, setCopied] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  const active = DESTINATIONS.find((d) => d.id === activeId) ?? DESTINATIONS[0];

  const handleCopy = useCallback(async () => {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
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

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    const mondayThisWeek = startOfWeek(today, { weekStartsOn: 1 });

    const updatedDays = DAYS.map((d, index) => {
      const date = addDays(mondayThisWeek, index);
      return {
        ...d,
        num: date.getDate(),
        monthName: format(date, "MMM"),
        today: isToday(date),
      };
    });

    setDays(updatedDays);
  }, []);

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

  const mon = days[0];
  const sun = days[6];
  let dateRangeLabel = "18 to 24 May";
  if (mon && sun) {
    if (mon.monthName === sun.monthName) {
      dateRangeLabel = `${mon.num} to ${sun.num} ${mon.monthName}`;
    } else {
      dateRangeLabel = `${mon.num} ${mon.monthName} to ${sun.num} ${sun.monthName}`;
    }
  }

  if (!mounted) {
    return (
      <section className="fmkt-integration" id="calendar-integrations">
        <div className="fmkt-container">
          <p className="fmkt-overline">Calendar subscriptions</p>
          <h2 className="fmkt-section-title">
            The same feed, inside the calendar app your team already uses.
          </h2>
          <p className="fmkt-timeline__lead">
            Approved leave from Xero and manual entries publish to a single
            secure feed. Subscribe once in Outlook, Google Calendar or Apple
            Calendar. Every change re-flows on the next refresh, with nothing to
            install.
          </p>

          <div
            aria-label="Calendar destination"
            className="ci-tabs"
            role="tablist"
          >
            {DESTINATIONS.map((d) => (
              <button
                className={`ci-tab ${activeId === d.id ? "is-active" : ""}`}
                disabled
                key={d.id}
                type="button"
              >
                <MarketingIcon id={d.iconId} size={16} />
                {d.name}
              </button>
            ))}
          </div>

          <div className="ci-card ci-card--skeleton">
            <div className="ci-card__head">
              <div className="ci-card__head-l">
                <div
                  aria-hidden="true"
                  className="ci-card__head-icon"
                  style={{ background: "var(--surface-container-high)" }}
                />
                <div>
                  <div
                    style={{
                      width: 150,
                      height: 14,
                      background: "var(--surface-container-high)",
                      borderRadius: 4,
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  <div
                    style={{
                      width: 100,
                      height: 10,
                      background: "var(--surface-container-high)",
                      borderRadius: 4,
                      marginTop: 6,
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              className="ci-week"
              style={{ gridTemplateColumns: "repeat(7, 1fr)", opacity: 0.5 }}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div className="ci-day" key={i}>
                  <div className="ci-day__head">
                    <span
                      style={{
                        width: 25,
                        height: 10,
                        background: "var(--surface-container-high)",
                        borderRadius: 2,
                        display: "inline-block",
                        animation: "pulse 1.5s infinite",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="ci-card__foot">
              <div
                aria-hidden="true"
                className="ci-foot-icon"
                style={{ background: "var(--surface-container-high)" }}
              />
              <div className="ci-feed">
                <div
                  style={{
                    width: 120,
                    height: 10,
                    background: "var(--surface-container-high)",
                    borderRadius: 2,
                    animation: "pulse 1.5s infinite",
                  }}
                />
                <div
                  style={{
                    width: 240,
                    height: 12,
                    background: "var(--surface-container-high)",
                    borderRadius: 2,
                    marginTop: 6,
                    animation: "pulse 1.5s infinite",
                  }}
                />
              </div>
            </div>
            <div className="ci-card__instruction" style={{ opacity: 0.6 }}>
              <span className="ci-instruction__label">
                To subscribe in {active.name}:
              </span>
              <div
                style={{
                  width: 220,
                  height: 12,
                  background: "var(--surface-container-high)",
                  borderRadius: 4,
                  animation: "pulse 1.5s infinite",
                }}
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="fmkt-integration" id="calendar-integrations">
      <div className="fmkt-container">
        <p className="fmkt-overline">Calendar subscriptions</p>
        <h2 className="fmkt-section-title">
          The same feed, inside the calendar app your team already uses.
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
              aria-selected={activeId === d.id}
              className={`ci-tab ${activeId === d.id ? "is-active" : ""}`}
              key={d.id}
              onClick={() => setActiveId(d.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              role="tab"
              type="button"
            >
              <MarketingIcon id={d.iconId} size={16} />
              {d.name}
            </button>
          ))}
        </div>

        <div className="ci-card">
          <div className="ci-card__head">
            <div className="ci-card__head-l">
              <div aria-hidden="true" className="ci-card__head-icon">
                <MarketingIcon id={active.iconId} size={20} />
              </div>
              <div>
                <div className="ci-card__title">
                  Team availability · {active.name}
                </div>
                <div className="ci-card__sub">
                  {active.handle} · subscribed feed
                </div>
              </div>
            </div>
            <div className="ci-refresh-chip">
              <span aria-hidden="true" className="ci-refresh-chip__dot" />
              Updates every 15 min
            </div>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: custom grid used for calendar view */}
          <div
            aria-label={`Week ${dateRangeLabel} in ${active.name}`}
            className="ci-week"
            role="grid"
            style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {days.map((d) => (
              /* biome-ignore lint/a11y/useFocusableInteractive: day cell is non-interactive container */
              /* biome-ignore lint/a11y/useSemanticElements: day cells use gridcell role in layout */
              <div
                /* biome-ignore lint/nursery/useSortedClasses: ignore dynamic class order check */
                className={`ci-day${d.today ? " ci-day--today" : ""}`}
                key={d.dow}
                role="gridcell"
              >
                <div className="ci-day__head">
                  <span className="ci-day__dow">{d.dow}</span>
                  <span className="ci-day__num">{d.num}</span>
                  {d.today && <span className="ci-day__today-pill">Today</span>}
                </div>
                <div className="ci-day__events">
                  {d.events.map((e, i) => {
                    return (
                      <div
                        className={`ci-event ci-event--${e.tone}`}
                        /* biome-ignore lint/suspicious/noArrayIndexKey: order of events is static */
                        key={i}
                        title={e.sub ? `${e.title} - ${e.sub}` : e.title}
                      >
                        <span aria-hidden="true" className="ci-event__icon">
                          <MarketingIcon id={e.icon} size={12} />
                        </span>
                        <span className="ci-event__label">
                          {e.title}
                          {e.sub && (
                            <span className="ci-event__sub"> · {e.sub}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="ci-day__more">
                  + {d.meetings} meeting{d.meetings === 1 ? "" : "s"} on this
                  day
                </div>
              </div>
            ))}
          </div>

          <div className="ci-card__foot">
            <div aria-hidden="true" className="ci-foot-icon">
              <MarketingIcon id="lock" size={18} />
            </div>
            <div className="ci-feed">
              <div className="ci-feed__label">Team feed URL · revocable</div>
              <div className="ci-feed__url" title={feedUrl}>
                {feedUrl}
              </div>
            </div>
            <button
              aria-live="polite"
              className={`ci-copy-btn${copied ? "is-copied" : ""}`}
              onClick={handleCopy}
              type="button"
            >
              <MarketingIcon id={copied ? "check" : "copy"} size={14} />
              {copied ? "Copied" : "Copy URL"}
            </button>
          </div>

          {/* Colocated subscription instructions inside the card */}
          <div className="ci-card__instruction">
            <span className="ci-instruction__label">
              To subscribe in {active.name}:
            </span>
            <span className="ci-instruction__copy">{active.steps}</span>
          </div>
        </div>
      </div>
    </section>
  );
};

"use client";

import { useEffect, useRef, useState } from "react";
import { MarketingIcon } from "../(home)/components/marketing-icons";
import styles from "./integrations.module.css";

const connections = [
  {
    boundary: "Salary, banking, tax and superannuation data are never read.",
    detail:
      "Employees, approved leave and balances sync from Xero. Leave requests and decisions sync back.",
    icon: "sync",
    label: "Payroll source of truth",
    title: "Xero Payroll",
  },
  {
    boundary: "Manual availability stays separate from payroll leave.",
    detail:
      "Staff request leave and share travel, WFH and other availability updates in one place.",
    icon: "calendar",
    label: "Leave + everyday availability",
    title: "Team Calendar",
  },
  {
    boundary:
      "Calendar apps refresh on their own schedules. Personal calendar contents are never read.",
    detail:
      "Approved leave and availability updates appear in Outlook, Google Calendar and Apple Calendar through secure subscriptions.",
    icon: "link",
    label: "Outlook · Google · Apple",
    title: "Your calendars",
  },
] as const;

export function ConnectionMap() {
  const [selected, setSelected] = useState(0);
  return (
    <div className={styles.connectionMap}>
      <fieldset
        aria-label="Explore the integration connections"
        className={styles.nodes}
      >
        {connections.map((connection, index) => (
          <button
            aria-controls="connection-detail"
            aria-pressed={selected === index}
            className={styles.node}
            key={connection.title}
            onClick={() => setSelected(index)}
            type="button"
          >
            <span className={styles.nodeIcon}>
              <MarketingIcon id={connection.icon} size={30} />
            </span>
            <strong>{connection.title}</strong>
            <span>{connection.label}</span>
            {index < 2 && (
              <span aria-hidden="true" className={styles.connector}>
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 40 24"
                >
                  <path d="M2 12h34m-7-7 7 7-7 7" />
                  {index === 0 && <path d="m10 5-7 7 7 7" />}
                </svg>
              </span>
            )}
          </button>
        ))}
      </fieldset>
      <div
        aria-live="polite"
        className={styles.connectionDetail}
        id="connection-detail"
      >
        <p>{connections[selected].detail}</p>
        <p>
          <MarketingIcon id="shieldCheck" size={18} />
          {connections[selected].boundary}
        </p>
      </div>
      <p className={styles.interactionHint}>
        Select a system to explore what it shares.
      </p>
    </div>
  );
}

const chapters = [
  {
    copy: "Alex requests annual leave in Team Calendar. The request writes to Xero as part of submission, ready for a manager’s decision.",
    detail: "Alex Morgan · Annual leave · 21–23 September",
    icon: "calendar",
    status: "Leave submitted",
    title: "A leave request starts with your team.",
  },
  {
    copy: "A manager approves Alex’s request. Team Calendar writes that decision to Xero synchronously. If the write fails, the manager sees an error to resolve.",
    detail: "Manager approval written to Xero",
    icon: "checkCircle",
    status: "Leave approved",
    title: "The decision goes back to payroll.",
  },
  {
    copy: "Approved leave joins WFH, travel and other availability in your secure calendar feeds. Your calendar app picks up the changes when it next refreshes its subscription.",
    detail: "Approved leave alongside manual availability",
    icon: "link",
    status: "Ready for calendar subscription",
    title: "Your team sees the whole picture.",
  },
] as const;
const filters = [
  "All availability",
  "Approved leave",
  "Manual availability",
] as const;
type CalendarFilter = (typeof filters)[number];
const publishedDescriptions = {
  "All availability":
    "3 example entries: approved leave and manual availability.",
  "Approved leave": "1 example entry: approved leave synced with Xero.",
  "Manual availability":
    "2 example entries: manual availability, separate from payroll.",
};
const pendingDescriptions = {
  "All availability":
    "2 example entries: manual availability. Alex’s leave is not published yet.",
  "Approved leave": "No published leave entries at this stage of the example.",
  "Manual availability":
    "2 example entries: manual availability, separate from payroll.",
};
const days = ["Mon 21", "Tue 22", "Wed 23", "Thu 24", "Fri 25"];

export function IntegrationJourney() {
  const root = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState(0);
  const [filter, setFilter] = useState<CalendarFilter>("All availability");
  const filterDescriptions =
    chapter === 2 ? publishedDescriptions : pendingDescriptions;
  useEffect(() => {
    const sections =
      root.current?.querySelectorAll<HTMLElement>("[data-chapter]");
    if (!(sections && "IntersectionObserver" in window)) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            setChapter(Number(entry.target.dataset.chapter));
          }
        }
      },
      { rootMargin: "-20% 0px -45% 0px", threshold: 0 }
    );
    for (const section of sections) {
      observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  return (
    <section
      aria-label="From leave request to calendar"
      className={styles.journey}
    >
      <div className={`fmkt-container ${styles.journeyGrid}`} ref={root}>
        <div className={styles.chapters}>
          {chapters.map((item, index) => (
            <article
              className={styles.chapter}
              data-active={chapter === index}
              data-chapter={index}
              key={item.title}
            >
              <h2>{item.title}</h2>
              <p>{item.copy}</p>
              <a
                className="marketing-content-link"
                href="#availability-example"
              >
                Explore the calendar example
              </a>
            </article>
          ))}
        </div>
        <div className={styles.stickyDemo}>
          <div className={styles.demoHeading}>
            <span>From request to shared visibility</span>
            <span>Illustrative example</span>
          </div>
          <fieldset
            aria-label="Leave journey stage"
            className={styles.progress}
          >
            {chapters.map((item, index) => (
              <button
                aria-pressed={chapter === index}
                key={item.status}
                onClick={() => setChapter(index)}
                type="button"
              >
                <span>{index + 1}</span>
                {["Request", "Approve", "Publish"][index]}
              </button>
            ))}
          </fieldset>
          <div
            aria-live="polite"
            className={styles.requestState}
            data-stage={chapter}
          >
            <MarketingIcon id={chapters[chapter].icon} size={26} />
            <div>
              <strong>{chapters[chapter].status}</strong>
              <p>{chapters[chapter].detail}</p>
            </div>
          </div>
          <div className={styles.calendarDemo} id="availability-example">
            <div className={styles.calendarHeading}>
              <h3>Your team’s week</h3>
              <span>21–25 September 2026</span>
            </div>
            <fieldset
              aria-label="Filter calendar example"
              className={styles.filters}
            >
              {filters.map((item) => (
                <button
                  aria-controls="example-events"
                  aria-pressed={filter === item}
                  key={item}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </fieldset>
            <div className={styles.week} id="example-events">
              {days.map((day) => (
                <div className={styles.day} key={day}>
                  {day}
                </div>
              ))}
              {filter !== "Manual availability" && chapter === 2 && (
                <div className={styles.leaveEvent}>
                  <MarketingIcon id="checkCircle" size={16} />
                  <strong>Alex · Annual leave</strong>
                  <span>Approved · Xero</span>
                </div>
              )}
              {filter !== "Manual availability" && chapter < 2 && (
                <p className={styles.pendingEvent}>
                  {chapter === 0
                    ? "Alex’s request is awaiting approval. No leave event is published."
                    : "Alex’s leave is approved. Feed publication is the next step."}
                </p>
              )}
              {filter !== "Approved leave" && (
                <>
                  <div className={styles.wfhEvent}>
                    <MarketingIcon id="home" size={16} />
                    <strong>Sam · WFH</strong>
                    <span>Manual availability</span>
                  </div>
                  <div className={styles.travelEvent}>
                    <MarketingIcon id="briefcase" size={16} />
                    <strong>Jo · Client visit</strong>
                    <span>Manual availability</span>
                  </div>
                </>
              )}
            </div>
            <p aria-live="polite" className={styles.calendarNote}>
              {filterDescriptions[filter]}
            </p>
          </div>
          <p className={styles.demoFootnote}>
            Example of the published week, not a live sync. Calendar apps
            control when subscription changes appear.
          </p>
        </div>
      </div>
    </section>
  );
}

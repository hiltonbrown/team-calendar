"use client";

import { useState } from "react";
import { MarketingIcon } from "../(home)/components/marketing-icons";
import styles from "./integrations.module.css";

const connections = [
  {
    boundary: "Salary, banking, tax and superannuation data are never read.",
    detail:
      "Employees, approved leave and balances sync from Xero. Leave requests and decisions sync back.",
    icon: "sync",
    label: "Xero available · More connections planned",
    title: "Connected payroll",
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
      "See approved annual leave, unexpected sick leave and everyday availability in Outlook through a secure subscription. Google Calendar and Apple Calendar are supported too.",
    icon: "link",
    label: "Planned and unplanned leave",
    title: "Outlook",
  },
] as const;

export function ConnectionMap() {
  const [selected, setSelected] = useState(2);
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

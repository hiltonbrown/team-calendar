"use client";

import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { integrationCapabilities } from "./capabilities";
import styles from "./data-exchange.module.css";

const directions = [
  {
    id: "read",
    items: integrationCapabilities.inboundDataCategories.map(
      (item) => item.name
    ),
    route: "Xero to Team Calendar",
    title: "Reads from Xero",
  },
  {
    id: "write",
    items: [
      "Leave applications submitted in Team Calendar",
      "Manager approval and decline decisions",
      "Leave application status updates",
    ],
    route: "Team Calendar to Xero",
    title: "Writes to Xero",
  },
] as const;

type Direction = (typeof directions)[number]["id"];

export function DataExchange() {
  const [selected, setSelected] = useState<Direction>("read");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className={styles.section}>
      <div className="fmkt-container">
        <div className={styles.heading}>
          <h2 className="fmkt-section-title" id={`${id}-title`}>
            What moves between systems.
          </h2>
          <p>
            Xero remains the source for payroll records and leave balances. Team
            Calendar sends leave requests and decisions back to Xero, and shares
            availability with your team’s calendars.
          </p>
        </div>
        <div className={styles.exchange} data-direction={selected}>
          <div aria-hidden="true" className={styles.diagram}>
            <div className={styles.system}>
              <span className={styles.systemMark}>Xero</span>
              <strong>Xero Payroll</strong>
              <span>Payroll source of truth</span>
            </div>
            <svg
              aria-hidden="true"
              className={styles.paths}
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 500 180"
            >
              <path
                className={styles.track}
                d="M0 90 C100 90 90 42 180 42 H320 C410 42 400 90 500 90"
                vectorEffect="non-scaling-stroke"
              />
              <path
                className={styles.track}
                d="M500 90 C400 90 410 138 320 138 H180 C90 138 100 90 0 90"
                vectorEffect="non-scaling-stroke"
              />
              <g className={styles.readPath}>
                <path
                  d="M0 90 C100 90 90 42 180 42 H320 C410 42 400 90 500 90"
                  vectorEffect="non-scaling-stroke"
                />
                <path d="m252 34 8 8-8 8" vectorEffect="non-scaling-stroke" />
              </g>
              <g className={styles.writePath}>
                <path
                  d="M500 90 C400 90 410 138 320 138 H180 C90 138 100 90 0 90"
                  vectorEffect="non-scaling-stroke"
                />
                <path d="m248 130-8 8 8 8" vectorEffect="non-scaling-stroke" />
              </g>
              <path
                className={styles.trace}
                d={
                  selected === "read"
                    ? "M0 90 C100 90 90 42 180 42 H320 C410 42 400 90 500 90"
                    : "M500 90 C400 90 410 138 320 138 H180 C90 138 100 90 0 90"
                }
                key={selected}
                pathLength="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                className={styles.pathLabel}
                fill="currentColor"
                textAnchor="middle"
                x="250"
                y="23"
              >
                Reads
              </text>
              <text
                className={styles.pathLabel}
                fill="currentColor"
                textAnchor="middle"
                x="250"
                y="172"
              >
                Writes
              </text>
            </svg>
            <div className={styles.system}>
              <span className={`${styles.systemMark} ${styles.calendarMark}`}>
                <span />
                <span />
                <span />
              </span>
              <strong>Team Calendar</strong>
              <span>Leave requests and decisions</span>
            </div>
          </div>
          <p className={styles.instruction}>
            Select a direction to trace the connection.
          </p>
          <div className={styles.directions}>
            {directions.map((direction) => (
              <div
                className={styles.direction}
                data-active={selected === direction.id}
                key={direction.id}
              >
                <button
                  aria-controls={`${id}-${direction.id}-records`}
                  aria-pressed={selected === direction.id}
                  className={styles.control}
                  onClick={() => setSelected(direction.id)}
                  type="button"
                >
                  {direction.id === "read" ? (
                    <ArrowRight aria-hidden="true" size={22} />
                  ) : (
                    <ArrowLeft aria-hidden="true" size={22} />
                  )}
                  <span>{direction.title}</span>
                  <Check
                    aria-hidden="true"
                    className={styles.selectedMark}
                    size={18}
                  />
                </button>
                <p className={styles.route}>{direction.route}</p>
                <ul id={`${id}-${direction.id}-records`}>
                  {direction.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <aside aria-labelledby={`${id}-privacy`} className={styles.privacy}>
          <div className={styles.privacyHeading}>
            <ShieldCheck aria-hidden="true" size={28} />
            <div>
              <h3 id={`${id}-privacy`}>Never reads</h3>
              <p>Outside the connection</p>
            </div>
          </div>
          <ul>
            <li>Salary, banking, tax, or superannuation data</li>
            <li>Personal calendar contents</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

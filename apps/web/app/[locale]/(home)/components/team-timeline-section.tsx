"use client";

import { useMemo, useState } from "react";
import { MarketingIcon } from "./marketing-icons";

const people = [
  { initials: "SM", name: "Samira", tone: "sage" },
  { initials: "AL", name: "Alex", tone: "mauve" },
  { initials: "JR", name: "Jordan", tone: "cream" },
  { initials: "MC", name: "Mia", tone: "ink" },
] as const;

const days = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16"] as const;

const timelineItems = [
  {
    id: "request",
    title: "Leave requested",
    copy: "Samira adds annual leave once, with dates and manager context.",
    meta: "8:42 am",
    icon: "calendar",
    eventLabel: "Annual leave",
    person: "SM",
    range: [1, 4],
    state: "Draft",
  },
  {
    id: "approval",
    title: "Manager approves",
    copy: "The request is reviewed against team coverage before it reaches payroll.",
    meta: "9:15 am",
    icon: "checkCircle",
    eventLabel: "Approved leave",
    person: "SM",
    range: [1, 4],
    state: "Approved",
  },
  {
    id: "publish",
    title: "Calendars publish",
    copy: "The team feed refreshes and connected calendars show who is out.",
    meta: "9:17 am",
    icon: "sync",
    eventLabel: "Published",
    person: "SM",
    range: [1, 4],
    state: "Live feed",
  },
] as const;

export const TeamTimelineSection = () => {
  const [activeId, setActiveId] =
    useState<(typeof timelineItems)[number]["id"]>("approval");

  const activeItem = useMemo(
    () =>
      timelineItems.find((item) => item.id === activeId) ?? timelineItems[1],
    [activeId]
  );

  return (
    <section className="fmkt-timeline" id="team-timeline">
      <div className="fmkt-container fmkt-timeline__grid">
        <div className="fmkt-timeline__copy">
          <p className="fmkt-overline">Team timeline</p>
          <h2 className="fmkt-section-title">
            See the week change as leave moves from request to calendar.
          </h2>
          <p className="fmkt-timeline__lead">
            The operational view shows status, coverage, and the published
            calendar result together. Managers can tell what changed without
            opening another tool.
          </p>
          <div className="fmkt-timeline__steps">
            {timelineItems.map((item) => (
              <button
                aria-pressed={item.id === activeId}
                className="fmkt-timeline-step"
                key={item.id}
                onClick={() => setActiveId(item.id)}
                type="button"
              >
                <span className="fmkt-timeline-step__icon">
                  <MarketingIcon id={item.icon} size={18} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.copy}</small>
                </span>
                <em>{item.meta}</em>
              </button>
            ))}
          </div>
        </div>

        <section
          aria-label="Interactive team availability timeline"
          className="fmkt-timeline__board"
        >
          <div className="fmkt-timeline__toolbar">
            <div>
              <span className="fmkt-timeline__eyebrow">This week</span>
              <strong>Operations team</strong>
            </div>
            <span className="fmkt-timeline__status">{activeItem.state}</span>
          </div>

          <div className="fmkt-timeline__calendar">
            <div className="fmkt-timeline__header">
              <span />
              {days.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            {people.map((person) => (
              <div className="fmkt-timeline__row" key={person.initials}>
                <div className="fmkt-timeline__person">
                  <span
                    className={`fmkt-timeline__avatar fmkt-timeline__avatar--${person.tone}`}
                  >
                    {person.initials}
                  </span>
                  <span>{person.name}</span>
                </div>
                {days.map((day, index) => {
                  const isActivePerson = person.initials === activeItem.person;
                  const inRange =
                    index >= activeItem.range[0] &&
                    index <= activeItem.range[1];

                  return (
                    <div className="fmkt-timeline__cell" key={day}>
                      {isActivePerson && inRange ? (
                        <span
                          className={`fmkt-timeline__event ${
                            activeItem.id === "request"
                              ? "fmkt-timeline__event--draft"
                              : "fmkt-timeline__event--published"
                          }`}
                        >
                          {index === activeItem.range[0]
                            ? activeItem.eventLabel
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="fmkt-timeline__feed-card">
            <span className="fmkt-timeline__feed-icon">
              <MarketingIcon id="shieldCheck" size={18} />
            </span>
            <div>
              <strong>Calendar feed updated</strong>
              <span>
                Secure team subscription reflects{" "}
                {activeItem.eventLabel.toLowerCase()}.
              </span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};

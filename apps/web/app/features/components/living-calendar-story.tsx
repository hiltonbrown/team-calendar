"use client";

import { useEffect, useRef, useState } from "react";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

const STORY_BEATS = [
  {
    body: "Payroll leave arrives from Xero. Contractors and directors add their own availability directly, without being added to a pay run.",
    id: "source",
    summary: "Sarah's annual leave has arrived from Xero Payroll.",
    title: "Every kind of away enters one view.",
  },
  {
    body: "Managers assess the request beside the week it affects. The approval keeps its source visible and writes back to Xero synchronously.",
    id: "approval",
    summary: "Sarah's request is awaiting approval with team cover in view.",
    title: "Approval happens with the week in sight.",
  },
  {
    body: "Payroll leave, WFH and off-payroll availability resolve into one calm schedule, so a coverage problem is visible before it becomes a surprise.",
    id: "coverage",
    summary:
      "Friday has reduced cover across payroll and off-payroll teammates.",
    title: "The whole team resolves into one calendar.",
  },
  {
    body: "Read-only feeds carry the approved view into Outlook, Google Calendar and Apple Calendar. Calendar apps refresh on their own schedules.",
    id: "publish",
    summary:
      "The approved week is available to three subscribed calendar apps.",
    title: "The calendar people use stays current.",
  },
] as const;

const WEEK_DAYS = ["Mon 18", "Tue 19", "Wed 20", "Thu 21", "Fri 22"];

export const LivingCalendarStory = () => {
  const [activeBeat, setActiveBeat] = useState(0);
  const beatRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      setActiveBeat(STORY_BEATS.length - 1);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [visibleEntry] = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!(visibleEntry?.target instanceof HTMLElement)) {
          return;
        }

        const nextBeat = Number(visibleEntry.target.dataset.storyBeat);
        if (Number.isInteger(nextBeat)) {
          setActiveBeat(nextBeat);
        }
      },
      {
        rootMargin: "-26% 0px -42% 0px",
        threshold: [0.2, 0.5, 0.8],
      }
    );

    for (const beat of beatRefs.current) {
      if (beat) {
        observer.observe(beat);
      }
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-labelledby="living-calendar-title"
      className={`ft-story is-beat-${activeBeat}`}
      id="leave-workflow"
    >
      <div className="fmkt-container ft-story__intro">
        <h2 id="living-calendar-title">
          One absence. Its whole journey, in view.
        </h2>
        <p>
          Follow a week as leave moves from source to decision to the calendars
          your team already checks.
        </p>
      </div>

      <div className="fmkt-container ft-story__layout">
        <div className="ft-story__stage-wrap">
          <div
            aria-label={STORY_BEATS[activeBeat].summary}
            className="ft-story__stage"
            role="img"
          >
            <div className="ft-story__stage-head">
              <div>
                <span className="ft-story__stage-label">Team view</span>
                <strong>18–22 May</strong>
              </div>
              <div className="ft-story__stage-status">
                <span aria-hidden="true" className="ft-story__status-dot" />
                {activeBeat === 0 && "Receiving sources"}
                {activeBeat === 1 && "Approval pending"}
                {activeBeat === 2 && "Coverage checked"}
                {activeBeat === 3 && "Feeds published"}
              </div>
            </div>

            <div className="ft-story__sources">
              <span className="ft-story__source ft-story__source--xero">
                <MarketingIcon id="leaf" size={14} /> Xero Payroll
              </span>
              <span className="ft-story__source ft-story__source--manual">
                <MarketingIcon id="edit" size={14} /> Team Calendar
              </span>
              <span aria-hidden="true" className="ft-story__source-line">
                <span className="ft-story__source-packet" />
              </span>
            </div>

            <div className="ft-story__calendar">
              <div aria-hidden="true" className="ft-story__corner" />
              {WEEK_DAYS.map((day) => (
                <div className="ft-story__day" key={day}>
                  {day}
                </div>
              ))}

              <div className="ft-story__person">
                <span className="ft-story__avatar">SM</span>
                <span>
                  <strong>Sarah M.</strong>
                  <small>HR lead</small>
                </span>
              </div>
              <div className="ft-story__days ft-story__days--sarah">
                {WEEK_DAYS.map((day) => (
                  <span aria-hidden="true" key={day} />
                ))}
                <span className="ft-story__event ft-story__event--leave">
                  <MarketingIcon id="leaf" size={13} /> Annual leave
                  <small>{activeBeat === 1 ? "Pending" : "Xero"}</small>
                </span>
              </div>

              <div className="ft-story__person">
                <span className="ft-story__avatar ft-story__avatar--purple">
                  DC
                </span>
                <span>
                  <strong>Daniel C.</strong>
                  <small>Contractor</small>
                </span>
              </div>
              <div className="ft-story__days ft-story__days--daniel">
                {WEEK_DAYS.map((day) => (
                  <span aria-hidden="true" key={day} />
                ))}
                <span className="ft-story__event ft-story__event--manual">
                  <MarketingIcon id="home" size={13} /> WFH
                  <small>Manual</small>
                </span>
              </div>

              <div className="ft-story__person">
                <span className="ft-story__avatar ft-story__avatar--slate">
                  PN
                </span>
                <span>
                  <strong>Patrick N.</strong>
                  <small>Sales</small>
                </span>
              </div>
              <div className="ft-story__days ft-story__days--patrick">
                {WEEK_DAYS.map((day) => (
                  <span aria-hidden="true" key={day} />
                ))}
                <span className="ft-story__event ft-story__event--travel">
                  <MarketingIcon id="briefcase" size={13} /> Client visit
                  <small>Manual</small>
                </span>
              </div>
            </div>

            <div className="ft-story__decision">
              <span className="ft-story__decision-icon">
                <MarketingIcon id="check" size={16} />
              </span>
              <span>
                <strong>
                  {activeBeat === 1
                    ? "Ready for review"
                    : "Approved in context"}
                </strong>
                <small>
                  {activeBeat === 1
                    ? "Friday has reduced cover"
                    : "Xero write-back confirmed"}
                </small>
              </span>
            </div>

            <div className="ft-story__destinations">
              <span>Published to</span>
              <span className="ft-story__destination">
                <MarketingIcon id="outlook" size={16} /> Outlook
              </span>
              <span className="ft-story__destination">
                <MarketingIcon id="gcal" size={16} /> Google
              </span>
              <span className="ft-story__destination">
                <MarketingIcon id="applecal" size={16} /> Apple
              </span>
            </div>
          </div>
        </div>

        <div className="ft-story__beats">
          {STORY_BEATS.map((beat, index) => (
            <article
              className="ft-story__beat"
              data-story-beat={index}
              key={beat.id}
              ref={(node) => {
                beatRefs.current[index] = node;
              }}
            >
              <button
                aria-pressed={activeBeat === index}
                className="ft-story__beat-button"
                onClick={() => setActiveBeat(index)}
                type="button"
              >
                <span aria-hidden="true" className="ft-story__beat-marker" />
                <span className="ft-story__beat-copy">
                  <strong className="ft-story__beat-title">{beat.title}</strong>
                  <span className="ft-story__beat-text">{beat.body}</span>
                </span>
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

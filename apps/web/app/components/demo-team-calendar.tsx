"use client";

import {
  addDays,
  addWeeks,
  format,
  isToday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { MarketingIcon } from "../(home)/components/marketing-icons";

interface Day {
  date?: Date;
  dow: string;
  monthName: string;
  num: number;
}

interface Week {
  days: Day[];
  id: string;
  label: string;
  sub: string;
  todayIdx: number;
}

interface Staff {
  id: string;
  initials: string;
  name: string;
  role: string;
}

type KindKey = "annual" | "wfh" | "client";

interface Entry {
  kind: KindKey;
  note?: string;
  span: number;
  start: number;
}

interface SelectedState {
  entry: Entry;
  staff: Staff;
  week: Week;
}

const WEEKS: Week[] = [
  {
    days: [
      { dow: "Mon", monthName: "May", num: 11 },
      { dow: "Tue", monthName: "May", num: 12 },
      { dow: "Wed", monthName: "May", num: 13 },
      { dow: "Thu", monthName: "May", num: 14 },
      { dow: "Fri", monthName: "May", num: 15 },
      { dow: "Sat", monthName: "May", num: 16 },
      { dow: "Sun", monthName: "May", num: 17 },
    ],
    id: "w-last",
    label: "Mon 11 to Sun 17 May",
    sub: "Last week",
    todayIdx: -1,
  },
  {
    days: [
      { dow: "Mon", monthName: "May", num: 18 },
      { dow: "Tue", monthName: "May", num: 19 },
      { dow: "Wed", monthName: "May", num: 20 },
      { dow: "Thu", monthName: "May", num: 21 },
      { dow: "Fri", monthName: "May", num: 22 },
      { dow: "Sat", monthName: "May", num: 23 },
      { dow: "Sun", monthName: "May", num: 24 },
    ],
    id: "w-this",
    label: "Mon 18 to Sun 24 May",
    sub: "This week",
    todayIdx: 3,
  },
  {
    days: [
      { dow: "Mon", monthName: "May", num: 25 },
      { dow: "Tue", monthName: "May", num: 26 },
      { dow: "Wed", monthName: "May", num: 27 },
      { dow: "Thu", monthName: "May", num: 28 },
      { dow: "Fri", monthName: "May", num: 29 },
      { dow: "Sat", monthName: "May", num: 30 },
      { dow: "Sun", monthName: "May", num: 31 },
    ],
    id: "w-next",
    label: "Mon 25 to Sun 31 May",
    sub: "Next week",
    todayIdx: -1,
  },
];

const STAFF: Staff[] = [
  { id: "sm", initials: "SM", name: "Sarah Mitchell", role: "HR lead" },
  { id: "dc", initials: "DC", name: "Daniel Chen", role: "Engineering" },
  { id: "pn", initials: "PN", name: "Patrick Nolan", role: "Sales" },
  { id: "jo", initials: "JO", name: "James O'Connor", role: "Operations" },
  { id: "mt", initials: "MT", name: "Mia Tanaka", role: "Design" },
  { id: "rp", initials: "RP", name: "Ruben Park", role: "Support" },
];
const weekGridTemplate = "repeat(7, minmax(7rem, 1fr))";

const KIND: Record<
  KindKey,
  {
    label: string;
    icon: "leaf" | "home" | "briefcase";
    tone: string;
    prov: string;
  }
> = {
  annual: {
    icon: "leaf",
    label: "Annual leave",
    prov: "xero",
    tone: "sage",
  },
  client: {
    icon: "briefcase",
    label: "Client visit",
    prov: "manual",
    tone: "purple",
  },
  wfh: {
    icon: "home",
    label: "Working from home",
    prov: "manual",
    tone: "purple",
  },
};

const ENTRIES: Record<string, Record<string, Entry[]>> = {
  "w-last": {
    dc: [
      { kind: "wfh", note: "Remote week, sprint planning", span: 5, start: 1 },
    ],
    jo: [
      {
        kind: "annual",
        note: "Annual leave (week 1 of 2)",
        span: 5,
        start: 1,
      },
    ],
    mt: [{ kind: "wfh", note: "Remote by default", span: 5, start: 1 }],
    pn: [
      { kind: "wfh", span: 1, start: 1 },
      {
        kind: "client",
        note: "Auckland, Northwind onboarding",
        span: 2,
        start: 2,
      },
      { kind: "wfh", span: 2, start: 4 },
    ],
    rp: [
      { kind: "annual", note: "A few days off", span: 3, start: 1 },
      { kind: "wfh", span: 2, start: 4 },
    ],
    sm: [
      { kind: "wfh", note: "Catch-up days at home", span: 2, start: 1 },
      { kind: "annual", note: "Mid-week break", span: 3, start: 3 },
    ],
  },
  "w-next": {
    dc: [
      {
        kind: "client",
        note: "Sydney, Beacon Logistics review",
        span: 1,
        start: 1,
      },
      { kind: "wfh", span: 4, start: 2 },
    ],
    jo: [
      {
        kind: "annual",
        note: "Buffer days returning to work",
        span: 2,
        start: 1,
      },
      { kind: "wfh", span: 3, start: 3 },
    ],
    mt: [
      { kind: "wfh", span: 2, start: 1 },
      {
        kind: "client",
        note: "Melbourne studio, quarterly review",
        span: 1,
        start: 3,
      },
      { kind: "wfh", span: 2, start: 4 },
    ],
    pn: [
      { kind: "wfh", span: 3, start: 1 },
      {
        kind: "annual",
        note: "Long weekend",
        span: 2,
        start: 4,
      },
    ],
    rp: [{ kind: "wfh", note: "Remote by default", span: 5, start: 1 }],
    sm: [{ kind: "wfh", note: "Catching up after leave", span: 5, start: 1 }],
  },
  "w-this": {
    dc: [
      { kind: "wfh", span: 2, start: 1 },
      {
        kind: "client",
        note: "Brisbane, Beacon Logistics",
        span: 1,
        start: 3,
      },
      { kind: "wfh", span: 2, start: 4 },
    ],
    jo: [
      {
        kind: "annual",
        note: "Annual leave (week 2 of 2)",
        span: 5,
        start: 1,
      },
    ],
    mt: [{ kind: "wfh", note: "Remote by default", span: 5, start: 1 }],
    pn: [
      {
        kind: "client",
        note: "Sydney, Acme Co quarterly review",
        span: 2,
        start: 1,
      },
      { kind: "wfh", span: 1, start: 5 },
    ],
    rp: [
      { kind: "wfh", span: 1, start: 1 },
      { kind: "wfh", span: 1, start: 3 },
      {
        kind: "client",
        note: "Melbourne, onsite support training",
        span: 1,
        start: 4,
      },
      { kind: "wfh", span: 1, start: 5 },
    ],
    sm: [
      { kind: "wfh", note: "School pickups this week", span: 2, start: 1 },
      { kind: "annual", note: "Family trip to Byron Bay", span: 3, start: 3 },
    ],
  },
};

const Avatar = ({ initials }: { initials: string }) => (
  <div aria-hidden="true" className="tl-avatar">
    {initials}
  </div>
);

interface BlockProps {
  entry: Entry;
  isSelected: boolean;
  onSelect: (selected: SelectedState, trigger: HTMLButtonElement) => void;
  staff: Staff;
  week: Week;
}

const Block = ({ entry, staff, week, isSelected, onSelect }: BlockProps) => {
  const kind = KIND[entry.kind];
  const dayCount = entry.span;
  const startLabel = week.days[entry.start - 1];
  const endLabel = week.days[entry.start - 1 + entry.span - 1];
  if (!(startLabel && endLabel)) {
    return null;
  }
  const fullDate = (day: Day) =>
    day.date
      ? format(day.date, "EEEE d MMMM yyyy")
      : `${day.dow} ${day.num} ${day.monthName} 2026`;
  const ariaLabel = `${staff.name}: ${kind.label}, ${fullDate(startLabel)}${
    entry.span > 1 ? ` to ${fullDate(endLabel)}` : ""
  }, ${kind.prov === "xero" ? "Synced from Xero" : "Manual entry"}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const blocks = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".tl-block")
    );
    const currentIndex = blocks.indexOf(e.currentTarget);
    if (currentIndex === -1) {
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextBlock = blocks[currentIndex + 1];
      nextBlock?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevBlock = blocks[currentIndex - 1];
      prevBlock?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextBlock = blocks[currentIndex + 1] || blocks[0];
      nextBlock?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevBlock = blocks[currentIndex - 1] || blocks.at(-1);
      prevBlock?.focus();
    }
  };

  return (
    <button
      aria-controls="timeline-entry-details"
      aria-expanded={isSelected}
      aria-label={ariaLabel}
      className={`tl-block tl-block--${kind.tone} ${
        isSelected ? "is-selected" : ""
      }`}
      onClick={(event) => onSelect({ entry, staff, week }, event.currentTarget)}
      onKeyDown={handleKeyDown}
      style={{ gridColumn: `${entry.start} / span ${entry.span}` }}
      type="button"
    >
      <span className="tl-block__icon">
        <MarketingIcon id={kind.icon} size={14} />
      </span>
      {dayCount >= 2 && <span className="tl-block__label">{kind.label}</span>}
      {dayCount >= 3 && <span className="tl-block__days">{dayCount}d</span>}
    </button>
  );
};

interface DetailProps {
  onClose: () => void;
  selected: SelectedState | null;
}

const Detail = ({ selected, onClose }: DetailProps) => {
  if (!selected) {
    return (
      <div className="tl-detail tl-detail--empty">
        <span aria-hidden="true" className="tl-detail-hint-icon">
          <MarketingIcon id="arrowUpRight" size={14} />
        </span>
        Select any entry above to see its details, owner and provenance.
      </div>
    );
  }
  const { entry, staff, week } = selected;
  const kind = KIND[entry.kind];
  const start = week.days[entry.start - 1];
  const end = week.days[entry.start - 1 + entry.span - 1];
  if (!(start && end)) {
    return null;
  }
  let dateLabel = "";
  if (entry.span === 1) {
    dateLabel = `${start.dow} ${start.num} ${start.monthName}`;
  } else if (start.monthName === end.monthName) {
    dateLabel = `${start.dow} ${start.num} to ${end.dow} ${end.num} ${start.monthName}`;
  } else {
    dateLabel = `${start.dow} ${start.num} ${start.monthName} to ${end.dow} ${end.num} ${end.monthName}`;
  }

  return (
    <div className="tl-detail">
      <div className={`tl-detail-icon tl-detail-icon--${kind.tone}`}>
        <MarketingIcon id={kind.icon} size={20} />
      </div>
      <div className="tl-detail-content">
        <div className="tl-detail-title">
          {staff.name} · {kind.label}
        </div>
        <div className="tl-detail-meta">
          <span>{dateLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{entry.span === 1 ? "1 day" : `${entry.span} days`}</span>
          <span aria-hidden="true">·</span>
          <span>{staff.role}</span>
          {entry.note ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{entry.note}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="tl-detail-side">
        <span className={`tl-detail-prov tl-detail-prov--${kind.prov}`}>
          {kind.prov === "xero" ? "Synced from Xero" : "Manual entry"}
        </span>
        <button
          aria-label="Close details"
          className="tl-detail-close"
          onClick={onClose}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export const DemoTeamCalendar = () => {
  const [weeks, setWeeks] = useState<Week[]>(WEEKS);
  const [weekIdx, setWeekIdx] = useState(1); // current week (This week)
  const [selected, setSelected] = useState<SelectedState | null>(null);
  const [mounted, setMounted] = useState(false);
  const selectedTrigger = useRef<HTMLButtonElement | null>(null);

  const handleSelect = (entry: SelectedState, trigger: HTMLButtonElement) => {
    selectedTrigger.current = trigger;
    setSelected(entry);
  };

  const handleClose = () => {
    setSelected(null);
    selectedTrigger.current?.focus();
  };

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    const mondayThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const mondayLastWeek = subWeeks(mondayThisWeek, 1);
    const mondayNextWeek = addWeeks(mondayThisWeek, 1);

    const getWeekDays = (monday: Date) =>
      [0, 1, 2, 3, 4, 5, 6].map((offset) => {
        const date = addDays(monday, offset);
        return {
          date,
          dow: format(date, "eee"),
          monthName: format(date, "MMM"),
          num: date.getDate(),
        };
      });

    const lastWeekDays = getWeekDays(mondayLastWeek);
    const thisWeekDays = getWeekDays(mondayThisWeek);
    const nextWeekDays = getWeekDays(mondayNextWeek);

    const getWeekLabel = (days: ReturnType<typeof getWeekDays>) => {
      const [mon, , , , , , sun] = days;
      if (mon.monthName === sun.monthName) {
        return `Mon ${mon.num} to Sun ${sun.num} ${mon.monthName}`;
      }
      return `Mon ${mon.num} ${mon.monthName} to Sun ${sun.num} ${sun.monthName}`;
    };

    const updatedWeeks: Week[] = [
      {
        days: lastWeekDays,
        id: "w-last",
        label: getWeekLabel(lastWeekDays),
        sub: "Last week",
        todayIdx: lastWeekDays.findIndex((d) => d.date && isToday(d.date)),
      },
      {
        days: thisWeekDays,
        id: "w-this",
        label: getWeekLabel(thisWeekDays),
        sub: "This week",
        todayIdx: thisWeekDays.findIndex((d) => d.date && isToday(d.date)),
      },
      {
        days: nextWeekDays,
        id: "w-next",
        label: getWeekLabel(nextWeekDays),
        sub: "Next week",
        todayIdx: nextWeekDays.findIndex((d) => d.date && isToday(d.date)),
      },
    ];

    setWeeks(updatedWeeks);
  }, []);

  const week = weeks[weekIdx];
  const startDate = week?.days[0]?.date;
  const endDate = week?.days[6]?.date;
  const startYear = startDate ? format(startDate, "yyyy") : "2026";
  const endYear = endDate ? format(endDate, "yyyy") : startYear;
  const yearLabel =
    startYear === endYear ? startYear : `${startYear}–${endYear}`;

  const handlePrev = useCallback(() => {
    setWeekIdx((i) => Math.max(0, i - 1));
    setSelected(null);
  }, []);

  const handleNext = useCallback(() => {
    setWeekIdx((i) => Math.min(weeks.length - 1, i + 1));
    setSelected(null);
  }, [weeks.length]);

  const handleToday = useCallback(() => {
    setWeekIdx(1);
    setSelected(null);
  }, []);

  const isSelected = useCallback(
    (staffId: string, entryStart: number) =>
      !!selected &&
      selected.staff.id === staffId &&
      selected.entry.start === entryStart &&
      selected.week.id === week.id,
    [selected, week.id]
  );

  if (!(mounted && week)) {
    return (
      <>
        <p aria-hidden="true" className="tl-scrollhint">
          Swipe to see the full week
        </p>

        <div className="tl-card tl-card--skeleton">
          <div className="tl-toolbar" style={{ opacity: 0.6 }}>
            <div className="tl-week-nav">
              <button className="tl-nav-btn" disabled type="button">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button className="tl-nav-btn" disabled type="button">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <button className="tl-today-btn" disabled type="button">
                Today
              </button>
              <div className="tl-week-meta">
                <div
                  style={{
                    animation: "pulse 1.5s infinite",
                    background: "var(--surface-container-high)",
                    borderRadius: 4,
                    height: 16,
                    width: 140,
                  }}
                />
                <div
                  style={{
                    animation: "pulse 1.5s infinite",
                    background: "var(--surface-container-high)",
                    borderRadius: 4,
                    height: 12,
                    marginTop: 4,
                    width: 90,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="tl-grid" style={{ opacity: 0.5 }}>
            <div className="tl-corner">Team</div>
            <div
              className="tl-days-header"
              style={{ gridTemplateColumns: weekGridTemplate }}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div className="tl-day-head" key={i}>
                  <span className="tl-day-head__dow">...</span>
                  <span
                    style={{
                      animation: "pulse 1.5s infinite",
                      background: "var(--surface-container-high)",
                      borderRadius: 2,
                      display: "inline-block",
                      height: 10,
                      width: 30,
                    }}
                  />
                </div>
              ))}
            </div>
            {STAFF.map((staff) => (
              <Fragment key={staff.id}>
                <div className="tl-row-staff">
                  <div
                    className="tl-avatar"
                    style={{ background: "var(--surface-container-high)" }}
                  >
                    {staff.initials}
                  </div>
                  <div className="tl-staff-meta">
                    <div className="tl-staff-name">{staff.name}</div>
                    <div className="tl-staff-role">{staff.role}</div>
                  </div>
                </div>
                <div
                  className="tl-row-track"
                  style={{ gridTemplateColumns: weekGridTemplate }}
                >
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <span
                      className="tl-day-guide"
                      key={i}
                      style={{ left: `${(i / 7) * 100}%` }}
                    />
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </>
    );
  }
  const entries = ENTRIES[week.id] || {};

  // Today tint position (as 0..7 left offset)
  const todayLeftPct = week.todayIdx >= 0 ? (week.todayIdx / 7) * 100 : null;

  return (
    <>
      <p aria-hidden="true" className="tl-scrollhint">
        Swipe to see the full week
      </p>

      <div className="tl-card">
        <div className="tl-toolbar">
          <div className="tl-week-nav">
            <button
              aria-label="Previous week"
              className="tl-nav-btn"
              disabled={weekIdx === 0}
              onClick={handlePrev}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              aria-label="Next week"
              className="tl-nav-btn"
              disabled={weekIdx === weeks.length - 1}
              onClick={handleNext}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <button
              className={`tl-today-btn ${weekIdx === 1 ? "is-current" : ""}`}
              onClick={handleToday}
              type="button"
            >
              Today
            </button>
            <div className="tl-week-meta">
              <div className="tl-week-label">{week.label}</div>
              <div className="tl-week-sub">
                {week.sub} · {yearLabel}
              </div>
            </div>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: These labels describe the timeline, not form controls. */}
          <div aria-label="Legend" className="tl-legend" role="group">
            <span className="tl-legend-item">
              <span aria-hidden="true" className="tl-swatch tl-swatch--sage" />
              Annual leave
            </span>
            <span className="tl-legend-item">
              <span
                aria-hidden="true"
                className="tl-swatch tl-swatch--purple"
              />
              Working from home
            </span>
            <span className="tl-legend-item">
              <span aria-hidden="true" className="tl-swatch tl-swatch--purple">
                <MarketingIcon id="briefcase" size={9} />
              </span>
              Client visit
            </span>
          </div>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: This group contains an availability visualisation, not a form. */}
        <div
          aria-label="Team availability timeline"
          className="tl-grid"
          role="group"
        >
          <div className="tl-corner">Team</div>
          <div
            className="tl-days-header"
            style={{ gridTemplateColumns: weekGridTemplate }}
          >
            {todayLeftPct !== null && (
              <span
                aria-hidden="true"
                className="tl-today-tint tl-today-tint--header"
                style={{ left: `${todayLeftPct}%`, width: "calc(100% / 7)" }}
              />
            )}
            {week.days.map((d, i) => (
              <div
                className={`tl-day-head ${
                  i === week.todayIdx ? "tl-day-head--today" : ""
                }`}
                key={d.dow}
              >
                <span className="tl-day-head__dow">{d.dow}</span>
                <span className="tl-day-head__num">
                  {d.num} {d.monthName}
                </span>
                {i === week.todayIdx && (
                  <span className="tl-day-head__pill">Today</span>
                )}
              </div>
            ))}
          </div>

          {STAFF.map((staff) => (
            <Fragment key={staff.id}>
              <div className="tl-row-staff">
                <Avatar initials={staff.initials} />
                <div className="tl-staff-meta">
                  <div className="tl-staff-name">{staff.name}</div>
                  <div className="tl-staff-role">{staff.role}</div>
                </div>
              </div>
              {/* biome-ignore lint/a11y/useSemanticElements: Availability entries are disclosure buttons, not form fields. */}
              <div
                aria-label={`${staff.name}, ${staff.role}: availability`}
                className="tl-row-track"
                role="group"
                style={{ gridTemplateColumns: weekGridTemplate }}
              >
                {todayLeftPct !== null && (
                  <span
                    aria-hidden="true"
                    className="tl-today-tint"
                    style={{
                      left: `${todayLeftPct}%`,
                      width: "calc(100% / 7)",
                    }}
                  />
                )}
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    aria-hidden="true"
                    className="tl-day-guide"
                    key={i}
                    style={{ left: `${(i / 7) * 100}%` }}
                  />
                ))}
                {(entries[staff.id] || []).map((entry) => (
                  <Block
                    entry={entry}
                    isSelected={isSelected(staff.id, entry.start)}
                    key={`${staff.id}-${entry.start}`}
                    onSelect={handleSelect}
                    staff={staff}
                    week={week}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </div>

        <section
          aria-label="Selected availability entry details"
          aria-live="polite"
          id="timeline-entry-details"
        >
          <Detail onClose={handleClose} selected={selected} />
        </section>
      </div>
    </>
  );
};

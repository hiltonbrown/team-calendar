"use client";

import {
  addDays,
  addWeeks,
  format,
  isToday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { MarketingIcon } from "./marketing-icons";

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
    id: "w-last",
    label: "Mon 11 to Sun 17 May",
    sub: "Last week",
    days: [
      { dow: "Mon", num: 11, monthName: "May" },
      { dow: "Tue", num: 12, monthName: "May" },
      { dow: "Wed", num: 13, monthName: "May" },
      { dow: "Thu", num: 14, monthName: "May" },
      { dow: "Fri", num: 15, monthName: "May" },
      { dow: "Sat", num: 16, monthName: "May" },
      { dow: "Sun", num: 17, monthName: "May" },
    ],
    todayIdx: -1,
  },
  {
    id: "w-this",
    label: "Mon 18 to Sun 24 May",
    sub: "This week",
    days: [
      { dow: "Mon", num: 18, monthName: "May" },
      { dow: "Tue", num: 19, monthName: "May" },
      { dow: "Wed", num: 20, monthName: "May" },
      { dow: "Thu", num: 21, monthName: "May" },
      { dow: "Fri", num: 22, monthName: "May" },
      { dow: "Sat", num: 23, monthName: "May" },
      { dow: "Sun", num: 24, monthName: "May" },
    ],
    todayIdx: 3,
  },
  {
    id: "w-next",
    label: "Mon 25 to Sun 31 May",
    sub: "Next week",
    days: [
      { dow: "Mon", num: 25, monthName: "May" },
      { dow: "Tue", num: 26, monthName: "May" },
      { dow: "Wed", num: 27, monthName: "May" },
      { dow: "Thu", num: 28, monthName: "May" },
      { dow: "Fri", num: 29, monthName: "May" },
      { dow: "Sat", num: 30, monthName: "May" },
      { dow: "Sun", num: 31, monthName: "May" },
    ],
    todayIdx: -1,
  },
];

const STAFF: Staff[] = [
  { id: "sm", name: "Sarah Mitchell", role: "HR lead", initials: "SM" },
  { id: "dc", name: "Daniel Chen", role: "Engineering", initials: "DC" },
  { id: "pn", name: "Patrick Nolan", role: "Sales", initials: "PN" },
  { id: "jo", name: "James O'Connor", role: "Operations", initials: "JO" },
  { id: "mt", name: "Mia Tanaka", role: "Design", initials: "MT" },
  { id: "rp", name: "Ruben Park", role: "Support", initials: "RP" },
];

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
    label: "Annual leave",
    icon: "leaf",
    tone: "sage",
    prov: "xero",
  },
  wfh: {
    label: "Working from home",
    icon: "home",
    tone: "purple",
    prov: "manual",
  },
  client: {
    label: "Client visit",
    icon: "briefcase",
    tone: "purple",
    prov: "manual",
  },
};

const ENTRIES: Record<string, Record<string, Entry[]>> = {
  "w-last": {
    sm: [
      { kind: "wfh", start: 1, span: 2, note: "Catch-up day at home" },
      { kind: "annual", start: 3, span: 3, note: "Mid-week break" },
    ],
    dc: [
      { kind: "wfh", start: 1, span: 5, note: "Remote week, sprint planning" },
    ],
    pn: [
      { kind: "wfh", start: 1, span: 1 },
      {
        kind: "client",
        start: 2,
        span: 2,
        note: "Auckland, Northwind onboarding",
      },
      { kind: "wfh", start: 4, span: 2 },
    ],
    jo: [
      {
        kind: "annual",
        start: 1,
        span: 5,
        note: "Long service leave (week 1 of 2)",
      },
    ],
    mt: [{ kind: "wfh", start: 1, span: 5, note: "Remote by default" }],
    rp: [
      { kind: "annual", start: 1, span: 3, note: "Sick leave, flu" },
      { kind: "wfh", start: 4, span: 2 },
    ],
  },
  "w-this": {
    sm: [
      { kind: "wfh", start: 1, span: 2, note: "School pickups this week" },
      { kind: "annual", start: 3, span: 3, note: "Family trip to Byron Bay" },
    ],
    dc: [
      { kind: "wfh", start: 1, span: 2 },
      {
        kind: "client",
        start: 3,
        span: 1,
        note: "Brisbane, Beacon Logistics",
      },
      { kind: "wfh", start: 4, span: 2 },
    ],
    pn: [
      {
        kind: "client",
        start: 1,
        span: 2,
        note: "Sydney, Acme Co quarterly review",
      },
      { kind: "wfh", start: 5, span: 1 },
    ],
    jo: [
      {
        kind: "annual",
        start: 1,
        span: 5,
        note: "Long service leave (week 2 of 2)",
      },
    ],
    mt: [{ kind: "wfh", start: 1, span: 5, note: "Remote by default" }],
    rp: [
      { kind: "wfh", start: 1, span: 1 },
      { kind: "wfh", start: 3, span: 1 },
      {
        kind: "client",
        start: 4,
        span: 1,
        note: "Melbourne, onsite support training",
      },
      { kind: "wfh", start: 5, span: 1 },
    ],
  },
  "w-next": {
    sm: [{ kind: "wfh", start: 1, span: 5, note: "Catching up after leave" }],
    dc: [
      {
        kind: "client",
        start: 1,
        span: 1,
        note: "Sydney, Beacon Logistics review",
      },
      { kind: "wfh", start: 2, span: 4 },
    ],
    pn: [
      { kind: "wfh", start: 1, span: 3 },
      {
        kind: "annual",
        start: 4,
        span: 2,
        note: "Public holiday weekend extended",
      },
    ],
    jo: [
      {
        kind: "annual",
        start: 1,
        span: 2,
        note: "Buffer days returning to work",
      },
      { kind: "wfh", start: 3, span: 3 },
    ],
    mt: [
      { kind: "wfh", start: 1, span: 2 },
      {
        kind: "client",
        start: 3,
        span: 1,
        note: "Melbourne studio, quarterly review",
      },
      { kind: "wfh", start: 4, span: 2 },
    ],
    rp: [{ kind: "wfh", start: 1, span: 5, note: "Remote by default" }],
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
  onSelect: (selected: SelectedState) => void;
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
  const ariaLabel =
    `${staff.name}: ${kind.label}, ${startLabel.dow} ${startLabel.num} ${
      entry.span > 1 ? "to " + endLabel.dow + " " + endLabel.num : ""
    }`.trim();

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className={`tl-block tl-block--${kind.tone}${
        isSelected ? "is-selected" : ""
      }`}
      onClick={() => onSelect({ entry, staff, week })}
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
        Click any block above to see the entry details, owner and provenance.
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
          {entry.note && (
            <>
              <span aria-hidden="true">·</span>
              <span>{entry.note}</span>
            </>
          )}
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

export const TeamTimelineSection = () => {
  const [weeks, setWeeks] = useState<Week[]>(WEEKS);
  const [weekIdx, setWeekIdx] = useState(1); // current week (This week)
  const [selected, setSelected] = useState<SelectedState | null>(null);

  useEffect(() => {
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
          num: date.getDate(),
          monthName: format(date, "MMM"),
        };
      });

    const lastWeekDays = getWeekDays(mondayLastWeek);
    const thisWeekDays = getWeekDays(mondayThisWeek);
    const nextWeekDays = getWeekDays(mondayNextWeek);

    const getWeekLabel = (days: ReturnType<typeof getWeekDays>) => {
      const mon = days[0];
      const sun = days[6];
      if (mon.monthName === sun.monthName) {
        return `Mon ${mon.num} to Sun ${sun.num} ${mon.monthName}`;
      }
      return `Mon ${mon.num} ${mon.monthName} to Sun ${sun.num} ${sun.monthName}`;
    };

    const updatedWeeks: Week[] = [
      {
        id: "w-last",
        label: getWeekLabel(lastWeekDays),
        sub: "Last week",
        days: lastWeekDays,
        todayIdx: lastWeekDays.findIndex((d) => d.date && isToday(d.date)),
      },
      {
        id: "w-this",
        label: getWeekLabel(thisWeekDays),
        sub: "This week",
        days: thisWeekDays,
        todayIdx: thisWeekDays.findIndex((d) => d.date && isToday(d.date)),
      },
      {
        id: "w-next",
        label: getWeekLabel(nextWeekDays),
        sub: "Next week",
        days: nextWeekDays,
        todayIdx: nextWeekDays.findIndex((d) => d.date && isToday(d.date)),
      },
    ];

    setWeeks(updatedWeeks);
  }, []);

  const week = weeks[weekIdx];
  if (!week) {
    return null;
  }
  const entries = ENTRIES[week.id] || {};

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

  // Today tint position (as 0..7 left offset)
  const todayLeftPct = week.todayIdx >= 0 ? (week.todayIdx / 7) * 100 : null;

  return (
    <section className="fmkt-timeline" id="team-timeline">
      <div className="fmkt-container">
        <p className="fmkt-overline">Team availability, live</p>
        <h2 className="fmkt-section-title">
          See who is in, who is out and where they are.
        </h2>
        <p className="fmkt-timeline__lead">
          Sage entries arrive from Xero Payroll the moment they are approved.
          Purple entries are manual: working from home, client site, training.
          Click any block for details.
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
                className={`tl-today-btn${weekIdx === 1 ? "is-current" : ""}`}
                onClick={handleToday}
                type="button"
              >
                Today
              </button>
              <div className="tl-week-meta">
                <div className="tl-week-label">{week.label}</div>
                <div className="tl-week-sub">
                  {week.sub} ·{" "}
                  {week.days[0]?.date
                    ? format(week.days[0].date, "yyyy")
                    : "2026"}
                </div>
              </div>
            </div>
            <div aria-label="Legend" className="tl-legend">
              <span className="tl-legend-item">
                <span
                  aria-hidden="true"
                  className="tl-swatch tl-swatch--sage"
                />
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
                <span
                  aria-hidden="true"
                  className="tl-swatch tl-swatch--purple"
                >
                  <MarketingIcon id="briefcase" size={9} />
                </span>
                Client visit
              </span>
            </div>
          </div>

          <div
            aria-label="Team availability timeline"
            className="tl-grid"
            role="table"
          >
            <div className="tl-corner" role="columnheader">
              Team
            </div>
            <div
              className="tl-days-header"
              role="row"
              style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
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
                  className={`tl-day-head${
                    i === week.todayIdx ? "tl-day-head--today" : ""
                  }`}
                  key={d.dow}
                  role="columnheader"
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
              <React.Fragment key={staff.id}>
                <div className="tl-row-staff" role="rowheader">
                  <Avatar initials={staff.initials} />
                  <div className="tl-staff-meta">
                    <div className="tl-staff-name">{staff.name}</div>
                    <div className="tl-staff-role">{staff.role}</div>
                  </div>
                </div>
                <div
                  className="tl-row-track"
                  role="row"
                  style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
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
                      onSelect={setSelected}
                      staff={staff}
                      week={week}
                    />
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>

          <Detail onClose={() => setSelected(null)} selected={selected} />
        </div>
      </div>
    </section>
  );
};

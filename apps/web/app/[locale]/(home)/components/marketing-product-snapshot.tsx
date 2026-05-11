"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

interface MarketingProductSnapshotProps {
  placement?: "hero" | "section";
}

type TeamTone = "forest" | "plum" | "sage" | "slate";
type LeaveTypeId =
  | "annual"
  | "birthday"
  | "client"
  | "training"
  | "travel"
  | "wfh";
type SyncState = "idle" | "syncing" | "just-synced";
type IconId =
  | "briefcase"
  | "cake"
  | "calendar"
  | "home"
  | "leaf"
  | "mapPin"
  | "plane"
  | "shield"
  | "sync";

interface TeamMember {
  id: number;
  initials: string;
  location: string;
  name: string;
  role: string;
  tone: TeamTone;
}

interface ScheduleEntry {
  detail: string;
  person: number;
  source: "manual" | "xero";
  span: number;
  start: number;
  type: LeaveTypeId;
}

interface WeekDay {
  fullLabel: string;
  isToday: boolean;
  key: string;
  shortLabel: string;
}

interface LeaveType {
  icon: IconId;
  label: string;
}

const team: TeamMember[] = [
  {
    id: 1,
    name: "Amelia Thorne",
    role: "Design",
    initials: "AT",
    location: "Melbourne",
    tone: "sage",
  },
  {
    id: 2,
    name: "Lachlan Cooper",
    role: "Engineering",
    initials: "LC",
    location: "Brisbane",
    tone: "slate",
  },
  {
    id: 3,
    name: "Charlotte Hughes",
    role: "Engineering",
    initials: "CH",
    location: "Auckland",
    tone: "plum",
  },
  {
    id: 4,
    name: "Hannah Wilson",
    role: "Product",
    initials: "HW",
    location: "Sydney",
    tone: "sage",
  },
  {
    id: 5,
    name: "Tom Williams",
    role: "Sales",
    initials: "TW",
    location: "Client site",
    tone: "forest",
  },
  {
    id: 6,
    name: "Peter Smith",
    role: "Sales",
    initials: "PS",
    location: "Wellington",
    tone: "plum",
  },
  {
    id: 7,
    name: "Jack Brown",
    role: "Admin",
    initials: "JB",
    location: "Payroll",
    tone: "slate",
  },
  {
    id: 8,
    name: "Chloe Bowen",
    role: "Admin",
    initials: "CB",
    location: "Remote",
    tone: "sage",
  },
];

const leaveTypes: Record<LeaveTypeId, LeaveType> = {
  annual: { icon: "plane", label: "Annual leave" },
  birthday: { icon: "cake", label: "Birthday leave" },
  client: { icon: "leaf", label: "Client site" },
  training: { icon: "briefcase", label: "Training" },
  travel: { icon: "mapPin", label: "Travelling" },
  wfh: { icon: "home", label: "Working from home" },
};

const firstScheduleEntry: ScheduleEntry = {
  person: 1,
  start: 1,
  span: 4,
  source: "xero",
  type: "annual",
  detail: "Approved in Xero",
};

const baseSchedule: ScheduleEntry[] = [
  firstScheduleEntry,
  {
    person: 2,
    start: 0,
    span: 5,
    source: "manual",
    type: "wfh",
    detail: "Calendar only",
  },
  {
    person: 3,
    start: 2,
    span: 1,
    source: "manual",
    type: "training",
    detail: "Leadership course",
  },
  {
    person: 4,
    start: 3,
    span: 3,
    source: "manual",
    type: "travel",
    detail: "Customer visits",
  },
  {
    person: 5,
    start: 0,
    span: 1,
    source: "manual",
    type: "client",
    detail: "On site",
  },
  {
    person: 5,
    start: 4,
    span: 1,
    source: "manual",
    type: "wfh",
    detail: "Focus day",
  },
  {
    person: 6,
    start: 1,
    span: 1,
    source: "manual",
    type: "training",
    detail: "Induction",
  },
  {
    person: 6,
    start: 3,
    span: 2,
    source: "manual",
    type: "wfh",
    detail: "Remote",
  },
  {
    person: 7,
    start: 0,
    span: 3,
    source: "xero",
    type: "annual",
    detail: "School holidays",
  },
  {
    person: 8,
    start: 2,
    span: 1,
    source: "manual",
    type: "birthday",
    detail: "Private feed label",
  },
];

const storyStates = [
  {
    eyebrow: "Plan",
    title: "The week settles into one shared view.",
    detail: "Managers see leave, WFH and travel before rosters drift.",
  },
  {
    eyebrow: "Sync",
    title: "Approved leave moves through Xero.",
    detail: "Payroll stays current without duplicate calendar admin.",
  },
  {
    eyebrow: "Publish",
    title: "Subscribed feeds keep everyone aligned.",
    detail: "Outlook, Google and Apple calendars update from the same source.",
  },
];

function entryKey(e: ScheduleEntry): string {
  return `${e.person}-${e.start}-${e.type}`;
}

const fallbackDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  weekday: "short",
});

const weekOfFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  weekday: "short",
});

const iconPaths: Record<IconId, ReactNode> = {
  briefcase: (
    <>
      <rect height="13" rx="2" width="18" x="3" y="7" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  cake: (
    <>
      <path d="M4 20h16V12H4z" />
      <path d="M4 15c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1" />
      <path d="M12 3v5" />
    </>
  ),
  calendar: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-9 7-16 16-16 0 9-7 16-16 16z" />
      <path d="M4 20l8-8" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  plane: <path d="M3 12l18-7-7 18-2-8-9-3z" />,
  shield: <path d="M12 3 4 6v6c0 4.5 3.5 8 8 9 4.5-1 8-4.5 8-9V6z" />,
  sync: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" />
      <path d="M4 20v-5h5" />
    </>
  ),
};

export const MarketingProductSnapshot = ({
  placement = "section",
}: MarketingProductSnapshotProps) => {
  const [today, setToday] = useState<Date | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEntryKey, setSelectedEntryKey] = useState(() =>
    entryKey(firstScheduleEntry)
  );
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMinutes, setSyncMinutes] = useState(0);
  const slabRef = useRef<HTMLDivElement>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refreshToday = () => setToday(new Date());
    refreshToday();
    const todayInterval = window.setInterval(refreshToday, 60_000);

    // Minute counter for sync badge
    const minuteInterval = window.setInterval(() => {
      setSyncMinutes((m) => m + 1);
    }, 60_000);

    // Sync badge simulation only. The calendar data stays stable.
    const syncInterval = window.setInterval(() => {
      setSyncState("syncing");

      syncTimerRef.current = setTimeout(() => {
        setSyncState("just-synced");
        setSyncMinutes(0);

        syncTimerRef.current = setTimeout(() => {
          setSyncState("idle");
        }, 2500);
      }, 1200);
    }, 9000);

    return () => {
      window.clearInterval(todayInterval);
      window.clearInterval(minuteInterval);
      window.clearInterval(syncInterval);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  const week = useMemo(() => {
    if (!today) {
      return null;
    }

    const monday = getMonday(today);
    monday.setDate(monday.getDate() + weekOffset * 7);
    const dayKeys = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const isToday = isSameLocalDate(date, today);

      return {
        key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        fullLabel: `${weekdayFormatter.format(date)}${isToday ? " · Today" : ""}`,
        isToday,
        shortLabel: weekdayFormatter.format(date),
      };
    });

    return {
      days: dayKeys,
      weekOf: weekOfFormatter.format(monday),
    };
  }, [today, weekOffset]);

  const days: WeekDay[] =
    week?.days ??
    fallbackDays.map((day) => ({
      key: day,
      fullLabel: day,
      isToday: false,
      shortLabel: day,
    }));

  const schedule = baseSchedule;

  const syncLabel = useMemo(() => {
    if (syncState === "syncing") {
      return "Syncing with Xero...";
    }
    if (syncState === "just-synced") {
      return "Synced just now";
    }
    if (syncMinutes === 0) {
      return "Synced moments ago";
    }
    return `Synced ${syncMinutes}m ago`;
  }, [syncState, syncMinutes]);

  const selectedEntry = useMemo(
    () =>
      baseSchedule.find((entry) => entryKey(entry) === selectedEntryKey) ??
      firstScheduleEntry,
    [selectedEntryKey]
  );

  const selectedPerson = team.find(
    (person) => person.id === selectedEntry.person
  );
  const selectedType = leaveTypes[selectedEntry.type];
  const selectedDateSpan = getDateSpanLabel(days, selectedEntry);
  const publishedEvents = schedule.length;
  const activePeople = new Set(schedule.map((entry) => entry.person)).size;
  const feedCount = new Set(schedule.map((entry) => entry.source)).size + 1;
  const isCurrentWeek = weekOffset === 0;
  const weekLabel = getWeekLabel(weekOffset);
  const isHeroPlacement = placement === "hero";

  const resetSnapshotTilt = () => {
    const slab = slabRef.current;

    if (!slab) {
      return;
    }

    slab.style.setProperty("--snapshot-rotate-x", "0deg");
    slab.style.setProperty("--snapshot-rotate-y", "0deg");
    slab.style.setProperty("--snapshot-lift", "0");
    slab.style.setProperty("--snapshot-glint-x", "50%");
    slab.style.setProperty("--snapshot-glint-y", "38%");
  };

  const handleSnapshotPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }

    const slab = slabRef.current;

    if (!slab) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;

    slab.style.setProperty(
      "--snapshot-rotate-x",
      `${(-vertical * 5.2).toFixed(2)}deg`
    );
    slab.style.setProperty(
      "--snapshot-rotate-y",
      `${(horizontal * 6.4).toFixed(2)}deg`
    );
    slab.style.setProperty("--snapshot-lift", "10");
    slab.style.setProperty(
      "--snapshot-glint-x",
      `${((horizontal + 0.5) * 100).toFixed(1)}%`
    );
    slab.style.setProperty(
      "--snapshot-glint-y",
      `${((vertical + 0.5) * 100).toFixed(1)}%`
    );
  };

  return (
    <div
      className={
        isHeroPlacement
          ? "marketing-product-snapshot marketing-product-snapshot--hero"
          : "marketing-product-snapshot"
      }
    >
      <div
        className={
          isHeroPlacement
            ? "marketing-snapshot-stage marketing-snapshot-stage--hero"
            : "marketing-snapshot-stage"
        }
        onPointerLeave={resetSnapshotTilt}
        onPointerMove={handleSnapshotPointerMove}
      >
        <div aria-hidden="true" className="marketing-snapshot-depth" />
        <div
          className="marketing-card marketing-card--low marketing-snapshot-slab"
          ref={slabRef}
        >
          <div className="marketing-browser-bar">
            <div
              aria-label="Week controls"
              className="marketing-week-toolbar"
              role="toolbar"
            >
              <button
                aria-label="Previous week"
                className="marketing-week-control"
                onClick={() => setWeekOffset((offset) => offset - 1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={18} />
              </button>
              <button
                aria-label="Show current week"
                className="marketing-week-control marketing-week-control--today"
                disabled={isCurrentWeek}
                onClick={() => setWeekOffset(0)}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={15} />
                Today
              </button>
              <button
                aria-label="Next week"
                className="marketing-week-control"
                onClick={() => setWeekOffset((offset) => offset + 1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="marketing-week-title">
              <span>{weekLabel}</span>
              {week
                ? `${week.weekOf} · Harbour Lane Group`
                : "This week · Harbour Lane Group"}
            </div>
            <div className="marketing-browser-meta">
              <span>Week</span>
              <span data-syncing={syncState === "syncing" ? true : undefined}>
                <MarketingSnapshotIcon id="sync" size={14} />
                {syncLabel}
              </span>
              <span>
                <MarketingSnapshotIcon id="shield" size={14} />
                Private ICS
              </span>
            </div>
          </div>
          <div className="marketing-week-shell">
            <div className="marketing-week-summary">
              <span>
                <MarketingSnapshotIcon id="calendar" size={14} />
                {activePeople} people
              </span>
              <span>{publishedEvents} published events</span>
              <span>{feedCount} calendar feeds</span>
            </div>
            <WeekGrid
              days={days}
              schedule={schedule}
              selectedEntryKey={selectedEntryKey}
              setSelectedEntryKey={setSelectedEntryKey}
              weekOf={week?.weekOf ?? "This week"}
            />
            <div aria-live="polite" className="marketing-selection-strip">
              <div>
                <span
                  className={`marketing-selection-strip__icon marketing-event--${selectedEntry.type}`}
                >
                  <MarketingSnapshotIcon id={selectedType.icon} size={15} />
                </span>
                <div>
                  <p>{selectedPerson?.name ?? "Team member"}</p>
                  <span>
                    {selectedType.label} · {selectedEntry.detail}
                  </span>
                </div>
              </div>
              <span>{selectedDateSpan}</span>
            </div>
          </div>
        </div>
      </div>
      {!isHeroPlacement && (
        <div className="marketing-snapshot-story">
          {storyStates.map((state) => (
            <div
              className="marketing-snapshot-story__state"
              key={state.eyebrow}
            >
              <span>{state.eyebrow}</span>
              <strong>{state.title}</strong>
              <p>{state.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const WeekGrid = ({
  days,
  schedule,
  selectedEntryKey,
  setSelectedEntryKey,
  weekOf,
}: {
  days: WeekDay[];
  schedule: ScheduleEntry[];
  selectedEntryKey: string;
  setSelectedEntryKey: (key: string) => void;
  weekOf: string;
}) => (
  <div className="marketing-week-card">
    <div className="marketing-week-header">
      <div>
        <span>Week of</span>
        {weekOf}
      </div>
      {days.map((day) => (
        <span
          className={
            day.isToday ? "marketing-week-day is-today" : "marketing-week-day"
          }
          key={day.key}
        >
          {day.fullLabel}
        </span>
      ))}
    </div>
    <div className="marketing-week-body">
      {team.map((person, index) => {
        const entries = schedule.filter((entry) => entry.person === person.id);
        return (
          <div
            className={
              index % 2 === 0
                ? "marketing-week-row"
                : "marketing-week-row marketing-week-row--alt"
            }
            key={person.id}
          >
            <div className="marketing-week-person">
              <Avatar initials={person.initials} tone={person.tone} />
              <div>
                <p>{person.name}</p>
                <span>{person.role}</span>
              </div>
            </div>
            <div aria-hidden="true" className="marketing-week-days">
              {days.map((day) => (
                <span
                  className={day.isToday ? "is-today" : undefined}
                  key={day.key}
                />
              ))}
            </div>
            <div className="marketing-week-events">
              {entries.map((entry) => {
                const leave = leaveTypes[entry.type];
                const key = entryKey(entry);
                const isSelected = key === selectedEntryKey;
                return (
                  <button
                    aria-label={`${person.name}, ${leave.label}, ${entry.detail}`}
                    className={`marketing-event marketing-event--${entry.type}`}
                    data-selected={isSelected ? true : undefined}
                    key={key}
                    onClick={() => setSelectedEntryKey(key)}
                    style={{
                      gridColumn: `${entry.start + 1} / span ${entry.span}`,
                    }}
                    type="button"
                  >
                    <MarketingSnapshotIcon id={leave.icon} size={14} />
                    <span>{leave.label}</span>
                    <em>{entry.detail}</em>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const Avatar = ({ initials, tone }: { initials: string; tone: TeamTone }) => (
  <div className={`marketing-avatar marketing-avatar--${tone}`}>{initials}</div>
);

const MarketingSnapshotIcon = ({
  id,
  size = 20,
}: {
  id: IconId;
  size?: number;
}) => (
  <svg
    aria-hidden="true"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 24 24"
    width={size}
  >
    {iconPaths[id]}
  </svg>
);

function getMonday(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);

  const day = monday.getDay();
  const distanceFromMonday = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + distanceFromMonday);

  return monday;
}

function isSameLocalDate(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getDateSpanLabel(days: WeekDay[], entry: ScheduleEntry): string {
  const startDay = days[entry.start];
  const endDay = days[Math.min(entry.start + entry.span - 1, days.length - 1)];

  if (!(startDay && endDay)) {
    return "Visible week";
  }

  if (startDay.key === endDay.key) {
    return startDay.shortLabel;
  }

  return `${startDay.shortLabel} to ${endDay.shortLabel}`;
}

function getWeekLabel(weekOffset: number): string {
  if (weekOffset === 0) {
    return "This week";
  }

  if (weekOffset < 0) {
    const distance = Math.abs(weekOffset);
    return `${distance} week${distance === 1 ? "" : "s"} back`;
  }

  return `${weekOffset} week${weekOffset === 1 ? "" : "s"} ahead`;
}

import type {
  CalendarDay,
  CalendarEvent,
  CalendarPerson,
  CalendarRange,
} from "@repo/availability";
import { cn } from "@repo/design-system/lib/utils";
import {
  AlertTriangleIcon,
  CalendarRangeIcon,
  ChevronRightIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  labelForValue,
  statusToneClasses,
  toneForCalendarEvent,
} from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";
import { CalendarEventPopover } from "./calendar-event-popover";

interface CalendarTimelineProps {
  data: CalendarRange;
  orgQueryValue: string | null;
}

interface TimelineSegment {
  endIndex: number;
  event: CalendarEvent;
  level: number;
  startIndex: number;
}

interface TimelineLane {
  fallbackName: string;
  person: CalendarPerson | null;
  personId: string;
  segments: TimelineSegment[];
}

const maxVisibleLanes = 10;
const namePartPattern = /\s+/;

export function CalendarTimeline({
  data,
  orgQueryValue,
}: CalendarTimelineProps) {
  const days = data.days;
  if (days.length === 0) {
    return null;
  }

  const daySummaries = days.map((day) => daySummary(day));
  const maxEvents = Math.max(
    1,
    ...daySummaries.map((summary) => summary.eventCount)
  );
  const lanes = buildTimelineLanes(data);
  const visibleLanes = lanes.slice(0, maxVisibleLanes);
  const hiddenLaneCount = lanes.length - visibleLanes.length;
  const gridTemplateColumns = `repeat(${days.length}, minmax(3rem, 1fr))`;

  return (
    <section className="rounded-2xl bg-muted p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <CalendarRangeIcon className="size-4" />
            </span>
            <div>
              <h2 className="font-semibold text-base">
                Coverage across this range
              </h2>
              <p className="text-muted-foreground text-sm">
                See who is unavailable each day, then open a day for detail.
              </p>
            </div>
          </div>
        </div>
        {data.xeroSyncFailedCount > 0 ? (
          <div className="flex flex-wrap gap-2 text-sm">
            <TimelinePill
              icon={<AlertTriangleIcon className="size-3.5" />}
              label={`${data.xeroSyncFailedCount} Xero ${data.xeroSyncFailedCount === 1 ? "record needs" : "records need"} attention`}
              tone="failed"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[42rem]">
          <div className="grid gap-1" style={{ gridTemplateColumns }}>
            {daySummaries.map((summary) => (
              <CoverageDay
                key={summary.dateOnly}
                maxEvents={maxEvents}
                orgQueryValue={orgQueryValue}
                summary={summary}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            {visibleLanes.length > 0 ? (
              visibleLanes.map((lane) => (
                <TimelineLaneRow
                  days={days}
                  gridTemplateColumns={gridTemplateColumns}
                  key={lane.personId}
                  lane={lane}
                  orgQueryValue={orgQueryValue}
                />
              ))
            ) : (
              <div className="rounded-2xl bg-background p-4 text-muted-foreground text-sm">
                No one is unavailable in this range.
              </div>
            )}
          </div>
        </div>
      </div>

      {hiddenLaneCount > 0 ? (
        <div className="mt-3 flex justify-end">
          <span className="rounded-xl bg-background px-3 py-2 text-muted-foreground text-sm">
            Showing {visibleLanes.length} of {lanes.length} people with leave or
            availability
          </span>
        </div>
      ) : null}
    </section>
  );
}

function TimelinePill({
  icon,
  label,
  tone = "default",
}: {
  icon?: ReactNode;
  label: string;
  tone?: "default" | "failed";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium",
        tone === "failed"
          ? statusToneClasses.failed
          : "bg-background text-foreground"
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function CoverageDay({
  maxEvents,
  orgQueryValue,
  summary,
}: {
  maxEvents: number;
  orgQueryValue: string | null;
  summary: ReturnType<typeof daySummary>;
}) {
  const pressureLabel =
    summary.eventCount === 0
      ? "Clear"
      : `${summary.eventCount} ${summary.eventCount === 1 ? "record" : "records"}`;
  const dayHref = withOrg(
    `/calendar?view=day&anchor=${summary.dateOnly}`,
    orgQueryValue
  );

  return (
    <Link
      aria-label={`${formatFullDay(summary.date)}: ${pressureLabel}`}
      className={cn(
        "group flex min-h-32 flex-col justify-between rounded-2xl bg-background p-2 text-left transition hover:bg-surface-container-lowest focus-visible:outline-2 focus-visible:outline-ring motion-safe:duration-200 motion-safe:ease-out",
        summary.isToday && "bg-secondary text-secondary-foreground"
      )}
      href={dayHref}
    >
      <span>
        <span className="block font-medium text-xs">
          {formatWeekday(summary.date)}
        </span>
        <span className="block font-semibold text-lg tabular-nums">
          {summary.date.getUTCDate()}
        </span>
      </span>
      <span className="flex h-14 items-end">
        <span
          className={cn(
            "block w-full rounded-xl transition group-hover:brightness-95 motion-safe:duration-200 motion-safe:ease-out",
            coverageHeightClass(summary.eventCount, maxEvents),
            coverageToneClass(summary)
          )}
        />
      </span>
      <span className="flex items-center justify-between gap-1 text-xs">
        <span className="font-medium tabular-nums">
          {summary.distinctPeopleCount}
        </span>
        <CoverageDayStatus summary={summary} />
      </span>
    </Link>
  );
}

function CoverageDayStatus({
  summary,
}: {
  summary: ReturnType<typeof daySummary>;
}) {
  if (summary.failedCount > 0) {
    return <AlertTriangleIcon className="size-3 text-destructive" />;
  }
  if (summary.holidayCount > 0) {
    return (
      <span className="rounded-xl bg-accent-container px-1.5 py-0.5 text-on-accent-container">
        Hol
      </span>
    );
  }
  return (
    <ChevronRightIcon className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
  );
}

function TimelineLaneRow({
  days,
  gridTemplateColumns,
  lane,
  orgQueryValue,
}: {
  days: readonly CalendarDay[];
  gridTemplateColumns: string;
  lane: TimelineLane;
  orgQueryValue: string | null;
}) {
  const trackCount = Math.max(
    1,
    ...lane.segments.map((segment) => segment.level + 1)
  );
  const personName = lane.person?.displayName ?? lane.fallbackName;
  const personMeta = [lane.person?.teamName, lane.person?.locationName]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="grid min-w-[42rem] grid-cols-[12rem_minmax(0,1fr)] gap-2 rounded-2xl bg-background p-2">
      <Link
        className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        href={withOrg(`/people/${lane.personId}`, orgQueryValue)}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted font-semibold text-sm">
          {initialsForName(personName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-sm">
            {personName}
          </span>
          {personMeta ? (
            <span className="block truncate text-muted-foreground text-xs">
              {personMeta}
            </span>
          ) : null}
        </span>
      </Link>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns,
          gridTemplateRows: `repeat(${trackCount}, minmax(1.75rem, auto))`,
        }}
      >
        {days.map((day, index) => (
          <span
            aria-hidden="true"
            className={cn(
              "rounded-xl bg-muted/55",
              day.isToday && "bg-secondary/70"
            )}
            key={`${lane.personId}-${day.date.toISOString()}`}
            style={{
              gridColumn: `${index + 1}`,
              gridRow: `1 / ${trackCount + 1}`,
            }}
          />
        ))}
        {lane.segments.map((segment) => (
          <TimelineEventSegment
            key={`${segment.event.id}-${segment.startIndex}-${segment.level}`}
            orgQueryValue={orgQueryValue}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineEventSegment({
  orgQueryValue,
  segment,
}: {
  orgQueryValue: string | null;
  segment: TimelineSegment;
}) {
  const tone = toneForCalendarEvent(segment.event);
  const label =
    segment.event.recordType === "private"
      ? "Private"
      : labelForValue(segment.event.recordType);

  return (
    <CalendarEventPopover event={segment.event} orgQueryValue={orgQueryValue}>
      <button
        className={cn(
          "min-w-0 rounded-xl px-2.5 py-1 text-left font-medium text-xs ring-1 transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring motion-safe:duration-200 motion-safe:ease-out",
          statusToneClasses[tone],
          segment.event.renderTreatment === "dashed" &&
            "border border-dashed opacity-85",
          segment.event.renderTreatment === "draft" && "opacity-70"
        )}
        style={{
          gridColumn: `${segment.startIndex + 1} / ${segment.endIndex + 2}`,
          gridRow: `${segment.level + 1}`,
        }}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {segment.event.renderTreatment === "failed" ? (
            <AlertTriangleIcon className="size-3 shrink-0" />
          ) : null}
          <span className="truncate">{label}</span>
        </span>
      </button>
    </CalendarEventPopover>
  );
}

function buildTimelineLanes(data: CalendarRange): TimelineLane[] {
  const eventIndex = new Map<
    string,
    { dayIndexes: number[]; event: CalendarEvent }
  >();

  for (const [dayIndex, day] of data.days.entries()) {
    for (const event of day.events) {
      const existing = eventIndex.get(event.id);
      if (existing) {
        existing.dayIndexes.push(dayIndex);
        continue;
      }
      eventIndex.set(event.id, { dayIndexes: [dayIndex], event });
    }
  }

  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const lanes = new Map<string, TimelineLane>();

  for (const { dayIndexes, event } of eventIndex.values()) {
    const startIndex = Math.min(...dayIndexes);
    const endIndex = Math.max(...dayIndexes);
    const person = peopleById.get(event.personId) ?? null;
    const lane = lanes.get(event.personId) ?? {
      fallbackName: event.displayName,
      person,
      personId: event.personId,
      segments: [],
    };
    lane.segments.push({
      endIndex,
      event,
      level: 0,
      startIndex,
    });
    lanes.set(event.personId, lane);
  }

  return [...lanes.values()]
    .map((lane) => ({
      ...lane,
      segments: assignSegmentLevels(lane.segments),
    }))
    .sort((first, second) => {
      const firstFailed = laneHasFailure(first) ? 1 : 0;
      const secondFailed = laneHasFailure(second) ? 1 : 0;
      if (firstFailed !== secondFailed) {
        return secondFailed - firstFailed;
      }
      if (first.segments.length !== second.segments.length) {
        return second.segments.length - first.segments.length;
      }
      return (first.person?.displayName ?? first.fallbackName).localeCompare(
        second.person?.displayName ?? second.fallbackName
      );
    });
}

function assignSegmentLevels(segments: TimelineSegment[]): TimelineSegment[] {
  const levelEnds: number[] = [];
  return [...segments]
    .sort(
      (first, second) =>
        first.startIndex - second.startIndex || first.endIndex - second.endIndex
    )
    .map((segment) => {
      const level = levelEnds.findIndex(
        (endIndex) => endIndex < segment.startIndex
      );
      const nextLevel = level === -1 ? levelEnds.length : level;
      levelEnds[nextLevel] = segment.endIndex;
      return { ...segment, level: nextLevel };
    });
}

function laneHasFailure(lane: TimelineLane): boolean {
  return lane.segments.some(
    (segment) => segment.event.renderTreatment === "failed"
  );
}

function daySummary(day: CalendarDay) {
  return {
    date: day.date,
    dateOnly: day.date.toISOString().slice(0, 10),
    distinctPeopleCount: new Set(day.events.map((event) => event.personId))
      .size,
    eventCount: day.events.length,
    failedCount: day.events.filter(
      (event) => event.renderTreatment === "failed"
    ).length,
    holidayCount: day.publicHolidays.length,
    isToday: day.isToday,
    manualCount: day.events.filter(
      (event) => event.recordTypeCategory === "local_only"
    ).length,
  };
}

function coverageHeightClass(eventCount: number, maxEvents: number): string {
  if (eventCount === 0) {
    return "h-1.5";
  }
  const ratio = eventCount / maxEvents;
  if (ratio >= 0.85) {
    return "h-14";
  }
  if (ratio >= 0.65) {
    return "h-11";
  }
  if (ratio >= 0.45) {
    return "h-8";
  }
  if (ratio >= 0.25) {
    return "h-6";
  }
  return "h-4";
}

function coverageToneClass(summary: ReturnType<typeof daySummary>): string {
  if (summary.failedCount > 0) {
    return "bg-destructive";
  }
  if (summary.eventCount === 0 && summary.holidayCount === 0) {
    return "bg-muted-foreground/20";
  }
  if (summary.manualCount > 0 && summary.manualCount >= summary.eventCount) {
    return "bg-on-accent-container";
  }
  if (summary.holidayCount > 0 && summary.eventCount === 0) {
    return "bg-accent-container";
  }
  return "bg-primary";
}

function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(date);
}

function formatFullDay(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(date);
}

function initialsForName(name: string): string {
  const parts = name.trim().split(namePartPattern).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

"use client";

import type {
  CalendarDay,
  CalendarEvent,
  CalendarPerson,
  CalendarRange,
} from "@repo/availability";
import { getAvailabilityRecordLabel } from "@repo/core";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CalendarRangeIcon,
  ChevronRightIcon,
  LeafIcon,
  PencilIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  approvalStatusLabel,
  contactabilityLabel,
  statusToneClasses,
  toneForCalendarEvent,
} from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";
import {
  calendarEventSourceLabel,
  isManualCalendarEvent,
} from "./calendar-event-provenance";

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

const compactLaneLimit = 10;
const namePartPattern = /\s+/;

export function CalendarTimeline({
  data,
  orgQueryValue,
}: CalendarTimelineProps) {
  const events = useMemo(() => uniqueEvents(data), [data]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    events[0]?.id ?? null
  );
  const [showAllPeople, setShowAllPeople] = useState(false);
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;

  useEffect(() => {
    if (selectedEventId && !events.some(({ id }) => id === selectedEventId)) {
      setSelectedEventId(events[0]?.id ?? null);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") {
        return;
      }
      setSelectedEventId(null);
      requestAnimationFrame(() => selectedTriggerRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedEventId]);

  const selectEvent = (
    event: CalendarEvent | null,
    trigger?: HTMLButtonElement
  ) => {
    if (trigger) {
      selectedTriggerRef.current = trigger;
    }
    const update = () => setSelectedEventId(event?.id ?? null);
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !("startViewTransition" in document)) {
      update();
      return;
    }

    document.startViewTransition(update);
  };

  const closeDetail = () => {
    selectEvent(null);
    requestAnimationFrame(() => selectedTriggerRef.current?.focus());
  };

  if (data.days.length === 0) {
    return null;
  }

  const summaries = data.days.map((day) => daySummary(day));
  const maxAffected = Math.max(
    1,
    ...summaries.map(({ distinctPeopleCount }) => distinctPeopleCount)
  );
  const lanes = buildTimelineLanes(data);
  const visibleLanes = showAllPeople ? lanes : lanes.slice(0, compactLaneLimit);
  const hiddenLaneCount = lanes.length - visibleLanes.length;
  const affectedPeople = lanes.filter(
    ({ segments }) => segments.length > 0
  ).length;

  return (
    <section
      aria-labelledby="team-runway-title"
      className="overflow-hidden rounded-xl bg-surface-container"
    >
      <RunwayHeader
        affectedPeople={affectedPeople}
        data={data}
        laneCount={lanes.length}
      />

      <div className="hidden md:block">
        <div className="calendar-runway-scroll overflow-x-auto pb-1">
          <div className="min-w-[64rem]">
            <RunwayDayHeader
              maxAffected={maxAffected}
              orgQueryValue={orgQueryValue}
              summaries={summaries}
            />
            <div className="px-3 pb-3">
              {visibleLanes.length > 0 ? (
                <div className="overflow-hidden rounded-2xl bg-surface-container-lowest">
                  {visibleLanes.map((lane, index) => (
                    <TimelineLaneRow
                      days={data.days}
                      index={index}
                      key={lane.personId}
                      lane={lane}
                      onSelect={selectEvent}
                      orgQueryValue={orgQueryValue}
                      selectedEventId={selectedEventId}
                    />
                  ))}
                </div>
              ) : (
                <RunwayEmptyState />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <RunwayDetail
          event={selectedEvent}
          onClose={closeDetail}
          orgQueryValue={orgQueryValue}
        />
        <MobileRunway
          data={data}
          maxAffected={maxAffected}
          onSelect={selectEvent}
          orgQueryValue={orgQueryValue}
          selectedEventId={selectedEventId}
        />
      </div>

      <div className="hidden px-3 pb-3 md:block">
        <RunwayDetail
          event={selectedEvent}
          onClose={closeDetail}
          orgQueryValue={orgQueryValue}
        />
      </div>

      {hiddenLaneCount > 0 ? (
        <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-muted-foreground">
            Showing {visibleLanes.length} of {lanes.length} people in this
            scope.
          </p>
          <Button
            onClick={() => setShowAllPeople(true)}
            size="sm"
            type="button"
            variant="secondary"
          >
            Show all people
          </Button>
        </div>
      ) : null}

      {data.truncated ? (
        <p className="mx-4 mb-4 rounded-xl bg-warning-container px-3 py-2 text-body-sm text-on-warning-container">
          Showing the first {data.people.length} of {data.totalPeopleInScope}
          people. Narrow the people or location filter to see everyone.
        </p>
      ) : null}
    </section>
  );
}

function RunwayHeader({
  affectedPeople,
  data,
  laneCount,
}: {
  affectedPeople: number;
  data: CalendarRange;
  laneCount: number;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CalendarRangeIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-title-lg" id="team-runway-title">
            Calendar
          </h2>
          <p className="mt-1 max-w-[65ch] text-body-sm text-muted-foreground">
            Scan who is away, where coverage tightens, and what changed across
            the week.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-label-sm text-muted-foreground">
            <LegendItem
              icon={<LeafIcon className="size-3.5" />}
              label="Xero leave"
            />
            <LegendItem
              icon={<PencilIcon className="size-3.5" />}
              label="Manual availability"
            />
            <LegendItem
              icon={<UsersIcon className="size-3.5" />}
              label={`${affectedPeople} of ${laneCount} people affected`}
            />
          </div>
        </div>
      </div>
      {data.xeroSyncFailedCount > 0 ? (
        <span
          className={cn(
            "inline-flex items-center gap-2 self-start rounded-xl px-3 py-2 font-medium text-label-lg",
            statusToneClasses.failed
          )}
        >
          <AlertTriangleIcon aria-hidden="true" className="size-4" />
          {data.xeroSyncFailedCount} Xero{" "}
          {data.xeroSyncFailedCount === 1 ? "record needs" : "records need"}{" "}
          attention
        </span>
      ) : null}
    </div>
  );
}

function LegendItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  );
}

function RunwayDayHeader({
  maxAffected,
  orgQueryValue,
  summaries,
}: {
  maxAffected: number;
  orgQueryValue: string | null;
  summaries: ReturnType<typeof daySummary>[];
}) {
  const gridTemplateColumns = `13rem repeat(${summaries.length}, minmax(6.5rem, 1fr))`;
  return (
    <div
      className="sticky top-0 z-20 grid gap-px bg-surface-variant/40 px-3"
      style={{ gridTemplateColumns }}
    >
      <div className="sticky left-0 z-30 flex items-end bg-surface-container-high px-3 py-3">
        <span className="font-medium text-label-sm text-muted-foreground uppercase tracking-wide">
          People
        </span>
      </div>
      {summaries.map((summary) => (
        <CoverageDayHeader
          key={summary.dateOnly}
          maxAffected={maxAffected}
          orgQueryValue={orgQueryValue}
          summary={summary}
        />
      ))}
    </div>
  );
}

function CoverageDayHeader({
  maxAffected,
  orgQueryValue,
  summary,
}: {
  maxAffected: number;
  orgQueryValue: string | null;
  summary: ReturnType<typeof daySummary>;
}) {
  const pressure = Math.max(
    summary.distinctPeopleCount === 0 ? 6 : 18,
    Math.round((summary.distinctPeopleCount / maxAffected) * 100)
  );
  const pressureLabel =
    summary.distinctPeopleCount === 0
      ? "No recorded unavailability"
      : `${summary.distinctPeopleCount} ${summary.distinctPeopleCount === 1 ? "person" : "people"} affected`;

  return (
    <Link
      aria-label={`${formatFullDay(summary.date)}: ${pressureLabel}`}
      className={cn(
        "group relative flex min-h-28 flex-col justify-between bg-surface-container-high px-3 py-3 outline-none transition-colors hover:bg-surface-container-highest focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring",
        summary.isToday && "bg-primary-container text-on-primary-container"
      )}
      href={withOrg(
        `/calendar?view=day&anchor=${summary.dateOnly}`,
        orgQueryValue
      )}
    >
      {summary.isToday ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px bg-primary/45"
        />
      ) : null}
      <span className="relative flex items-start justify-between gap-2">
        <span>
          <span className="block font-medium text-label-sm uppercase tracking-wide opacity-75">
            {formatWeekday(summary.date)}
          </span>
          <span className="mt-1 block font-semibold text-title-lg tabular-nums">
            {summary.date.getUTCDate()}
          </span>
        </span>
        {summary.isToday ? (
          <span className="rounded-xl bg-primary px-2 py-1 font-medium text-label-md text-primary-foreground">
            Today
          </span>
        ) : (
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 opacity-0 transition-opacity group-hover:opacity-70"
          />
        )}
      </span>
      <span className="relative">
        <span className="flex items-center justify-between gap-2 text-label-md">
          <span className="font-medium tabular-nums">
            {summary.distinctPeopleCount} affected
          </span>
          {summary.holidayCount > 0 ? <span>Holiday</span> : null}
        </span>
        <span
          aria-hidden="true"
          className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-variant/60"
        >
          <span
            className={cn(
              "block h-full rounded-full",
              coverageToneClass(summary)
            )}
            style={{ width: `${pressure}%` }}
          />
        </span>
      </span>
    </Link>
  );
}

function TimelineLaneRow({
  days,
  index,
  lane,
  onSelect,
  orgQueryValue,
  selectedEventId,
}: {
  days: readonly CalendarDay[];
  index: number;
  lane: TimelineLane;
  onSelect: (event: CalendarEvent, trigger: HTMLButtonElement) => void;
  orgQueryValue: string | null;
  selectedEventId: string | null;
}) {
  const trackCount = Math.max(
    1,
    ...lane.segments.map(({ level }) => level + 1)
  );
  const personName = lane.person?.displayName ?? lane.fallbackName;
  const personMeta = [lane.person?.teamName, lane.person?.locationName]
    .filter(Boolean)
    .join(" · ");
  const gridTemplateColumns = `repeat(${days.length}, minmax(6.5rem, 1fr))`;
  const rowTone =
    index % 2 === 0
      ? "bg-surface-container-lowest"
      : "bg-surface-container-low";

  return (
    <div className={cn("grid grid-cols-[13rem_minmax(0,1fr)] gap-px", rowTone)}>
      <Link
        className={cn(
          "sticky left-0 z-10 flex min-w-0 items-center gap-2.5 px-3 py-3 outline-none hover:bg-surface-container-high focus-visible:ring-3 focus-visible:ring-ring",
          rowTone
        )}
        href={withOrg(`/people/${lane.personId}`, orgQueryValue)}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-semibold text-label-lg">
          {initialsForName(personName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-label-lg">
            {personName}
          </span>
          <span className="block truncate text-label-md text-muted-foreground">
            {lane.segments.length > 0
              ? personMeta || "Availability recorded"
              : "No recorded unavailability"}
          </span>
        </span>
      </Link>
      <div
        className="grid min-h-16 gap-px bg-surface-variant/30 py-2"
        style={{
          gridTemplateColumns,
          gridTemplateRows: `repeat(${trackCount}, minmax(2.5rem, auto))`,
        }}
      >
        {days.map((day, dayIndex) => (
          <span
            aria-hidden="true"
            className={cn(
              "relative bg-surface-container-lowest",
              index % 2 === 1 && "bg-surface-container-low",
              day.isToday &&
                "bg-primary-container/55 after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-primary/35"
            )}
            key={`${lane.personId}-${day.date.toISOString()}`}
            style={{
              gridColumn: `${dayIndex + 1}`,
              gridRow: `1 / ${trackCount + 1}`,
            }}
          />
        ))}
        {lane.segments.map((segment) => (
          <TimelineEventButton
            key={`${segment.event.id}-${segment.startIndex}-${segment.level}`}
            onSelect={onSelect}
            segment={segment}
            selected={selectedEventId === segment.event.id}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineEventButton({
  onSelect,
  segment,
  selected,
}: {
  onSelect: (event: CalendarEvent, trigger: HTMLButtonElement) => void;
  segment: TimelineSegment;
  selected: boolean;
}) {
  const { event } = segment;
  const tone = toneForCalendarEvent(event);
  const label =
    event.recordType === "private"
      ? "Private"
      : getAvailabilityRecordLabel(event.recordType);
  const ProvenanceIcon = isManualCalendarEvent(event) ? PencilIcon : LeafIcon;
  const duration = segment.endIndex - segment.startIndex + 1;
  const treatment = treatmentLabel(event.renderTreatment);

  return (
    <button
      aria-label={`${event.displayName}: ${label}, ${calendarEventSourceLabel(event)}${treatment ? `, ${treatment}` : ""}`}
      aria-pressed={selected}
      className={cn(
        "relative z-[1] m-1 flex min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-left font-medium text-label-md outline-none ring-1 transition-[filter,transform,box-shadow] hover:brightness-95 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring active:translate-y-px motion-safe:duration-200 motion-safe:ease-out",
        statusToneClasses[tone],
        event.renderTreatment === "dashed" && "border border-dashed opacity-90",
        event.renderTreatment === "draft" && "opacity-70",
        selected && "calendar-runway-selection ring-2 ring-primary"
      )}
      onClick={(clickEvent) => onSelect(event, clickEvent.currentTarget)}
      style={{
        gridColumn: `${segment.startIndex + 1} / ${segment.endIndex + 2}`,
        gridRow: `${segment.level + 1}`,
      }}
      type="button"
    >
      {event.renderTreatment === "failed" ? (
        <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <ProvenanceIcon aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {duration >= 3 ? (
        <span className="ml-auto shrink-0 font-semibold tabular-nums opacity-70">
          {duration}d
        </span>
      ) : null}
    </button>
  );
}

function RunwayDetail({
  event,
  onClose,
  orgQueryValue,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  orgQueryValue: string | null;
}) {
  if (!event) {
    return (
      <div className="calendar-runway-detail mx-3 mb-3 flex min-h-20 items-center gap-3 rounded-2xl bg-surface-container-lowest px-4 py-3 text-label-lg text-muted-foreground">
        <ArrowUpRightIcon aria-hidden="true" className="size-4 shrink-0" />
        Select an entry to see its dates, status, source and contactability.
      </div>
    );
  }

  const typeLabel =
    event.recordType === "private"
      ? "Private"
      : getAvailabilityRecordLabel(event.recordType);
  const sourceLabel = calendarEventSourceLabel(event);
  const SourceIcon = isManualCalendarEvent(event) ? PencilIcon : LeafIcon;

  return (
    <div
      aria-live="polite"
      className="calendar-runway-detail mx-3 mb-3 rounded-2xl bg-surface-container-lowest p-4 sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1",
              statusToneClasses[toneForCalendarEvent(event)]
            )}
          >
            <SourceIcon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-semibold text-title-md">
                {event.displayName} · {typeLabel}
              </h3>
              <span className="rounded-xl bg-surface-container-high px-2.5 py-1 font-medium text-label-sm text-muted-foreground">
                {sourceLabel}
              </span>
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {formatEventDateRange(event)}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-label-lg">
              <DetailDatum
                label="Status"
                value={approvalStatusLabel(event.approvalStatus) ?? "Unknown"}
              />
              {event.contactabilityStatus ? (
                <DetailDatum
                  label="Contactability"
                  value={
                    contactabilityLabel(event.contactabilityStatus) ?? "Unknown"
                  }
                />
              ) : null}
              {event.notesInternal ? (
                <DetailDatum label="Notes" value={event.notesInternal} />
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {event.isEditableByActor ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={withOrg(`/plans/${event.id}/edit`, orgQueryValue)}>
                View plan
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <span className="rounded-xl bg-surface-container-low px-3 py-2 text-label-lg text-muted-foreground">
              View-only access
            </span>
          )}
          <Button
            aria-label="Close entry details"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
      {event.xeroWriteError ? (
        <p
          className={cn(
            "mt-4 rounded-xl px-3 py-2 text-body-sm",
            statusToneClasses.failed
          )}
        >
          {event.xeroWriteError}
        </p>
      ) : null}
    </div>
  );
}

function DetailDatum({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-medium text-foreground">{label}: </span>
      {value}
    </span>
  );
}

function MobileRunway({
  data,
  maxAffected,
  onSelect,
  orgQueryValue,
  selectedEventId,
}: {
  data: CalendarRange;
  maxAffected: number;
  onSelect: (event: CalendarEvent, trigger: HTMLButtonElement) => void;
  orgQueryValue: string | null;
  selectedEventId: string | null;
}) {
  return (
    <ol aria-label="Team availability by day" className="space-y-2 px-3 pb-3">
      {data.days.map((day) => {
        const summary = daySummary(day);
        const pressure = Math.max(
          summary.distinctPeopleCount === 0 ? 6 : 18,
          Math.round((summary.distinctPeopleCount / maxAffected) * 100)
        );
        const dateOnly = day.date.toISOString().slice(0, 10);
        return (
          <li
            className={cn(
              "rounded-2xl bg-surface-container-lowest p-3",
              day.isToday && "ring-2 ring-primary"
            )}
            key={dateOnly}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-body-md">
                  {formatFullDay(day.date)}
                </p>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {summary.distinctPeopleCount === 0
                    ? "No recorded unavailability"
                    : `${summary.distinctPeopleCount} ${summary.distinctPeopleCount === 1 ? "person" : "people"} affected`}
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link
                  href={withOrg(
                    `/calendar?view=day&anchor=${dateOnly}`,
                    orgQueryValue
                  )}
                >
                  Open day
                </Link>
              </Button>
            </div>
            <span
              aria-hidden="true"
              className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-variant/60"
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  coverageToneClass(summary)
                )}
                style={{ width: `${pressure}%` }}
              />
            </span>
            {day.publicHolidays.length > 0 ? (
              <p className="mt-3 rounded-xl bg-warning-container px-3 py-2 text-body-sm text-on-warning-container">
                {day.publicHolidays.map(({ name }) => name).join(", ")}
              </p>
            ) : null}
            {day.events.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {day.events.map((event) => (
                  <li key={`${event.id}-${dateOnly}`}>
                    <MobileEventButton
                      event={event}
                      onSelect={onSelect}
                      selected={selectedEventId === event.id}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function MobileEventButton({
  event,
  onSelect,
  selected,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent, trigger: HTMLButtonElement) => void;
  selected: boolean;
}) {
  const label =
    event.recordType === "private"
      ? "Private"
      : getAvailabilityRecordLabel(event.recordType);
  const SourceIcon = isManualCalendarEvent(event) ? PencilIcon : LeafIcon;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left outline-none ring-1 focus-visible:ring-3 focus-visible:ring-ring",
        statusToneClasses[toneForCalendarEvent(event)],
        selected && "ring-2 ring-primary"
      )}
      onClick={(clickEvent) => onSelect(event, clickEvent.currentTarget)}
      type="button"
    >
      <SourceIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-label-lg">
          {event.displayName}
        </span>
        <span className="block truncate text-label-md opacity-75">
          {label} · {calendarEventSourceLabel(event)}
        </span>
      </span>
    </button>
  );
}

function RunwayEmptyState() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl bg-surface-container-lowest p-6 text-center text-label-lg text-muted-foreground">
      No people match this calendar scope.
    </div>
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
      } else {
        eventIndex.set(event.id, { dayIndexes: [dayIndex], event });
      }
    }
  }

  const lanes = new Map<string, TimelineLane>();
  for (const person of data.people) {
    lanes.set(person.id, {
      fallbackName: person.displayName,
      person,
      personId: person.id,
      segments: [],
    });
  }
  for (const { dayIndexes, event } of eventIndex.values()) {
    const lane = lanes.get(event.personId) ?? {
      fallbackName: event.displayName,
      person: null,
      personId: event.personId,
      segments: [],
    };
    for (const [startIndex, endIndex] of contiguousRuns(dayIndexes)) {
      lane.segments.push({ endIndex, event, level: 0, startIndex });
    }
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
      const firstAffected = first.segments.length > 0 ? 1 : 0;
      const secondAffected = second.segments.length > 0 ? 1 : 0;
      if (firstAffected !== secondAffected) {
        return secondAffected - firstAffected;
      }
      return (first.person?.displayName ?? first.fallbackName).localeCompare(
        second.person?.displayName ?? second.fallbackName
      );
    });
}

function contiguousRuns(dayIndexes: number[]): [number, number][] {
  const sorted = [...new Set(dayIndexes)].sort(
    (first, second) => first - second
  );
  const runs: [number, number][] = [];
  for (const index of sorted) {
    const current = runs.at(-1);
    if (current && index === current[1] + 1) {
      current[1] = index;
    } else {
      runs.push([index, index]);
    }
  }
  return runs;
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
  return lane.segments.some(({ event }) => event.renderTreatment === "failed");
}

function uniqueEvents(data: CalendarRange): CalendarEvent[] {
  const events = new Map<string, CalendarEvent>();
  for (const day of data.days) {
    for (const event of day.events) {
      events.set(event.id, event);
    }
  }
  return [...events.values()];
}

function daySummary(day: CalendarDay) {
  return {
    date: day.date,
    dateOnly: day.date.toISOString().slice(0, 10),
    distinctPeopleCount: new Set(day.events.map(({ personId }) => personId))
      .size,
    eventCount: day.events.length,
    failedCount: day.events.filter(
      ({ renderTreatment }) => renderTreatment === "failed"
    ).length,
    holidayCount: day.publicHolidays.length,
    isToday: day.isToday,
    manualCount: day.events.filter(
      ({ recordTypeCategory }) => recordTypeCategory === "local_only"
    ).length,
  };
}

function coverageToneClass(summary: ReturnType<typeof daySummary>): string {
  if (summary.failedCount > 0) {
    return "bg-destructive";
  }
  if (summary.eventCount === 0 && summary.holidayCount === 0) {
    return "bg-muted-foreground/30";
  }
  if (summary.manualCount > 0 && summary.manualCount >= summary.eventCount) {
    return "bg-on-accent-container";
  }
  if (summary.holidayCount > 0 && summary.eventCount === 0) {
    return "bg-warning";
  }
  return "bg-primary";
}

function treatmentLabel(
  treatment: CalendarEvent["renderTreatment"]
): string | null {
  if (treatment === "dashed") {
    return "Pending";
  }
  if (treatment === "draft") {
    return "Draft";
  }
  if (treatment === "failed") {
    return "Sync failed";
  }
  return null;
}

function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: "short",
  }).format(date);
}

function formatFullDay(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(date);
}

function formatEventDateRange(event: CalendarEvent): string {
  const dateFormatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const startDate = new Date(event.startsAt);
  const endDate = new Date(event.endsAt);
  const start = dateFormatter.format(startDate);
  const end = dateFormatter.format(endDate);
  if (!event.allDay) {
    return `${start}, ${timeFormatter.format(startDate)} to ${timeFormatter.format(endDate)}`;
  }
  return start === end ? start : `${start} to ${end}`;
}

function initialsForName(name: string): string {
  return name
    .trim()
    .split(namePartPattern)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

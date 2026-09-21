"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CircleAlertIcon,
  LeafIcon,
  MoveHorizontalIcon,
  PencilIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { withOrg } from "@/lib/navigation/org-url";
import type {
  AmbientCalendarDay,
  AmbientCalendarModel,
  AmbientCalendarProvenance,
  AmbientCalendarSignal,
  AmbientCalendarTone,
} from "./ambient-calendar-data";

interface AmbientCalendarFieldProps {
  model: AmbientCalendarModel;
  orgQueryValue: string | null;
}

const toneClasses: Record<
  AmbientCalendarTone,
  { marker: string; selected: string; status: string }
> = {
  danger: {
    marker: "bg-destructive ring-error-container",
    selected: "bg-error-container ring-destructive",
    status: "text-destructive",
  },
  manual: {
    marker: "bg-accent-container ring-editorial-accent/30",
    selected: "bg-accent-container ring-editorial-accent",
    status: "text-on-accent-container",
  },
  neutral: {
    marker: "bg-surface-variant ring-surface-container",
    selected: "bg-surface-container-lowest ring-primary",
    status: "text-muted-foreground",
  },
  primary: {
    marker: "bg-primary ring-primary/20",
    selected: "bg-surface-container-lowest ring-primary",
    status: "text-primary",
  },
  warning: {
    marker: "bg-warning ring-warning-container",
    selected: "bg-warning-container ring-warning",
    status: "text-on-warning-container",
  },
};

export function AmbientCalendarField({
  model,
  orgQueryValue,
}: AmbientCalendarFieldProps) {
  const [selectedDateKey, setSelectedDateKey] = useState(model.startDateKey);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const selectedDay =
    model.days.find((day) => day.dateKey === selectedDateKey) ?? model.days[0];

  if (!selectedDay) {
    return null;
  }

  const selectDay = (day: AmbientCalendarDay) => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion || !("startViewTransition" in document)) {
      setSelectedDateKey(day.dateKey);
      return;
    }

    document.startViewTransition(() => {
      flushSync(() => setSelectedDateKey(day.dateKey));
    });
  };

  const moveSelection = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const lastIndex = model.days.length - 1;
    let nextIndex = index;

    if (event.key === "ArrowRight") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    const nextDay = model.days[nextIndex];
    if (!nextDay) {
      return;
    }
    selectDay(nextDay);
    tabRefs.current[nextIndex]?.focus();
    tabRefs.current[nextIndex]?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl bg-surface-container p-4 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
              <CalendarDaysIcon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h3 className="font-semibold text-title-lg" id={`${id}-title`}>
                {model.title}
              </h3>
              <p className="text-body-sm text-muted-foreground">
                {model.description}
              </p>
            </div>
          </div>
        </div>
        <Button asChild className="self-start" size="sm" variant="ghost">
          <Link href={withOrg(model.href, orgQueryValue)}>
            Open calendar
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>

      {model.mode === "team" ? (
        <div className="mt-6 flex items-center justify-between gap-4 text-label-sm text-muted-foreground">
          <span className="font-medium text-on-surface-variant">
            People unavailable
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MoveHorizontalIcon aria-hidden="true" className="size-3.5" />
            Scroll to scan 14 days
          </span>
        </div>
      ) : null}

      <div
        aria-label={`${model.title}, horizontally scrollable chronological 14-day timeline`}
        aria-orientation="horizontal"
        className={`${model.mode === "team" ? "mt-3" : "mt-6"} ambient-calendar-scroll snap-x snap-mandatory overflow-x-auto pb-2`}
        role="tablist"
      >
        <div
          className={`relative grid grid-cols-[repeat(14,minmax(4rem,1fr))] gap-1.5 py-1 before:pointer-events-none before:absolute before:right-7 before:left-7 before:h-px before:bg-surface-variant ${
            model.mode === "team"
              ? "min-w-[70rem] before:top-[7.75rem]"
              : "min-w-[63rem] before:top-[4.4rem]"
          }`}
        >
          {model.days.map((day, index) => {
            const selected = day.dateKey === selectedDay.dateKey;
            const tone = toneClasses[day.tone];
            return (
              <button
                aria-controls={`${id}-panel`}
                aria-label={day.accessibleLabel}
                aria-selected={selected}
                className={`group relative snap-center scroll-mx-4 rounded-xl px-1.5 py-2 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring ${
                  model.mode === "team" ? "min-h-40" : "min-h-32"
                }`}
                id={`${id}-tab-${day.dateKey}`}
                key={day.dateKey}
                onClick={() => selectDay(day)}
                onKeyDown={(event) => moveSelection(event, index)}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {selected ? (
                  <span
                    aria-hidden="true"
                    className={`ambient-calendar-selection absolute inset-0 rounded-xl ring-2 ${tone.selected}`}
                  />
                ) : null}
                <span className="relative z-10 flex h-full flex-col items-center">
                  <span className="font-medium text-label-sm text-muted-foreground uppercase tracking-wide">
                    {weekdayFromLabel(day.label)}
                  </span>
                  <span className="mt-1 font-semibold text-title-lg tabular-nums">
                    {dateFromLabel(day.label)}
                  </span>
                  {model.mode === "team" ? (
                    <TeamCoverageMark day={day} />
                  ) : (
                    <>
                      <span
                        aria-hidden="true"
                        className={`mt-3 size-3 rounded-full ring-4 ${tone.marker}`}
                      />
                      <span
                        className={`mt-3 line-clamp-1 font-medium text-label-sm ${tone.status}`}
                      >
                        {statusLabel(day, model.mode)}
                      </span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-labelledby={`${id}-tab-${selectedDay.dateKey}`}
        className="ambient-calendar-detail mt-4 rounded-2xl bg-surface-container-lowest p-4 sm:p-5"
        id={`${id}-panel`}
        role="tabpanel"
      >
        <TimelineDayDetail day={selectedDay} mode={model.mode} />
      </div>
    </section>
  );
}

function TeamCoverageMark({ day }: { day: AmbientCalendarDay }) {
  const label = coverageAxisLabel(day);

  return (
    <span aria-hidden="true" className="mt-3 flex flex-col items-center">
      <span className="relative z-10 flex h-14 items-end justify-center">
        {day.coverage ? (
          <span
            className={`w-4 rounded-t-xl transition-[height] duration-300 ease-out motion-reduce:transition-none ${coverageBarClass(day)}`}
            style={{ height: `${day.coverage.ratio * 100}%` }}
          />
        ) : null}
      </span>
      <span
        className={`mt-2 whitespace-nowrap font-medium text-label-sm ${
          day.coverage ? "text-on-surface" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

function coverageAxisLabel(day: AmbientCalendarDay): string {
  if (!day.coverage) {
    return "No signal";
  }
  const count = `${day.coverage.awayCount}/${day.coverage.totalCount}`;
  return day.confidence === "exact" ? `${count} live` : `${count} peak`;
}

function coverageBarClass(day: AmbientCalendarDay): string {
  if (day.tone === "danger") {
    return "bg-destructive";
  }
  return day.confidence === "threshold-only" ? "bg-warning" : "bg-primary";
}

function TimelineDayDetail({
  day,
  mode,
}: {
  day: AmbientCalendarDay;
  mode: AmbientCalendarModel["mode"];
}) {
  const confidence = confidenceLabel(day, mode);
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-title-md">{day.label}</h4>
          <span className="inline-flex min-h-7 items-center gap-1.5 rounded-xl bg-surface-container-high px-2.5 py-1 font-medium text-label-sm text-on-surface-variant">
            {confidence.icon}
            {confidence.label}
          </span>
        </div>
        <p className="mt-2 max-w-[65ch] text-body-md text-muted-foreground">
          {day.detailLabel}
        </p>
      </div>
      <SignalList day={day} mode={mode} />
    </div>
  );
}

function SignalList({
  day,
  mode,
}: {
  day: AmbientCalendarDay;
  mode: AmbientCalendarModel["mode"];
}) {
  if (day.signals.length === 0) {
    let label = "No leave or availability record is scheduled for this date.";
    if (day.confidence === "unknown") {
      label =
        mode === "team"
          ? "No coverage peak is flagged for this date."
          : "Schedule data is unavailable for this date.";
    }
    return (
      <p className="rounded-xl bg-surface-container-low p-3 text-body-sm text-muted-foreground">
        {label}
      </p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {day.signals.slice(0, 6).map((signal) => (
        <li
          className="flex min-h-11 items-center gap-2.5 rounded-xl bg-surface-container-low px-3 py-2 text-body-sm"
          key={signal.id}
        >
          <SignalIcon signal={signal} />
          <span className="min-w-0 truncate">{signal.label}</span>
        </li>
      ))}
    </ul>
  );
}

function SignalIcon({ signal }: { signal: AmbientCalendarSignal }) {
  if (
    (signal.kind === "team-person" && signal.xeroSyncFailedCount > 0) ||
    (signal.kind === "team-summary" && signal.xeroSyncFailedCount > 0) ||
    (signal.kind === "personal-record" &&
      signal.approvalStatus === "xero_sync_failed")
  ) {
    return (
      <CircleAlertIcon
        aria-label="Needs attention"
        className="size-4 shrink-0 text-destructive"
      />
    );
  }
  if (signal.kind === "personal-record" && signal.provenance) {
    return <ProvenanceIcon provenance={signal.provenance} />;
  }
  if (signal.kind === "team-peak") {
    return (
      <SparklesIcon
        aria-label="Coverage peak"
        className="size-4 shrink-0 text-warning"
      />
    );
  }
  if (signal.kind === "holiday") {
    return (
      <CalendarDaysIcon
        aria-label="Public holiday"
        className="size-4 shrink-0 text-warning"
      />
    );
  }
  return (
    <UsersIcon
      aria-label="Availability signal"
      className="size-4 shrink-0 text-primary"
    />
  );
}

function ProvenanceIcon({
  provenance,
}: {
  provenance: AmbientCalendarProvenance;
}) {
  if (provenance === "manual") {
    return (
      <PencilIcon
        aria-label="Manual record"
        className="size-4 shrink-0 text-on-accent-container"
      />
    );
  }
  return (
    <LeafIcon
      aria-label={
        provenance === "xero" ? "Xero record" : "Team Calendar record"
      }
      className="size-4 shrink-0 text-primary"
    />
  );
}

function confidenceLabel(
  day: AmbientCalendarDay,
  mode: AmbientCalendarModel["mode"]
): { icon: ReactNode; label: string } {
  if (day.confidence === "exact") {
    return {
      icon: <UsersIcon aria-hidden="true" className="size-3.5" />,
      label: "Live team status",
    };
  }
  if (day.confidence === "threshold-only") {
    return {
      icon: <SparklesIcon aria-hidden="true" className="size-3.5" />,
      label: "Coverage peak",
    };
  }
  return {
    icon: <CalendarDaysIcon aria-hidden="true" className="size-3.5" />,
    label: mode === "personal" ? "Personal schedule" : "Forecast signal",
  };
}

function statusLabel(
  day: AmbientCalendarDay,
  mode: AmbientCalendarModel["mode"]
): string {
  if (day.tone === "danger") {
    return "Issue";
  }
  if (day.confidence === "threshold-only") {
    return "Peak";
  }
  if (day.isToday) {
    return "Today";
  }
  if (mode === "personal") {
    if (day.confidence === "unknown") {
      return "No data";
    }
    return day.signals.length > 0 ? "Planned" : "Clear";
  }
  if (day.signals.length > 0) {
    return "Leave";
  }
  return "No peak";
}

function weekdayFromLabel(label: string): string {
  return label.split(",", 1)[0] ?? label;
}

function dateFromLabel(label: string): string {
  return label.split(",")[1]?.trim() ?? label;
}

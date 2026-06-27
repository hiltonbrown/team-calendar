import { UserIcon } from "lucide-react";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import type { CoverageDay } from "./coverage-timeline-data";

interface CoverageTimelineProps {
  className?: string;
  days: CoverageDay[];
  orgQueryValue: string | null;
  total: number;
}

const MIN_BAR_PX = 4;
const BASE_BAR_PX = 24;
const RANGE_BAR_PX = 80;

function barHeightPx(awayCount: number, total: number): number {
  if (awayCount <= 0) {
    return MIN_BAR_PX;
  }
  const ratio = total > 0 ? Math.min(1, awayCount / total) : 0;
  return Math.round(BASE_BAR_PX + ratio * RANGE_BAR_PX);
}

function barClassName(
  isToday: boolean,
  hasAway: boolean,
  isWeekend: boolean
): string {
  const base = "w-full rounded-t-md transition-colors duration-200";
  if (hasAway) {
    return isToday
      ? `${base} bg-primary`
      : `${base} bg-primary/35 group-hover:bg-primary/60`;
  }
  if (isWeekend) {
    return `${base} bg-border/40`;
  }
  return `${base} bg-border group-hover:bg-border/70`;
}

function labelClassName(isToday: boolean, isWeekend: boolean): string {
  const base = "mt-2 text-label-sm uppercase";
  if (isToday) {
    return `${base} font-bold text-foreground`;
  }
  if (isWeekend) {
    return `${base} font-medium text-muted-foreground/50`;
  }
  return `${base} font-medium text-muted-foreground`;
}

/**
 * Coverage centrepiece for the manager dashboard: today's real away count plus
 * forecast peaks across the fortnight, scannable at a glance. Pure server
 * component, rendered visible by default (no entrance gate), so it never ships
 * blank on a headless render and needs no reduced-motion fallback.
 */
export function CoverageTimeline({
  className,
  days,
  orgQueryValue,
  total,
}: CoverageTimelineProps) {
  const todayCount = days[0]?.awayCount ?? 0;
  const peakDaysAhead = days.slice(1).filter((day) => day.awayCount > 0).length;

  return (
    <section
      className={`flex flex-col gap-6 rounded-2xl bg-muted p-6 ${className ?? ""}`}
    >
      <div>
        <p className="font-medium text-label-sm text-muted-foreground uppercase tracking-widest">
          Coverage
        </p>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <p className="font-semibold text-display-md text-foreground leading-none tracking-tight">
            {todayCount}
          </p>
          <p className="text-body-sm text-muted-foreground">
            away today{total > 0 ? ` of ${total}` : ""}
          </p>
        </div>
      </div>

      <div className="flex h-[140px] items-end justify-between gap-1 sm:gap-1.5">
        {days.map((day, index) => {
          const isToday = index === 0;
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
          const hasAway = day.awayCount > 0;
          const alignRight = index >= days.length / 2;

          return (
            <div
              className="group relative flex flex-1 flex-col items-center justify-end"
              key={day.date.toISOString()}
            >
              {hasAway ? (
                <div
                  className={`pointer-events-none absolute bottom-[calc(100%+0.5rem)] z-30 hidden min-w-[10rem] flex-col rounded-xl bg-popover p-3 text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:flex group-hover:opacity-100 ${
                    alignRight ? "right-0" : "left-0"
                  }`}
                >
                  <p className="mb-2 border-border/60 border-b pb-2 font-medium text-label-sm text-muted-foreground">
                    {day.date.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      weekday: "short",
                    })}
                  </p>
                  {day.names.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {day.names.map((name) => (
                        <div className="flex items-center gap-2" key={name}>
                          <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                            <UserIcon className="size-3" strokeWidth={2} />
                          </span>
                          <span className="font-medium text-label-lg">
                            {name}
                          </span>
                        </div>
                      ))}
                      {day.extraCount > 0 ? (
                        <p className="text-label-lg text-muted-foreground">
                          and {day.extraCount} more away
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-label-lg text-muted-foreground">
                      {day.awayCount} away
                    </p>
                  )}
                </div>
              ) : null}

              <div
                className={barClassName(isToday, hasAway, isWeekend)}
                style={{ height: `${barHeightPx(day.awayCount, total)}px` }}
              />
              <span className={labelClassName(isToday, isWeekend)}>
                {day.date
                  .toLocaleDateString("en-AU", { weekday: "short" })
                  .charAt(0)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-label-md text-muted-foreground">
          {peakDaysAhead > 0
            ? `${peakDaysAhead} peak ${peakDaysAhead === 1 ? "day" : "days"} forecast`
            : "No peaks forecast"}
        </p>
        <Link
          className="font-medium text-body-sm text-primary transition-opacity hover:opacity-70"
          href={withOrg("/calendar?scopeType=my_team", orgQueryValue)}
        >
          Team calendar &rarr;
        </Link>
      </div>
    </section>
  );
}

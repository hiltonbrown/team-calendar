import type { CalendarRange } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { statusToneClasses } from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";
import { CalendarCreateLauncher } from "./calendar-create-launcher";
import { CalendarEventChip } from "./calendar-event-chip";

interface CalendarMonthViewProps {
  actingPersonId: string | null;
  data: CalendarRange;
  maxEventsPerDay?: number;
  orgQueryValue: string | null;
  selectedPersonId: string | null;
}

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarMonthView({
  actingPersonId,
  data,
  maxEventsPerDay = 3,
  orgQueryValue,
  selectedPersonId,
}: CalendarMonthViewProps) {
  const createPersonId = selectedPersonId ?? actingPersonId;
  const firstVisibleMonth =
    data.days[Math.min(7, data.days.length - 1)]?.date.getUTCMonth();

  return (
    <section className="space-y-3">
      {data.truncated && (
        <div className="rounded-2xl bg-muted p-4 text-muted-foreground text-sm">
          Showing {data.people.length} of {data.totalPeopleInScope} people.
          Narrow the scope or filters to see everyone.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-muted p-1">
        <div className="grid grid-cols-7 gap-1">
          {dayLabels.map((label) => (
            <div
              className="p-2 text-center font-medium text-muted-foreground text-xs uppercase tracking-wide"
              key={label}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {data.days.map((day) => {
            const dateOnly = day.date.toISOString().slice(0, 10);
            const visibleEvents = day.events.slice(0, maxEventsPerDay);
            const hiddenCount = day.events.length - visibleEvents.length;
            return (
              <CalendarCreateLauncher
                className={cn(
                  "min-h-36 rounded-xl bg-background p-2 hover:bg-background/80",
                  day.isToday && "ring-2 ring-primary/30",
                  firstVisibleMonth !== undefined &&
                    day.date.getUTCMonth() !== firstVisibleMonth &&
                    "opacity-50"
                )}
                key={dateOnly}
                personId={createPersonId}
                startsAt={dateOnly}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-xl font-medium text-sm tabular-nums",
                      day.isToday && "bg-primary text-primary-foreground",
                      day.publicHolidays.length > 0 &&
                        "underline decoration-2 decoration-on-accent-container underline-offset-4"
                    )}
                  >
                    {day.date.getUTCDate()}
                  </span>
                  {day.publicHolidays.length > 0 && (
                    <span
                      className={`rounded-lg px-1.5 py-0.5 text-xs ${statusToneClasses.holiday}`}
                    >
                      Holiday
                    </span>
                  )}
                </span>
                <span className="mt-2 block space-y-1.5">
                  {visibleEvents.map((event) => (
                    <CalendarEventChip
                      event={event}
                      key={`${event.id}-${dateOnly}`}
                      orgQueryValue={orgQueryValue}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={withOrg(
                          `/calendar?view=day&anchor=${dateOnly}`,
                          orgQueryValue
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                        +{hiddenCount} more
                      </Link>
                    </Button>
                  )}
                </span>
              </CalendarCreateLauncher>
            );
          })}
        </div>
      </div>
    </section>
  );
}

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
      {data.truncated ? (
        <div className="rounded-2xl bg-muted p-4 text-muted-foreground text-sm">
          Showing {data.people.length} of {data.totalPeopleInScope} people.
          Narrow the scope or filters to see everyone.
        </div>
      ) : null}

      <section
        aria-label="Month calendar"
        className="hidden overflow-x-auto rounded-2xl bg-muted p-1 md:block"
      >
        <div className="grid min-w-[56rem] grid-cols-7 gap-1">
          {dayLabels.map((label) => (
            <div
              className="p-2 text-center font-medium text-muted-foreground text-xs uppercase tracking-wide"
              key={label}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="mt-1 grid min-w-[56rem] grid-cols-7 gap-1">
          {data.days.map((day) => {
            const dateOnly = day.date.toISOString().slice(0, 10);
            const visibleEvents = day.events.slice(0, maxEventsPerDay);
            const hiddenCount = day.events.length - visibleEvents.length;
            return (
              <div
                className={cn(
                  "flex min-h-36 flex-col justify-between rounded-xl bg-background p-2",
                  day.isToday && "ring-2 ring-primary/30",
                  firstVisibleMonth !== undefined &&
                    day.date.getUTCMonth() !== firstVisibleMonth &&
                    "opacity-50"
                )}
                key={dateOnly}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
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
                  </div>
                  <div className="space-y-1.5">
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
                        >
                          +{hiddenCount} more
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
                <CalendarCreateLauncher
                  className="mt-2 w-full"
                  date={day.date}
                  personId={createPersonId}
                  startsAt={dateOnly}
                />
              </div>
            );
          })}
        </div>
      </section>
      <section
        aria-label="Month agenda"
        className="space-y-3 rounded-[20px] bg-muted p-3 md:hidden"
      >
        {data.days.map((day) => {
          const dateOnly = day.date.toISOString().slice(0, 10);
          const dateLabel = new Intl.DateTimeFormat("en-AU", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
            weekday: "long",
            year: "numeric",
          }).format(day.date);
          return (
            <article
              className={cn(
                "min-w-0 rounded-xl bg-background p-3",
                day.isToday && "ring-2 ring-primary/30"
              )}
              key={dateOnly}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">{dateLabel}</h3>
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={withOrg(
                      `/calendar?view=day&anchor=${dateOnly}`,
                      orgQueryValue
                    )}
                  >
                    View day
                  </Link>
                </Button>
              </div>
              {day.publicHolidays.map((holiday) => (
                <p
                  className={`mt-2 rounded-xl px-2.5 py-1.5 text-sm ${statusToneClasses.holiday}`}
                  key={holiday.name}
                >
                  {holiday.name}
                </p>
              ))}
              <div className="mt-2 space-y-2">
                {day.events.length > 0 ? (
                  day.events.map((event) => (
                    <CalendarEventChip
                      event={event}
                      key={`${event.id}-${dateOnly}-agenda`}
                      orgQueryValue={orgQueryValue}
                    />
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No leave or availability
                  </p>
                )}
              </div>
              <CalendarCreateLauncher
                className="mt-3 w-full"
                date={day.date}
                personId={createPersonId}
                startsAt={dateOnly}
              />
            </article>
          );
        })}
      </section>
    </section>
  );
}

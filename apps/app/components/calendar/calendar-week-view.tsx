import type { CalendarRange } from "@repo/availability";
import { cn } from "@repo/design-system/lib/utils";
import { statusToneClasses } from "@/components/availability/availability-status";
import { CalendarCreateLauncher } from "./calendar-create-launcher";
import { CalendarEventChip } from "./calendar-event-chip";

interface CalendarWeekViewProps {
  actingPersonId: string | null;
  data: CalendarRange;
  orgQueryValue: string | null;
  selectedPersonId: string | null;
}

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarWeekView({
  actingPersonId,
  data,
  orgQueryValue,
  selectedPersonId,
}: CalendarWeekViewProps) {
  const createPersonId = selectedPersonId ?? actingPersonId;

  return (
    <section
      aria-label="Calendar week view"
      className="overflow-x-auto rounded-2xl bg-muted p-1"
    >
      <div className="grid min-w-[56rem] grid-cols-7 gap-1">
        {data.days.map((day) => {
          const dateOnly = day.date.toISOString().slice(0, 10);
          return (
            <div
              aria-current={day.isToday ? "date" : undefined}
              className={cn(
                "rounded-xl bg-background p-3 text-center",
                day.isToday && "bg-primary text-primary-foreground"
              )}
              key={`header-${dateOnly}`}
            >
              <h3 id={`week-day-${dateOnly}`}>
                <span
                  aria-hidden="true"
                  className="block font-medium text-label-md uppercase tracking-wide"
                >
                  {dayLabels[day.dayOfWeek]}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 block font-semibold text-body-lg tabular-nums"
                >
                  {day.date.getUTCDate()}
                </span>
                <span className="sr-only">{formatAccessibleDay(day.date)}</span>
              </h3>
            </div>
          );
        })}
      </div>

      {data.days.some((day) => day.publicHolidays.length > 0) && (
        <div className="mt-1 grid min-w-[56rem] grid-cols-7 gap-1">
          {data.days.map((day) => (
            <div
              className={`min-h-12 rounded-xl p-2 text-label-md ${statusToneClasses.holiday}`}
              key={`holidays-${day.date.toISOString()}`}
            >
              {day.publicHolidays.length > 0 ? (
                <ul
                  aria-label={`${formatAccessibleDay(day.date)} public holidays`}
                >
                  {day.publicHolidays.map((holiday) => (
                    <li className="truncate font-medium" key={holiday.name}>
                      {holiday.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 grid min-w-[56rem] grid-cols-7 gap-1">
        {data.days.map((day) => {
          const dateOnly = day.date.toISOString().slice(0, 10);
          return (
            <section
              aria-labelledby={`week-day-${dateOnly}`}
              className={cn(
                "flex min-h-72 flex-col justify-between rounded-xl bg-background p-2",
                day.isToday && "ring-2 ring-primary/30"
              )}
              key={dateOnly}
            >
              {day.events.length > 0 ? (
                <ul aria-label="Events" className="space-y-2">
                  {day.events.map((event) => (
                    <li key={`${event.id}-${dateOnly}`}>
                      <CalendarEventChip
                        event={event}
                        orgQueryValue={orgQueryValue}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="sr-only">No leave or availability</span>
              )}
              <CalendarCreateLauncher
                className="mt-2 w-full"
                date={day.date}
                personId={createPersonId}
                startsAt={dateOnly}
              />
            </section>
          );
        })}
      </div>
    </section>
  );
}

function formatAccessibleDay(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(date);
}

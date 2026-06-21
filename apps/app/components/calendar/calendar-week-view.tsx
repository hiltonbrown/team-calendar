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
    <section className="overflow-x-auto rounded-2xl bg-muted p-1">
      <div className="grid min-w-[56rem] grid-cols-7 gap-1">
        {data.days.map((day) => (
          <div
            className={cn(
              "rounded-xl bg-background p-3 text-center",
              day.isToday && "bg-primary text-primary-foreground"
            )}
            key={`header-${day.date.toISOString()}`}
          >
            <p className="font-medium text-xs uppercase tracking-wide">
              {dayLabels[day.dayOfWeek]}
            </p>
            <p className="mt-1 font-semibold text-lg tabular-nums">
              {day.date.getUTCDate()}
            </p>
          </div>
        ))}
      </div>

      {data.days.some((day) => day.publicHolidays.length > 0) && (
        <div className="mt-1 grid min-w-[56rem] grid-cols-7 gap-1">
          {data.days.map((day) => (
            <div
              className={`min-h-12 rounded-xl p-2 text-xs ${statusToneClasses.holiday}`}
              key={`holidays-${day.date.toISOString()}`}
            >
              {day.publicHolidays.map((holiday) => (
                <p className="truncate font-medium" key={holiday.name}>
                  {holiday.name}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 grid min-w-[56rem] grid-cols-7 gap-1">
        {data.days.map((day) => {
          const dateOnly = day.date.toISOString().slice(0, 10);
          const allDayEvents = day.events.filter((event) => event.allDay);
          const timedEvents = day.events.filter((event) => !event.allDay);
          return (
            <CalendarCreateLauncher
              className={cn(
                "min-h-72 rounded-xl bg-background p-2 hover:bg-background/80",
                day.isToday && "ring-2 ring-primary/30"
              )}
              key={dateOnly}
              personId={createPersonId}
              startsAt={dateOnly}
            >
              <span className="block space-y-2">
                {allDayEvents.map((event) => (
                  <CalendarEventChip
                    event={event}
                    key={`${event.id}-${dateOnly}-all-day`}
                    orgQueryValue={orgQueryValue}
                  />
                ))}
                {timedEvents.map((event) => (
                  <CalendarEventChip
                    event={event}
                    key={`${event.id}-${dateOnly}-timed`}
                    orgQueryValue={orgQueryValue}
                  />
                ))}
              </span>
            </CalendarCreateLauncher>
          );
        })}
      </div>
    </section>
  );
}

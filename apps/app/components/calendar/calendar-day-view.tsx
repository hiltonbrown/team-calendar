import type { CalendarRange } from "@repo/availability";
import { statusToneClasses } from "@/components/availability/availability-status";
import { CalendarCreateLauncher } from "./calendar-create-launcher";
import { CalendarEventChip } from "./calendar-event-chip";

interface CalendarDayViewProps {
  actingPersonId: string | null;
  data: CalendarRange;
  orgQueryValue: string | null;
  selectedPersonId: string | null;
}

const hours = Array.from({ length: 15 }, (_, index) => index + 6);

export function CalendarDayView({
  actingPersonId,
  data,
  orgQueryValue,
  selectedPersonId,
}: CalendarDayViewProps) {
  const day = data.days[0];
  if (!day) {
    return null;
  }
  const allDayEvents = day.events.filter((event) => event.allDay);
  const timedEvents = day.events.filter((event) => !event.allDay);
  const createPersonId = selectedPersonId ?? actingPersonId;
  const dateOnly = day.date.toISOString().slice(0, 10);

  return (
    <section className="rounded-2xl bg-muted p-4">
      {day.publicHolidays.length > 0 && (
        <div className="mb-4 space-y-2">
          {day.publicHolidays.map((holiday) => (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${statusToneClasses.holiday}`}
              key={holiday.name}
            >
              <p className="font-medium">{holiday.name}</p>
              <p className="text-xs opacity-75">
                {holiday.appliesToAllLocationsInView
                  ? "All locations"
                  : holiday.locationNames.join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}

      {day.events.length === 0 ? (
        <CalendarCreateLauncher
          className="flex min-h-60 w-full items-center justify-center rounded-2xl bg-background text-muted-foreground"
          personId={createPersonId}
          startsAt={dateOnly}
        >
          No leave or availability for this day
        </CalendarCreateLauncher>
      ) : (
        <div className="space-y-4">
          {allDayEvents.length > 0 && (
            <div className="space-y-2 rounded-2xl bg-background p-3">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                All day
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {allDayEvents.map((event) => (
                  <CalendarEventChip
                    event={event}
                    key={`${event.id}-${dateOnly}`}
                    orgQueryValue={orgQueryValue}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl bg-background">
            {hours.map((hour) => {
              const hourEvents = timedEvents.filter(
                (event) => new Date(event.startsAt).getUTCHours() === hour
              );
              return (
                <CalendarCreateLauncher
                  className="grid min-h-16 w-full grid-cols-[4rem_1fr] gap-3 px-3 py-2 text-left hover:bg-muted/60"
                  key={hour}
                  personId={createPersonId}
                  startsAt={`${dateOnly}T${String(hour).padStart(2, "0")}:00:00.000Z`}
                >
                  <span className="pt-1 text-muted-foreground text-xs tabular-nums">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                  <span className="space-y-2">
                    {hourEvents.map((event) => (
                      <CalendarEventChip
                        event={event}
                        key={`${event.id}-${hour}`}
                        orgQueryValue={orgQueryValue}
                      />
                    ))}
                  </span>
                </CalendarCreateLauncher>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

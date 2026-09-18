import type { CalendarRange } from "@repo/availability";
import { statusToneClasses } from "@/components/availability/availability-status";
import { CalendarCreateLauncher } from "./calendar-create-launcher";
import { CalendarEventChip } from "./calendar-event-chip";
import { hourInTimeZone } from "./calendar-local-time";

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
  const [day] = data.days;
  if (!day) {
    return null;
  }
  const allDayEvents = day.events.filter((event) => event.allDay);
  const timedEvents = day.events.filter((event) => !event.allDay);
  const earlierEvents = timedEvents.filter(
    (event) => hourInTimeZone(new Date(event.startsAt), data.range.timezone) < 6
  );
  const laterEvents = timedEvents.filter(
    (event) =>
      hourInTimeZone(new Date(event.startsAt), data.range.timezone) > 20
  );
  const createPersonId = selectedPersonId ?? actingPersonId;
  const dateOnly = day.date.toISOString().slice(0, 10);
  const accessibleDate = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(day.date);

  return (
    <section
      aria-label={`Calendar day view for ${accessibleDate}`}
      className="rounded-2xl bg-muted p-4"
    >
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

          <OffHoursGroup
            events={earlierEvents}
            label="Earlier than 06:00"
            orgQueryValue={orgQueryValue}
          />

          <div className="overflow-hidden rounded-2xl bg-background">
            {hours.map((hour) => {
              const hourLabel = `${String(hour).padStart(2, "0")}:00`;
              const startsAt = `${dateOnly}T${hourLabel}:00.000Z`;
              const hourEvents = timedEvents.filter(
                (event) =>
                  hourInTimeZone(
                    new Date(event.startsAt),
                    data.range.timezone
                  ) === hour
              );
              return (
                <div
                  className="grid min-h-16 grid-cols-[4rem_1fr] gap-3 px-3 py-2"
                  key={hour}
                >
                  <time
                    className="pt-1 text-muted-foreground text-xs tabular-nums"
                    dateTime={startsAt}
                  >
                    {hourLabel}
                  </time>
                  <div className="space-y-2">
                    {hourEvents.map((event) => (
                      <CalendarEventChip
                        event={event}
                        key={`${event.id}-${hour}`}
                        orgQueryValue={orgQueryValue}
                      />
                    ))}
                    <CalendarCreateLauncher
                      className="w-fit"
                      personId={createPersonId}
                      startsAt={startsAt}
                    >
                      Add at {hourLabel}
                    </CalendarCreateLauncher>
                  </div>
                </div>
              );
            })}
          </div>
          <OffHoursGroup
            events={laterEvents}
            label="Later than 20:59"
            orgQueryValue={orgQueryValue}
          />
        </div>
      )}
    </section>
  );
}

function OffHoursGroup({
  events,
  label,
  orgQueryValue,
}: {
  events: CalendarRange["days"][number]["events"];
  label: string;
  orgQueryValue: string | null;
}) {
  if (events.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2 rounded-2xl bg-background p-3">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </h3>
      <div className="grid gap-2 md:grid-cols-2">
        {events.map((event) => (
          <CalendarEventChip
            event={event}
            key={event.id}
            orgQueryValue={orgQueryValue}
          />
        ))}
      </div>
    </section>
  );
}

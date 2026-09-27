export function hourInTimeZone(value: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    hour12: false,
    timeZone: timezone,
  })
    .formatToParts(value)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0") % 24;
}

export function formatCalendarEventDateRange(
  event: { allDay: boolean; startsAt: Date; endsAt: Date },
  timezone: string
): string {
  const timeZone = event.allDay ? "UTC" : timezone;
  const dateFormatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone,
    year: "numeric",
  });
  const startDate = new Date(event.startsAt);
  const endDate = new Date(event.endsAt);
  const start = dateFormatter.format(startDate);
  const end = dateFormatter.format(endDate);
  if (event.allDay) {
    return start === end ? start : `${start} to ${end}`;
  }
  const timeFormatter = new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  });
  const startTime = timeFormatter.format(startDate);
  const endTime = timeFormatter.format(endDate);
  return start === end
    ? `${start}, ${startTime} to ${endTime}`
    : `${start}, ${startTime} to ${end}, ${endTime}`;
}

const HOUR_MS = 3_600_000;

export function formatPlanDateTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function wallClockToInstant(
  date: string,
  time: string,
  timezone: string
): Date {
  const target = new Date(`${date}T${time}:00.000Z`).getTime();
  if (!Number.isFinite(target)) {
    return new Date(Number.NaN);
  }
  // Offsets on either side cover daylight-saving transitions. Repeated hours
  // choose the earliest matching instant; nonexistent local times are rejected.
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const probe = new Date(target + hours * HOUR_MS);
    const local = formatPlanDateTime(probe, timezone);
    offsets.add(
      new Date(`${local.date}T${local.time}:00.000Z`).getTime() -
        probe.getTime()
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(target - offset))
    .filter((candidate) => {
      const local = formatPlanDateTime(candidate, timezone);
      return local.date === date && local.time === time;
    })
    .sort((first, second) => first.getTime() - second.getTime());
  return matches[0] ?? new Date(Number.NaN);
}

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

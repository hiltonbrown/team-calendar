export const AU_TIMEZONES = [
  {
    label: "Sydney, Canberra (New South Wales, ACT)",
    value: "Australia/Sydney",
  },
  { label: "Melbourne (Victoria)", value: "Australia/Melbourne" },
  { label: "Brisbane (Queensland)", value: "Australia/Brisbane" },
  { label: "Adelaide (South Australia)", value: "Australia/Adelaide" },
  { label: "Perth (Western Australia)", value: "Australia/Perth" },
  { label: "Hobart (Tasmania)", value: "Australia/Hobart" },
  { label: "Darwin (Northern Territory)", value: "Australia/Darwin" },
  { label: "Broken Hill (New South Wales)", value: "Australia/Broken_Hill" },
  { label: "Lord Howe Island", value: "Australia/Lord_Howe" },
] as const;

export type AuTimezone = (typeof AU_TIMEZONES)[number]["value"];

export const DEFAULT_AU_TIMEZONE: AuTimezone = "Australia/Sydney";

export const AU_TIMEZONE_VALUES = AU_TIMEZONES.map((zone) => zone.value) as [
  AuTimezone,
  ...AuTimezone[],
];

export function isAuTimezone(
  value: string | null | undefined
): value is AuTimezone {
  return AU_TIMEZONES.some((zone) => zone.value === value);
}

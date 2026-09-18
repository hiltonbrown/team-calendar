const XERO_DOT_NET_DATE_REGEX = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;

export function normaliseXeroDateOnly(
  value: string | null | undefined
): string | null {
  const parsed = parseXeroDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

export function normaliseXeroDateTime(
  value: string | null | undefined
): string | null {
  const parsed = parseXeroDate(value);
  return parsed?.toISOString() ?? null;
}

function parseXeroDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const dotNetDate = XERO_DOT_NET_DATE_REGEX.exec(trimmed);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for ISO and other non-.NET dates; Biome 2.5.14 incorrectly narrows this match as non-null here.
  const parsed = dotNetDate
    ? new Date(Number(dotNetDate[1]))
    : new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

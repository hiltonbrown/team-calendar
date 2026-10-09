import type { CountryCode } from "../../regions";
import auData from "./data/au.json";
import nzData from "./data/nz.json";
import ukData from "./data/uk.json";
import { type ReferenceHolidayEntry, referenceFileSchema } from "./schema";

export type ReferenceHolidayKind = ReferenceHolidayEntry["kind"];

export interface ReferenceHoliday {
  area: string | null;
  country: CountryCode;
  date: string;
  id: string;
  kind: ReferenceHolidayKind;
  name: string;
  region: string | null;
  startsAt: string | null;
}

/**
 * Bumped whenever a data file changes. Feed projection uses it as the published
 * timestamp for official holidays.
 */
export const PUBLIC_HOLIDAY_DATA_VERSION = "2026-10-09";

const FILES: ReadonlyArray<{
  country: CountryCode;
  data: unknown;
  fileName: string;
}> = [
  { country: "AU", data: auData, fileName: "au.json" },
  { country: "NZ", data: nzData, fileName: "nz.json" },
  { country: "UK", data: ukData, fileName: "uk.json" },
];

function loadReferenceHolidays(): ReadonlyMap<CountryCode, ReferenceHoliday[]> {
  const byCountry = new Map<CountryCode, ReferenceHoliday[]>();
  const seenIds = new Map<string, string>();

  for (const file of FILES) {
    const parsed = referenceFileSchema(file.country).safeParse(file.data);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const entryIndex = issue?.path[1];
      const entry =
        typeof entryIndex === "number"
          ? (file.data as { entries?: Array<{ id?: unknown }> }).entries?.[
              entryIndex
            ]
          : undefined;
      throw new Error(
        `Invalid public holiday data in ${file.fileName}${
          entry?.id ? ` (entry ${String(entry.id)})` : ""
        }: ${issue?.message ?? "unknown error"} at ${issue?.path.join(".") ?? "root"}`
      );
    }

    const holidays = parsed.data.entries.map((entry) => {
      const previous = seenIds.get(entry.id);
      if (previous) {
        throw new Error(
          `Invalid public holiday data in ${file.fileName} (entry ${entry.id}): id already used in ${previous}`
        );
      }
      seenIds.set(entry.id, file.fileName);
      return {
        area: entry.area ?? null,
        country: file.country,
        date: entry.date,
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        region: entry.region,
        startsAt: entry.startsAt ?? null,
      } satisfies ReferenceHoliday;
    });

    byCountry.set(
      file.country,
      holidays.sort((left, right) => left.date.localeCompare(right.date))
    );
  }

  return byCountry;
}

// Parsed once per process; invalid data stops the app with a named entry.
const REFERENCE_HOLIDAYS = loadReferenceHolidays();

export interface ListReferenceHolidaysInput {
  country: CountryCode;
  /** Inclusive YYYY-MM-DD. */
  from: string;
  /** null returns national entries only. */
  region: string | null;
  /** Inclusive YYYY-MM-DD. */
  to: string;
}

export type ListReferenceHolidays = (
  input: ListReferenceHolidaysInput
) => ReferenceHoliday[];

export const listReferenceHolidays: ListReferenceHolidays = (input) =>
  (REFERENCE_HOLIDAYS.get(input.country) ?? []).filter(
    (holiday) =>
      holiday.date >= input.from &&
      holiday.date <= input.to &&
      (holiday.region === null || holiday.region === input.region)
  );

export function findReferenceHoliday(id: string): ReferenceHoliday | null {
  for (const holidays of REFERENCE_HOLIDAYS.values()) {
    const match = holidays.find((holiday) => holiday.id === id);
    if (match) {
      return match;
    }
  }
  return null;
}

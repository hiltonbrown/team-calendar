import { describe, expect, it } from "vitest";
import type {
  ListReferenceHolidays,
  ReferenceHoliday,
} from "./reference/reference-holidays";
import {
  localHolidayOptions,
  type ResolveHolidayData,
  resolvePublicHolidaysFromData,
} from "./resolve";

function reference(
  overrides: Partial<ReferenceHoliday> & Pick<ReferenceHoliday, "id" | "date">
): ReferenceHoliday {
  return {
    area: null,
    country: "AU",
    kind: "public",
    name: "Holiday",
    region: null,
    startsAt: null,
    ...overrides,
  };
}

const REFERENCE: ReferenceHoliday[] = [
  reference({
    date: "2026-12-25",
    id: "au-national-2026-12-25-christmas-day",
    name: "Christmas Day",
  }),
  reference({
    date: "2026-10-05",
    id: "au-qld-2026-10-05-kings-birthday",
    name: "King's Birthday",
    region: "QLD",
  }),
  reference({
    date: "2026-10-05",
    id: "au-nsw-2026-10-05-labour-day",
    name: "Labour Day",
    region: "NSW",
  }),
  reference({
    date: "2026-12-24",
    id: "au-qld-2026-12-24-christmas-eve",
    kind: "part_day",
    name: "Christmas Eve",
    region: "QLD",
    startsAt: "18:00",
  }),
  reference({
    area: "Brisbane",
    date: "2026-08-12",
    id: "au-qld-2026-08-12-royal-queensland-show",
    kind: "local",
    name: "Royal Queensland Show",
    region: "QLD",
  }),
];

const listReference: ListReferenceHolidays = (input) =>
  REFERENCE.filter(
    (holiday) =>
      holiday.country === input.country &&
      holiday.date >= input.from &&
      holiday.date <= input.to &&
      (holiday.region === null || holiday.region === input.region)
  );

function data(overrides: Partial<ResolveHolidayData> = {}): ResolveHolidayData {
  return {
    customHolidays: [],
    from: "2026-01-01",
    locations: [{ countryCode: "AU", id: "loc-qld", regionCode: "QLD" }],
    organisation: { countryCode: "AU", regionCode: "QLD" },
    preferences: [],
    to: "2026-12-31",
    ...overrides,
  };
}

function keysFor(
  result: ReturnType<typeof resolvePublicHolidaysFromData>,
  locationId: string | null
) {
  return result
    .filter((holiday) => holiday.locationId === locationId)
    .map((holiday) => holiday.key);
}

describe("resolvePublicHolidaysFromData", () => {
  it("gives a location national plus its own region's holidays", () => {
    const result = resolvePublicHolidaysFromData(data(), listReference);
    expect(keysFor(result, "loc-qld")).toEqual([
      "au-qld-2026-10-05-kings-birthday",
      "au-qld-2026-12-24-christmas-eve",
      "au-national-2026-12-25-christmas-day",
    ]);
  });

  it("falls back to the organisation's region, then to national only", () => {
    const withOrgRegion = resolvePublicHolidaysFromData(
      data({
        locations: [{ countryCode: null, id: "loc-x", regionCode: null }],
      }),
      listReference
    );
    expect(keysFor(withOrgRegion, "loc-x")).toContain(
      "au-qld-2026-10-05-kings-birthday"
    );

    const nationalOnly = resolvePublicHolidaysFromData(
      data({
        locations: [{ countryCode: null, id: "loc-x", regionCode: null }],
        organisation: { countryCode: "AU", regionCode: null },
      }),
      listReference
    );
    expect(keysFor(nationalOnly, "loc-x")).toEqual([
      "au-national-2026-12-25-christmas-day",
    ]);
  });

  it("does not borrow the organisation region for a location in another country", () => {
    const result = resolvePublicHolidaysFromData(
      data({
        locations: [{ countryCode: "NZ", id: "loc-nz", regionCode: null }],
      }),
      listReference
    );
    expect(keysFor(result, "loc-nz")).toEqual([]);
  });

  it("resolves an organisation-level entry for people without a location", () => {
    const result = resolvePublicHolidaysFromData(
      data({ organisation: { countryCode: "AU", regionCode: "NSW" } }),
      listReference
    );
    expect(keysFor(result, null)).toEqual([
      "au-nsw-2026-10-05-labour-day",
      "au-national-2026-12-25-christmas-day",
    ]);
  });

  it("marks public days non-working and part days working with a start time", () => {
    const result = resolvePublicHolidaysFromData(data(), listReference);
    const christmasEve = result.find(
      (holiday) => holiday.key === "au-qld-2026-12-24-christmas-eve"
    );
    const kingsBirthday = result.find(
      (holiday) => holiday.key === "au-qld-2026-10-05-kings-birthday"
    );
    expect(christmasEve).toMatchObject({
      classification: "working",
      kind: "part_day",
      origin: "official",
      startsAt: "18:00",
    });
    expect(kingsBirthday).toMatchObject({ classification: "non_working" });
  });

  it("shows a local day only after the location opts in", () => {
    const show = "au-qld-2026-08-12-royal-queensland-show";
    expect(
      keysFor(resolvePublicHolidaysFromData(data(), listReference), "loc-qld")
    ).not.toContain(show);

    const optedIn = resolvePublicHolidaysFromData(
      data({
        preferences: [
          { holidayKey: show, locationId: "loc-qld", setting: "non_working" },
        ],
      }),
      listReference
    );
    expect(optedIn.find((holiday) => holiday.key === show)).toMatchObject({
      area: "Brisbane",
      classification: "non_working",
      kind: "local",
      locationId: "loc-qld",
    });
    expect(keysFor(optedIn, null)).not.toContain(show);
  });

  it("lets a location preference win over an organisation-wide hide", () => {
    const key = "au-national-2026-12-25-christmas-day";
    const result = resolvePublicHolidaysFromData(
      data({
        locations: [
          { countryCode: "AU", id: "loc-a", regionCode: "QLD" },
          { countryCode: "AU", id: "loc-b", regionCode: "QLD" },
        ],
        preferences: [
          { holidayKey: key, locationId: null, setting: "hidden" },
          { holidayKey: key, locationId: "loc-b", setting: "working" },
        ],
      }),
      listReference
    );
    expect(keysFor(result, "loc-a")).not.toContain(key);
    expect(keysFor(result, null)).not.toContain(key);
    expect(
      result.find(
        (holiday) => holiday.key === key && holiday.locationId === "loc-b"
      )
    ).toMatchObject({
      classification: "working",
    });
  });

  it("returns hidden holidays flagged when asked", () => {
    const key = "au-national-2026-12-25-christmas-day";
    const result = resolvePublicHolidaysFromData(
      data({
        preferences: [{ holidayKey: key, locationId: null, setting: "hidden" }],
      }),
      listReference,
      { includeHidden: true }
    );
    expect(
      result.find(
        (holiday) => holiday.key === key && holiday.locationId === "loc-qld"
      )
    ).toMatchObject({
      hidden: true,
    });
  });

  it("applies custom holidays with their scope and preferences", () => {
    const result = resolvePublicHolidaysFromData(
      data({
        customHolidays: [
          {
            countryCode: "CUSTOM",
            date: "2026-03-02",
            defaultClassification: "non_working",
            id: "c-all",
            name: "Founders Day",
            regionCode: null,
          },
          {
            countryCode: "AU",
            date: "2026-03-03",
            defaultClassification: "non_working",
            id: "c-nsw",
            name: "Office day",
            regionCode: "NSW",
          },
          {
            countryCode: "AU",
            date: "2026-03-04",
            defaultClassification: "working",
            id: "c-qld",
            name: "Stocktake",
            regionCode: "QLD",
          },
        ],
        preferences: [
          {
            holidayKey: "custom:c-qld",
            locationId: "loc-qld",
            setting: "non_working",
          },
        ],
      }),
      listReference
    );
    const custom = result.filter(
      (holiday) =>
        holiday.origin === "custom" && holiday.locationId === "loc-qld"
    );
    expect(
      custom.map((holiday) => [holiday.key, holiday.classification])
    ).toEqual([
      ["custom:c-all", "non_working"],
      ["custom:c-qld", "non_working"],
    ]);
    expect(custom[0]).toMatchObject({ kind: "custom", name: "Founders Day" });
  });

  it("filters custom holidays to the requested range", () => {
    const result = resolvePublicHolidaysFromData(
      data({
        customHolidays: [
          {
            countryCode: "CUSTOM",
            date: "2025-12-31",
            defaultClassification: "non_working",
            id: "c-old",
            name: "Old",
            regionCode: null,
          },
        ],
      }),
      listReference
    );
    expect(result.some((holiday) => holiday.key === "custom:c-old")).toBe(
      false
    );
  });
});

describe("localHolidayOptions", () => {
  it("lists a location's local days as off until it opts in", () => {
    expect(localHolidayOptions(data(), listReference)).toEqual([
      {
        holidays: [
          {
            area: "Brisbane",
            date: "2026-08-12",
            enabled: false,
            key: "au-qld-2026-08-12-royal-queensland-show",
            name: "Royal Queensland Show",
          },
        ],
        locationId: "loc-qld",
      },
    ]);
  });

  it("marks a local day on for the location that opted in", () => {
    const [option] = localHolidayOptions(
      data({
        preferences: [
          {
            holidayKey: "au-qld-2026-08-12-royal-queensland-show",
            locationId: "loc-qld",
            setting: "non_working",
          },
        ],
      }),
      listReference
    );
    expect(option?.holidays[0]?.enabled).toBe(true);
  });

  it("gives a location in another region none of its local days", () => {
    expect(
      localHolidayOptions(
        data({
          locations: [{ countryCode: "AU", id: "loc-nsw", regionCode: "NSW" }],
        }),
        listReference
      )
    ).toEqual([{ holidays: [], locationId: "loc-nsw" }]);
  });
});

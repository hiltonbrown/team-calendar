import { describe, expect, it } from "vitest";
import {
  parseReferenceHolidayFiles,
  type ReferenceHolidayFile,
} from "./reference-holidays";

const INVALID_AU = /Invalid public holiday data in au\.json/;

// Synthetic entries only: the bundled data files are deliberately untested.
function entry(overrides: Record<string, unknown> = {}) {
  return {
    date: "2030-10-07",
    id: "au-qld-2030-10-07-kings-birthday",
    kind: "public",
    name: "King's Birthday",
    region: "QLD",
    ...overrides,
  };
}

function auFile(
  entries: unknown[],
  extra: Record<string, unknown> = {}
): ReferenceHolidayFile {
  return {
    country: "AU",
    data: { country: "AU", entries, ...extra },
    fileName: "au.json",
  };
}

describe("parseReferenceHolidayFiles", () => {
  it("indexes valid entries by country in date order", () => {
    const result = parseReferenceHolidayFiles([
      auFile([
        entry(),
        entry({
          date: "2030-01-01",
          id: "au-national-2030-01-01-new-years-day",
          name: "New Year's Day",
          region: null,
        }),
        entry({
          date: "2030-12-24",
          id: "au-qld-2030-12-24-christmas-eve",
          kind: "part_day",
          name: "Christmas Eve",
          startsAt: "18:00",
        }),
        entry({
          area: "Brisbane",
          date: "2030-08-14",
          id: "au-qld-2030-08-14-royal-queensland-show",
          kind: "local",
          name: "Royal Queensland Show",
        }),
      ]),
    ]);

    expect(result.get("AU")?.map((holiday) => holiday.id)).toEqual([
      "au-national-2030-01-01-new-years-day",
      "au-qld-2030-08-14-royal-queensland-show",
      "au-qld-2030-10-07-kings-birthday",
      "au-qld-2030-12-24-christmas-eve",
    ]);
    expect(result.get("AU")?.[1]).toMatchObject({
      area: "Brisbane",
      startsAt: null,
    });
    expect(result.get("AU")?.[3]).toMatchObject({
      area: null,
      startsAt: "18:00",
    });
  });

  it.each([
    ["a date that does not exist", { date: "2030-02-30" }],
    ["an id from another country", { id: "nz-qld-2030-10-07-kings-birthday" }],
    ["an id for another region", { id: "au-nsw-2030-10-07-kings-birthday" }],
    ["an id for another date", { id: "au-qld-2030-10-08-kings-birthday" }],
    [
      "a region outside the registry",
      { id: "au-xyz-2030-10-07-kings-birthday", region: "XYZ" },
    ],
    ["a part day without a start time", { kind: "part_day" }],
    ["a start time on a full public holiday", { startsAt: "18:00" }],
    ["a local day without an area", { kind: "local" }],
    ["an area on a public holiday", { area: "Brisbane" }],
    ["an unknown field", { sourceUrl: "https://example.com" }],
  ])("rejects %s and names the entry", (_label, overrides) => {
    expect(() =>
      parseReferenceHolidayFiles([auFile([entry(overrides)])])
    ).toThrow(INVALID_AU);
  });

  it("rejects a file whose country does not match", () => {
    expect(() =>
      parseReferenceHolidayFiles([
        {
          country: "AU",
          data: { country: "NZ", entries: [] },
          fileName: "au.json",
        },
      ])
    ).toThrow(INVALID_AU);
  });

  it("rejects an id used twice", () => {
    expect(() =>
      parseReferenceHolidayFiles([auFile([entry(), entry()])])
    ).toThrow(
      "Invalid public holiday data in au.json (entry au-qld-2030-10-07-kings-birthday): id already used in au.json"
    );
  });
});

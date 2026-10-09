import type {
  TimelineWeek,
  TimelineWeekEntry,
  TimelineWeekRow,
} from "@repo/availability";
import { addDaysToDateKey, zonedStartOfDay } from "@repo/core";
import { describe, expect, it } from "vitest";
import { toTeamTimelineProps } from "./timeline-adapter";

const TIMEZONE = "Australia/Brisbane";
const TODAY = new Date("2026-10-09T02:00:00.000Z");

function localDay(dateKey: string): Date {
  return zonedStartOfDay(dateKey, TIMEZONE);
}

function buildEntry(
  overrides: Partial<TimelineWeekEntry> = {}
): TimelineWeekEntry {
  return {
    allDay: false,
    dayCount: 3,
    endIndex: 2,
    endsAt: localDay("2026-10-08"),
    id: "entry_1",
    isPrivate: false,
    note: "Family trip",
    provenance: "xero",
    recordType: "annual_leave",
    startIndex: 0,
    startsAt: localDay("2026-10-05"),
    ...overrides,
  };
}

function buildRow(overrides: Partial<TimelineWeekRow> = {}): TimelineWeekRow {
  return {
    entries: [buildEntry()],
    firstName: "Ava",
    isSelf: true,
    jobTitle: "Support lead",
    lastName: "Nguyen",
    locationName: "Brisbane",
    personId: "person_1",
    teamName: "Operations",
    ...overrides,
  };
}

function buildWeek(
  weekStart = "2026-10-05",
  overrides: Partial<TimelineWeek> = {}
): TimelineWeek {
  return {
    days: Array.from({ length: 7 }, (_, index) => {
      const dateKey = addDaysToDateKey(weekStart, index);
      return {
        date: localDay(dateKey),
        dateKey,
        holidayName: null,
        isToday: dateKey === "2026-10-09",
      };
    }),
    isCurrentWeek: weekStart === "2026-10-05",
    nextWeekStart: addDaysToDateKey(weekStart, 7),
    previousWeekStart: addDaysToDateKey(weekStart, -7),
    rows: [buildRow()],
    timezone: TIMEZONE,
    totalPeopleInScope: 1,
    weekStart,
    ...overrides,
  };
}

const employee = {
  orgQueryValue: null,
  role: "employee",
  today: TODAY,
} as const;

describe("toTeamTimelineProps", () => {
  it("labels the current week and its days", () => {
    const props = toTeamTimelineProps(buildWeek(), employee);
    expect(props.weekLabel).toBe("Mon 5 to Sun 11 Oct");
    expect(props.weekSub).toBe("This week · 2026");
    expect(props.isCurrentWeek).toBe(true);
    expect(props.days[0]).toEqual({
      dateLabel: "5 Oct",
      dow: "Mon",
      holidayName: null,
      isToday: false,
      key: "2026-10-05",
    });
    expect(props.days[4]?.isToday).toBe(true);
  });

  it("labels a week that spans two months", () => {
    const props = toTeamTimelineProps(buildWeek("2026-09-28"), employee);
    expect(props.weekLabel).toBe("Mon 28 Sep to Sun 4 Oct");
    expect(props.weekSub).toBe("Last week · 2026");
  });

  it.each([
    ["2026-10-12", "Next week · 2026"],
    ["2026-10-19", "Week of 19 Oct · 2026"],
  ])("labels the week starting %s as %s", (weekStart, weekSub) => {
    expect(toTeamTimelineProps(buildWeek(weekStart), employee).weekSub).toBe(
      weekSub
    );
  });

  it("names full-day holidays on their day", () => {
    const week = buildWeek();
    const [monday, ...rest] = week.days;
    if (!monday) {
      throw new Error("Expected a Monday");
    }
    const props = toTeamTimelineProps(
      { ...week, days: [{ ...monday, holidayName: "Labour Day" }, ...rest] },
      employee
    );
    expect(props.days[0]?.holidayName).toBe("Labour Day");
  });

  it("links week navigation to the dashboard with the organisation", () => {
    const props = toTeamTimelineProps(buildWeek(), {
      ...employee,
      orgQueryValue: "org_2",
    });
    expect(props.navigation).toEqual({
      nextHref: "/?week=2026-10-12&org=org_2",
      previousHref: "/?week=2026-09-28&org=org_2",
      todayHref: "/?org=org_2",
    });
  });

  it("describes an entry for the block and detail strip", () => {
    const [row] = toTeamTimelineProps(buildWeek(), employee).rows;
    expect(row).toMatchObject({
      initials: "AN",
      isSelf: true,
      name: "Ava Nguyen",
      secondary: "Support lead",
    });
    expect(row?.blocks).toEqual([
      {
        ariaLabel:
          "Ava Nguyen: Annual leave, Mon 5 to Wed 7 Oct, Synced from Xero",
        dateLabel: "Mon 5 to Wed 7 Oct",
        dayCount: 3,
        durationLabel: "3 days",
        endIndex: 2,
        icon: "xero",
        id: "entry_1",
        label: "Annual leave",
        note: "Family trip",
        provenanceLabel: "Synced from Xero",
        startIndex: 0,
        tone: "xero",
      },
    ]);
  });

  it("uses the full record dates for entries that cross the week edge", () => {
    const week = buildWeek("2026-10-05", {
      rows: [
        buildRow({
          entries: [
            buildEntry({
              dayCount: 2,
              endIndex: 1,
              endsAt: new Date("2026-10-06T13:59:59.999Z"),
              startsAt: localDay("2026-09-30"),
            }),
          ],
        }),
      ],
    });
    const block = toTeamTimelineProps(week, employee).rows[0]?.blocks[0];
    expect(block?.dateLabel).toBe("Wed 30 Sep to Tue 6 Oct");
    expect(block?.durationLabel).toBe("7 days");
  });

  it("reads all-day records as UTC calendar dates", () => {
    const week = buildWeek("2026-10-05", {
      rows: [
        buildRow({
          entries: [
            buildEntry({
              allDay: true,
              dayCount: 1,
              endIndex: 1,
              endsAt: new Date("2026-10-06T23:59:59.999Z"),
              startIndex: 1,
              startsAt: new Date("2026-10-06T00:00:00.000Z"),
            }),
          ],
        }),
      ],
    });
    const block = toTeamTimelineProps(week, employee).rows[0]?.blocks[0];
    expect(block?.dateLabel).toBe("Tue 6 Oct");
    expect(block?.durationLabel).toBe("1 day");
  });

  it.each([
    ["leave_request", "Leave request", "leave_request", "leave_request"],
    ["manual", "Manual entry", "manual", "home"],
  ] as const)(
    "labels %s provenance",
    (provenance, provenanceLabel, tone, icon) => {
      const week = buildWeek("2026-10-05", {
        rows: [
          buildRow({
            entries: [
              buildEntry({
                dayCount: 1,
                endsAt: localDay("2026-10-06"),
                provenance,
                recordType: provenance === "manual" ? "wfh" : "annual_leave",
              }),
            ],
          }),
        ],
      });
      const block = toTeamTimelineProps(week, employee).rows[0]?.blocks[0];
      expect(block).toMatchObject({
        durationLabel: "1 day",
        icon,
        provenanceLabel,
        tone,
      });
    }
  );

  it("shows private entries as unavailable without detail", () => {
    const week = buildWeek("2026-10-05", {
      rows: [
        buildRow({
          entries: [buildEntry({ isPrivate: true, recordType: "private" })],
          isSelf: false,
        }),
      ],
    });
    const block = toTeamTimelineProps(week, {
      ...employee,
      role: "manager",
    }).rows[0]?.blocks[0];
    expect(block).toMatchObject({
      icon: "private",
      label: "Unavailable",
      note: null,
      provenanceLabel: "Private",
      tone: "private",
    });
  });

  it("uses team and location for admin rows", () => {
    const props = toTeamTimelineProps(buildWeek(), {
      ...employee,
      role: "admin",
    });
    expect(props.cornerLabel).toBe("All teams");
    expect(props.rows[0]?.secondary).toBe("Operations, Brisbane");
  });

  it.each([
    ["employee", 1, 1, "Me", null],
    ["manager", 12, 12, "My team", null],
    ["manager", 12, 31, "My team", "Showing 12 of 31 people."],
    ["admin", 10, 48, "All teams", "Showing 10 of 48 people away this week."],
    ["admin", 0, 0, "All teams", "No one is away this week."],
  ] as const)(
    "gives the %s timeline its corner label and footer",
    (role, shown, total, cornerLabel, footer) => {
      const week = buildWeek("2026-10-05", {
        rows: Array.from({ length: shown }, (_, index) =>
          buildRow({ personId: `person_${index}` })
        ),
        totalPeopleInScope: total,
      });
      const props = toTeamTimelineProps(week, { ...employee, role });
      expect(props.cornerLabel).toBe(cornerLabel);
      expect(props.footer).toBe(footer);
    }
  );
});

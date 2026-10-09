import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  clerkOrg: "org_1",
  indirect: "00000000-0000-4000-8000-000000000013",
  manager: "00000000-0000-4000-8000-000000000010",
  org: "00000000-0000-4000-8000-000000000001",
  otherOrg: "00000000-0000-4000-8000-000000000002",
  peer: "00000000-0000-4000-8000-000000000012",
  person: "00000000-0000-4000-8000-000000000011",
  team: "00000000-0000-4000-8000-000000000100",
};
const mocks = vi.hoisted(() => ({
  availabilityFindFirst: vi.fn(),
  availabilityFindMany: vi.fn(),
  getSettings: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  organisationFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  resolvePublicHolidays: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
  scopedTo: vi.fn((input: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: {
      findFirst: mocks.availabilityFindFirst,
      findMany: mocks.availabilityFindMany,
    },
    organisation: { findFirst: mocks.organisationFindFirst },
    person: { findMany: mocks.personFindMany },
  },
  scopedQuery: mocks.scopedQuery,
  scopedTo: mocks.scopedTo,
}));
vi.mock("../holidays/resolve-public-holidays", () => ({
  resolvePublicHolidays: mocks.resolvePublicHolidays,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
const { getCalendarRange, getEventDetail } = await import("./calendar-service");
const people = [
  person(ids.manager, "Morgan", "Manager", null),
  person(ids.person, "Ari", "Report", ids.manager),
  person(ids.indirect, "Indy", "Indirect", ids.person),
  person(ids.peer, "Pia", "Peer", null),
];
const baseInput = {
  actingPersonId: ids.manager,
  actingUserId: "user_1",
  anchorDate: new Date("2026-04-15T12:00:00.000Z"),
  clerkOrgId: ids.clerkOrg,
  filters: {},
  organisationId: ids.org,
  role: "manager",
  scope: { type: "my_team" },
  view: "week",
} as const;
describe("calendar-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organisationFindFirst.mockResolvedValue({
      timezone: "Australia/Brisbane",
    });
    mocks.personFindMany.mockResolvedValue(people);
    mocks.availabilityFindMany.mockImplementation(({ where }) =>
      Promise.resolve(
        records().filter((availabilityRecord) => {
          const personIds = where.person_id?.in ?? [];
          const sourceTypes = where.source_type?.in ?? [];
          const recordTypes = where.record_type?.in;
          return (
            personIds.includes(availabilityRecord.person_id) &&
            sourceTypes.includes(availabilityRecord.source_type) &&
            (!recordTypes ||
              recordTypes.includes(availabilityRecord.record_type)) &&
            availabilityRecord.archived_at === null
          );
        })
      )
    );
    mocks.availabilityFindFirst.mockResolvedValue(record("detail", ids.person));
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        managerVisibilityScope: "direct_reports_only",
        showPendingOnCalendar: true,
      },
    });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [resolvedHoliday({ date: "2026-04-15", name: "Queensland Day" })],
    });
  });
  it("returns direct reports plus self for my_team and uses Monday week range", async () => {
    const result = await getCalendarRange(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.people.map((item) => item.id)).toEqual([
      ids.manager,
      ids.person,
    ]);
    expect(result.value.days).toHaveLength(7);
    expect(result.value.days[0].date.toISOString().slice(0, 10)).toBe(
      "2026-04-13"
    );
  });
  it("shows a one-day all-day record on its own date only in Brisbane", async () => {
    const result = await getCalendarRange(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const daysWithRecord = result.value.days
      .filter((day) =>
        day.events.some((event) => event.id === "approved-record")
      )
      .map((day) => day.date.toISOString().slice(0, 10));
    expect(daysWithRecord).toEqual(["2026-04-15"]);
  });
  it("returns each person's job title and team id", async () => {
    const result = await getCalendarRange(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.people.map(({ id, jobTitle, teamId, teamName }) => ({
        id,
        jobTitle,
        teamId,
        teamName,
      }))
    ).toEqual([
      {
        id: ids.manager,
        jobTitle: "Operations lead",
        teamId: ids.team,
        teamName: "Operations",
      },
      {
        id: ids.person,
        jobTitle: null,
        teamId: ids.team,
        teamName: "Operations",
      },
    ]);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ job_title: true }),
      })
    );
  });
  it.each(["all_teams", "my_team", "team"] as const)(
    "excludes indirect reports from %s under direct-only visibility",
    async (type) => {
      mocks.availabilityFindMany.mockResolvedValue([
        record("direct", ids.person),
        record("indirect", ids.indirect),
      ]);
      const result = await getCalendarRange({
        ...baseInput,
        scope: type === "team" ? { type, value: ids.team } : { type },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.people.map((item) => item.id)).toEqual([
        ids.manager,
        ids.person,
      ]);
      expect(
        result.value.days.flatMap((day) => day.events).map((event) => event.id)
      ).not.toContain("indirect");
      expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            person_id: { in: [ids.manager, ids.person] },
          }),
        })
      );
    }
  );
  it("denies explicit indirect-person range under direct-only visibility", async () => {
    const result = await getCalendarRange({
      ...baseInput,
      scope: { type: "person", value: ids.indirect },
    });
    expect(result).toMatchObject({
      error: { code: "invalid_scope" },
      ok: false,
    });
  });
  it("preserves indirect reports and their manager details when all-team visibility is enabled", async () => {
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        managerVisibilityScope: "all_team_leave",
        showPendingOnCalendar: true,
      },
    });
    mocks.availabilityFindMany.mockResolvedValue([
      record("indirect", ids.indirect),
    ]);
    const result = await getCalendarRange({
      ...baseInput,
      scope: { type: "person", value: ids.indirect },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.days.flatMap((day) => day.events)[0]).toMatchObject({
      notesInternal: "Private note",
    });
  });
  it("fails closed to self when settings cannot be read", async () => {
    mocks.getSettings.mockResolvedValue({
      error: { code: "unknown_error" },
      ok: false,
    });
    const result = await getCalendarRange({
      ...baseInput,
      scope: { type: "all_teams" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.people.map((candidate) => candidate.id)).toEqual([
      ids.manager,
    ]);
    expect(await getEventDetail(detailInput())).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });
  it.each([null, ids.otherOrg])(
    "denies missing or inactive manager identity %s",
    async (actingPersonId) => {
      expect(
        await getCalendarRange({ ...baseInput, actingPersonId })
      ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    }
  );
  it("scopes range and detail people and records to both tenant boundaries", async () => {
    await getCalendarRange(baseInput);
    await getEventDetail(detailInput());
    const scope = {
      archived_at: null,
      clerk_org_id: ids.clerkOrg,
      organisation_id: ids.org,
    };
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ...scope, is_active: true }),
      })
    );
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(scope) })
    );
    expect(mocks.availabilityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(scope) })
    );
  });
  it("denies detail for an archived or inactive person", async () => {
    mocks.personFindMany.mockResolvedValue(
      people.filter((candidate) => candidate.id !== ids.person)
    );
    expect(await getEventDetail(detailInput())).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
  });
  it.each([
    ["2026-03-15", "2026-02-23", "2026-04-05", 42],
    ["2026-09-15", "2026-08-31", "2026-10-04", 35],
    ["2021-02-15", "2021-02-01", "2021-02-28", 28],
    ["2024-02-15", "2024-01-29", "2024-03-03", 35],
  ])(
    "ends the %s month grid after the final day's week",
    async (anchor, first, last, count) => {
      const result = await getCalendarRange({
        ...baseInput,
        anchorDate: new Date(`${anchor}T12:00:00Z`),
        view: "month",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.days).toHaveLength(count);
      expect(result.value.days[0].date.toISOString().slice(0, 10)).toBe(first);
      expect(result.value.days.at(-1)?.date.toISOString().slice(0, 10)).toBe(
        last
      );
    }
  );
  it.each([
    ["2026-04-05", "2026-04-04T13:00:00Z", "2026-04-05T14:00:00Z", 25],
    ["2026-10-04", "2026-10-03T14:00:00Z", "2026-10-04T13:00:00Z", 23],
  ])(
    "projects overlap on a DST boundary day %s",
    async (anchor, start, end, hours) => {
      mocks.organisationFindFirst.mockResolvedValue({
        timezone: "Australia/Sydney",
      });
      mocks.availabilityFindMany.mockResolvedValue([
        {
          ...record("inside", ids.person),
          all_day: false,
          ends_at: new Date(end),
          starts_at: new Date(start),
        },
        {
          ...record("ends-at-start", ids.person),
          all_day: false,
          ends_at: new Date(start),
          starts_at: new Date(new Date(start).getTime() - 3_600_000),
        },
        {
          ...record("starts-at-end", ids.person),
          all_day: false,
          ends_at: new Date(new Date(end).getTime() + 3_600_000),
          starts_at: new Date(end),
        },
      ]);
      const result = await getCalendarRange({
        ...baseInput,
        anchorDate: new Date(`${anchor}T00:00:00Z`),
        view: "day",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.days[0].events.map((event) => event.id)).toEqual([
        "inside",
      ]);
      expect(result.value.range.start.toISOString()).toBe(
        new Date(start).toISOString()
      );
      expect(result.value.range.end.toISOString()).toBe(
        new Date(end).toISOString()
      );
      expect(
        (result.value.range.end.getTime() -
          result.value.range.start.getTime()) /
          3_600_000
      ).toBe(hours);
    }
  );
  it("maps source category filters to source type predicates", async () => {
    await getCalendarRange({
      ...baseInput,
      filters: { recordTypeCategory: "xero_leave" },
    });
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source_type: { in: ["xero_leave", "team_calendar_leave"] },
        }),
      })
    );
  });
  it("includes own drafts only when includeDrafts is true", async () => {
    await getCalendarRange({
      ...baseInput,
      actingPersonId: ids.person,
      filters: { includeDrafts: true },
      scope: { type: "my_self" },
    });
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { approval_status: "draft", person_id: ids.person },
          ]),
        }),
      })
    );
  });
  it("applies privacy transformation before returning events", async () => {
    const result = await getCalendarRange({
      ...baseInput,
      actingPersonId: ids.peer,
      role: "viewer",
      scope: { type: "all_teams" },
    });
    expect(result.ok).toBe(false);
    const detail = await getEventDetail({
      actingPersonId: ids.peer,
      actingUserId: "user_2",
      clerkOrgId: ids.clerkOrg,
      organisationId: ids.org,
      recordId: "00000000-0000-4000-8000-000000000099",
      role: "owner",
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) {
      return;
    }
    expect(detail.value.displayName).toBe("Ari Report");
    expect(detail.value.notesInternal).toBe("Private note");
  });
  it("redacts private peer records in range output", async () => {
    const result = await getCalendarRange({
      ...baseInput,
      role: "owner",
      scope: { type: "all_teams" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const privateEvent = result.value.days
      .flatMap((day) => day.events)
      .find((event) => event.id === "private-record");
    expect(privateEvent?.renderTreatment).toBe("failed");
    expect(privateEvent?.xeroWriteError).toBe(
      "Xero could not save this leave."
    );
  });
  it("withholds xero write errors from peers in all-team range output", async () => {
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        managerVisibilityScope: "all_team_leave",
        showPendingOnCalendar: true,
      },
    });
    const result = await getCalendarRange({
      ...baseInput,
      scope: { type: "team", value: ids.team },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const peerEvent = result.value.days
      .flatMap((day) => day.events)
      .find((event) => event.id === "private-record");
    expect(peerEvent?.xeroWriteError).toBeNull();
    expect(peerEvent?.notesInternal).toBeNull();
  });
  it("detects cross-org record lookups", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        clerk_org_id: "org_2",
        organisation_id: ids.otherOrg,
      });
    const result = await getEventDetail({
      actingPersonId: ids.manager,
      actingUserId: "user_1",
      clerkOrgId: ids.clerkOrg,
      organisationId: ids.org,
      recordId: "00000000-0000-4000-8000-000000000099",
      role: "manager",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("invalid_scope");
  });
  it("denies indirect-report detail under direct-only manager visibility", async () => {
    mocks.availabilityFindFirst.mockResolvedValue(
      record("indirect-detail", ids.indirect)
    );
    const result = await getEventDetail(detailInput());
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("not_authorised");
  });
  it("allows indirect-report detail under all-team manager visibility", async () => {
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        managerVisibilityScope: "all_team_leave",
        showPendingOnCalendar: true,
      },
    });
    mocks.availabilityFindFirst.mockResolvedValue(
      record("indirect-detail", ids.indirect)
    );
    const result = await getEventDetail(detailInput());
    expect(result.ok).toBe(true);
  });
  it("allows direct-report detail under direct-only manager visibility", async () => {
    const result = await getEventDetail(detailInput());
    expect(result.ok).toBe(true);
  });
  it("builds holiday cells from resolved holidays for locations in view", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [
        resolvedHoliday({ date: "2026-04-14", name: "Location Holiday" }),
        resolvedHoliday({
          classification: "working",
          date: "2026-04-15",
          name: "Working Day",
        }),
        resolvedHoliday({
          date: "2026-04-16",
          locationId: "00000000-0000-4000-8000-000000000999",
          name: "Other Location",
        }),
        resolvedHoliday({
          date: "2026-04-17",
          locationId: null,
          name: "Organisation Level",
        }),
        resolvedHoliday({
          classification: "working",
          date: "2026-04-18",
          kind: "part_day",
          name: "Part Day",
          startsAt: "18:00",
        }),
      ],
    });
    const result = await getCalendarRange(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const cells = result.value.days.flatMap((day) => day.publicHolidays);
    expect(cells.map((cell) => cell.name)).toEqual([
      "Location Holiday",
      "Part Day",
    ]);
    expect(cells[0]).toMatchObject({
      appliesToAllLocationsInView: true,
      locationNames: ["Brisbane"],
      startsAt: null,
    });
    expect(cells[1]).toMatchObject({ startsAt: "18:00" });
    expect(mocks.resolvePublicHolidays).toHaveBeenCalledWith({
      clerkOrgId: ids.clerkOrg,
      from: "2026-04-13",
      organisationId: ids.org,
      to: "2026-04-19",
    });
  });
});
function detailInput() {
  return {
    actingPersonId: ids.manager,
    actingUserId: "user_1",
    clerkOrgId: ids.clerkOrg,
    organisationId: ids.org,
    recordId: "00000000-0000-4000-8000-000000000099",
    role: "manager",
  } as const;
}
function person(
  id: string,
  firstName: string,
  lastName: string,
  managerPersonId: string | null
) {
  return {
    archived_at: null,
    avatar_url: null,
    email: `${firstName.toLowerCase()}@example.com`,
    employment_type: "employee",
    first_name: firstName,
    id,
    job_title: firstName === "Morgan" ? "Operations lead" : null,
    last_name: lastName,
    location: {
      country_code: "AU",
      id: "00000000-0000-4000-8000-000000000200",
      name: "Brisbane",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    },
    location_id: "00000000-0000-4000-8000-000000000200",
    manager_person_id: managerPersonId,
    person_type: "employee",
    team: { id: ids.team, name: "Operations" },
    team_id: ids.team,
  };
}
function records() {
  return [
    record("approved-record", ids.person),
    {
      ...record("private-record", ids.peer),
      approval_status: "xero_sync_failed",
      privacy_mode: "private",
      xero_write_error: "Xero could not save this leave.",
    },
    {
      ...record("archived-record", ids.person),
      archived_at: new Date("2026-04-01T00:00:00.000Z"),
    },
  ];
}
function record(id: string, personId: string) {
  const recordPerson = people.find((item) => item.id === personId) ?? people[1];
  return {
    all_day: true,
    approval_note: null,
    approval_status: "approved",
    archived_at: null,
    contactability: "contactable",
    // Form-entered all-day leave on 15 April: the end is inclusive.
    ends_at: new Date("2026-04-15T23:59:59.999Z"),
    id,
    notes_internal: "Private note",
    person: recordPerson,
    person_id: personId,
    privacy_mode: "named",
    record_type: "annual_leave",
    source_type: "team_calendar_leave",
    starts_at: new Date("2026-04-15T00:00:00.000Z"),
    submitted_at: null,
    title: null,
    xero_write_error: null,
  };
}
function resolvedHoliday(
  overrides: Partial<{
    classification: "non_working" | "working";
    date: string;
    kind: "custom" | "local" | "part_day" | "public";
    locationId: string | null;
    name: string;
    startsAt: string | null;
  }>
) {
  return {
    area: null,
    classification: "non_working",
    date: "2026-04-15",
    hidden: false,
    key: "au-qld-2026-04-15-holiday",
    kind: "public",
    locationId: "00000000-0000-4000-8000-000000000200",
    name: "Holiday",
    origin: "official",
    startsAt: null,
    ...overrides,
  };
}

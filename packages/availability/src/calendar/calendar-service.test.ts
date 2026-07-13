import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  clerkOrg: "org_1",
  manager: "00000000-0000-4000-8000-000000000010",
  indirect: "00000000-0000-4000-8000-000000000013",
  org: "00000000-0000-4000-8000-000000000001",
  otherOrg: "00000000-0000-4000-8000-000000000002",
  person: "00000000-0000-4000-8000-000000000011",
  peer: "00000000-0000-4000-8000-000000000012",
  team: "00000000-0000-4000-8000-000000000100",
};

const mocks = vi.hoisted(() => ({
  availabilityFindFirst: vi.fn(),
  availabilityFindMany: vi.fn(),
  hasActiveXeroConnection: vi.fn(),
  listForOrganisation: vi.fn(),
  organisationFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  getSettings: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
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
}));
vi.mock("../holidays/holiday-service", () => ({
  listForOrganisation: mocks.listForOrganisation,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));
vi.mock("../xero-connection-state", () => ({
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
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
        records().filter((record) => {
          const personIds = where.person_id?.in ?? [];
          const sourceTypes = where.source_type?.in ?? [];
          const recordTypes = where.record_type?.in;
          return (
            personIds.includes(record.person_id) &&
            sourceTypes.includes(record.source_type) &&
            (!recordTypes || recordTypes.includes(record.record_type)) &&
            record.archived_at === null
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
    mocks.hasActiveXeroConnection.mockResolvedValue(false);
    mocks.listForOrganisation.mockResolvedValue({
      ok: true,
      value: [
        {
          archived_at: null,
          assignments: [],
          country_code: "AU",
          default_classification: "non_working",
          holiday_date: new Date("2026-04-15T00:00:00.000Z"),
          name: "Queensland Day",
          region_code: "QLD",
        },
      ],
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
    expect(result.error.code).toBe("cross_org_leak");
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
    ends_at: new Date("2026-04-16T00:00:00.000Z"),
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

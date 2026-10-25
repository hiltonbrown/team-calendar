import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  account: "org_1",
  indirect: "00000000-0000-4000-8000-000000000013",
  manager: "00000000-0000-4000-8000-000000000010",
  org: "00000000-0000-4000-8000-000000000001",
  otherOrg: "00000000-0000-4000-8000-000000000002",
  peer: "00000000-0000-4000-8000-000000000012",
  person: "00000000-0000-4000-8000-000000000011",
  team: "00000000-0000-4000-8000-000000000100",
};
const mocks = vi.hoisted(() => ({
  accountCompanies: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityFindMany: vi.fn(),
  getSettings: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  organisationFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  poolTransaction: vi.fn(),
  resolvePublicHolidays: vi.fn(),
  scopedQuery: vi.fn((accountId: string, organisationId: string) => ({
    account_id: accountId,
    organisation_id: organisationId,
  })),
  scopedTo: vi.fn((input: { accountId: string; organisationId: string }) => ({
    account_id: input.accountId,
    organisation_id: input.organisationId,
  })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>, options: unknown) =>
      mocks.poolTransaction(run, options),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("@repo/database/tenant-db")),
  getAccountSettings: async (account: string, db: unknown) => {
    const settings = await mocks.getSettings(
      { accountId: account, organisationId: ids.org },
      db
    );
    if (!settings.ok) {
      throw new Error("Account settings unavailable");
    }
    return {
      manager_visibility_scope:
        settings.value.managerVisibilityScope ?? "direct_reports_only",
    };
  },
  resolveAccountCompanies: mocks.accountCompanies,
  scopedQuery: mocks.scopedQuery,
  scopedTo: mocks.scopedTo,
}));

vi.mock("../holidays/resolve-public-holidays", () => ({
  resolvePublicHolidays: mocks.resolvePublicHolidays,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));
vi.mock("../settings/account-approval-settings-service", () => ({
  getAccountApprovalSettings: async (
    input: { accountId: string },
    db: unknown
  ) => mocks.getSettings({ ...input, organisationId: ids.org }, db),
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
  accountId: ids.account,
  actingPersonId: ids.manager,
  actingUserId: "user_1",
  anchorDate: new Date("2026-04-15T12:00:00.000Z"),
  filters: {},
  organisationId: ids.org,
  role: "manager",
  scope: { type: "my_team" },
  view: "week",
} as const;
describe("calendar-service", () => {
  it("loads the calendar through one account transaction", async () => {
    const result = await withTenantDb(
      ids.account,
      (db) => getCalendarRange(baseInput, db),
      TENANT_READ_TRANSACTION_OPTIONS
    );
    expect(result.ok).toBe(true);
    expect(mocks.poolTransaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { maxWait: 10_000, timeout: 30_000 }
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolTransaction.mockImplementation(
      async (run: (db: unknown) => Promise<unknown>) =>
        run({
          $queryRaw: vi.fn(async () => []),
          availabilityRecord: {
            findFirst: mocks.availabilityFindFirst,
            findMany: mocks.availabilityFindMany,
          },
          organisation: { findFirst: mocks.organisationFindFirst },
          person: { findMany: mocks.personFindMany },
        })
    );
    mocks.accountCompanies.mockResolvedValue([
      {
        country_code: "AU",
        id: ids.org,
        name: "Operations",
        timezone: "Australia/Brisbane",
      },
    ]);
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

  it("returns an empty calendar without provisioning a company on a read", async () => {
    mocks.accountCompanies.mockResolvedValue([]);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        organisationId: undefined,
        role: "owner",
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            organisationId: undefined,
            role: "owner",
          },
          db
        )
    );
    expect(result).toMatchObject({
      ok: true,
      value: { companies: [], people: [], totalPeopleInScope: 0 },
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });
  it("shows both companies to a viewer without credentials and masks peer leave", async () => {
    const otherPerson = {
      ...person(ids.otherOrg, "Second", "Person", null),
      organisation_id: ids.otherOrg,
      user_id: null,
    };
    mocks.accountCompanies.mockResolvedValue([
      company(ids.org, "First"),
      company(ids.otherOrg, "Second"),
    ]);
    mocks.personFindMany.mockResolvedValue([people[1], otherPerson]);
    mocks.availabilityFindMany.mockImplementation(({ where }) =>
      Promise.resolve(
        [
          { ...record("company-one", ids.person), privacy_mode: "private" },
          {
            ...record("company-two", ids.otherOrg),
            person: otherPerson,
            privacy_mode: "private",
          },
        ].filter((item) => where.person_id.in.includes(item.person_id))
      )
    );
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        actingPersonId: null,
        organisationId: undefined,
        role: "viewer",
        scope: { type: "all_teams" },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            actingPersonId: null,
            organisationId: undefined,
            role: "viewer",
            scope: { type: "all_teams" },
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.people.map((item) => item.companyName)).toEqual([
      "First",
      "Second",
    ]);
    const events = result.value.days.flatMap((day) => day.events);
    expect(new Set(events.map((event) => event.id))).toEqual(
      new Set(["company-one", "company-two"])
    );
    expect(
      events.every(
        (event) =>
          event.recordType === "private" && event.notesInternal === null
      )
    ).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: ids.account,
          organisation_id: { in: [ids.org, ids.otherOrg] },
        }),
      })
    );
  });
  it("rejects unknown company filters before reading people or records", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        companyIds: [ids.otherOrg],
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            companyIds: [ids.otherOrg],
          },
          db
        )
    );
    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
  });
  it("resolves one account manager across companies and applies each company's settings", async () => {
    const secondReport = {
      ...person(
        "00000000-0000-4000-8000-000000000014",
        "Other",
        "Report",
        ids.manager
      ),
      organisation_id: ids.otherOrg,
      user_id: null,
    };
    mocks.accountCompanies.mockResolvedValue([
      company(ids.org, "First"),
      company(ids.otherOrg, "Second"),
    ]);
    mocks.personFindMany.mockResolvedValue([...people, secondReport]);
    mocks.getSettings.mockImplementation(({ organisationId }) =>
      Promise.resolve({
        ok: true,
        value: {
          managerVisibilityScope: "direct_reports_only",
          showPendingOnCalendar: organisationId === ids.org,
        },
      })
    );
    mocks.availabilityFindMany.mockImplementation(({ where }) =>
      Promise.resolve(
        [
          {
            ...record("second-report", secondReport.id),
            person: secondReport,
            privacy_mode: "private",
          },
        ].filter((item) => where.person_id.in.includes(item.person_id))
      )
    );
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        organisationId: undefined,
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            organisationId: undefined,
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.people.map((item) => item.id)).toEqual([
      ids.manager,
      ids.person,
      secondReport.id,
    ]);
    expect(result.value.days.flatMap((day) => day.events)[0]).toMatchObject({
      companyId: ids.otherOrg,
      displayName: "Other Report",
      notesInternal: "Private note",
      recordType: "annual_leave",
    });
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organisation_id: { in: [ids.otherOrg] },
        }),
      })
    );
    const firstWhere = mocks.availabilityFindMany.mock.calls.find(([query]) =>
      query.where.organisation_id.in.includes(ids.org)
    )?.[0].where;
    const secondWhere = mocks.availabilityFindMany.mock.calls.find(([query]) =>
      query.where.organisation_id.in.includes(ids.otherOrg)
    )?.[0].where;
    expect(firstWhere?.OR[0].approval_status.in).toContain("submitted");
    expect(secondWhere?.OR[0].approval_status.in).not.toContain("submitted");
  });
  it("returns direct reports plus self for my_team and uses Monday week range", async () => {
    const result = await withTenantDb(
      ids.account,
      (db) => getCalendarRange(baseInput, db),
      TENANT_READ_TRANSACTION_OPTIONS
    );
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
    const result = await withTenantDb(
      ids.account,
      (db) => getCalendarRange(baseInput, db),
      TENANT_READ_TRANSACTION_OPTIONS
    );
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
    const result = await withTenantDb(
      ids.account,
      (db) => getCalendarRange(baseInput, db),
      TENANT_READ_TRANSACTION_OPTIONS
    );
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
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...baseInput,
          scope: type === "team" ? { type, value: ids.team } : { type },
        }),
        (db) =>
          getCalendarRange(
            {
              ...baseInput,
              scope: type === "team" ? { type, value: ids.team } : { type },
            },
            db
          )
      );
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scope: { type: "person", value: ids.indirect },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            scope: { type: "person", value: ids.indirect },
          },
          db
        )
    );
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scope: { type: "person", value: ids.indirect },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            scope: { type: "person", value: ids.indirect },
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.days.flatMap((day) => day.events)[0]).toMatchObject({
      notesInternal: "Private note",
    });
  });
  it("aborts the account read when settings SQL cannot be read", async () => {
    mocks.getSettings.mockResolvedValue({
      error: { code: "unknown_error" },
      ok: false,
    });
    await expect(
      withTestTenantResult(
        tenantTestAccount({ ...baseInput, scope: { type: "all_teams" } }),
        (db) =>
          getCalendarRange({ ...baseInput, scope: { type: "all_teams" } }, db)
      )
    ).rejects.toThrow("Account settings unavailable");
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
  });
  it.each([null, ids.otherOrg])(
    "denies missing or inactive manager identity %s",
    async (actingPersonId) => {
      expect(
        await withTestTenantResult(
          tenantTestAccount({ ...baseInput, actingPersonId }),
          (db) => getCalendarRange({ ...baseInput, actingPersonId }, db)
        )
      ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    }
  );
  it("scopes range and detail people and records to both tenant boundaries", async () => {
    await withTestTenantResult(tenantTestAccount(baseInput), (db) =>
      getCalendarRange(baseInput, db)
    );
    await withTestTenantResult(tenantTestAccount(detailInput()), (db) =>
      getEventDetail(detailInput(), db)
    );
    const scope = {
      account_id: ids.account,
      archived_at: null,
      organisation_id: ids.org,
    };
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ...scope, is_active: true }),
      })
    );
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          organisation_id: { in: [ids.org] },
        }),
      })
    );
    expect(mocks.availabilityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(scope) })
    );
  });
  it("denies detail for an archived or inactive person", async () => {
    mocks.personFindMany.mockResolvedValue(
      people.filter((candidate) => candidate.id !== ids.person)
    );
    expect(
      await withTestTenantResult(tenantTestAccount(detailInput()), (db) =>
        getEventDetail(detailInput(), db)
      )
    ).toMatchObject({
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
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...baseInput,
          anchorDate: new Date(`${anchor}T12:00:00Z`),
          view: "month",
        }),
        (db) =>
          getCalendarRange(
            {
              ...baseInput,
              anchorDate: new Date(`${anchor}T12:00:00Z`),
              view: "month",
            },
            db
          )
      );
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
  it("uses the selected company's time zone and lists only selected companies", async () => {
    mocks.accountCompanies.mockResolvedValue([
      company(ids.otherOrg, "Brisbane office"),
      { ...company(ids.org, "Perth office"), timezone: "Australia/Perth" },
    ]);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        anchorDate: new Date("2026-10-07T00:00:00Z"),
        view: "day",
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            anchorDate: new Date("2026-10-07T00:00:00Z"),
            view: "day",
          },
          db
        )
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        companies: [
          { id: ids.org, name: "Perth office", timezone: "Australia/Perth" },
        ],
        range: {
          start: new Date("2026-10-06T16:00:00Z"),
          timezone: "Australia/Perth",
        },
      },
    });
    expect(result.ok && result.value.companies).toHaveLength(1);
  });
  it.each([
    ["2026-04-05", "2026-04-04T13:00:00Z", "2026-04-05T14:00:00Z", 25],
    ["2026-10-04", "2026-10-03T14:00:00Z", "2026-10-04T13:00:00Z", 23],
  ])(
    "projects overlap on a DST boundary day %s",
    async (anchor, start, end, hours) => {
      mocks.accountCompanies.mockResolvedValue([
        { ...company(ids.org, "Operations"), timezone: "Australia/Sydney" },
      ]);
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
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...baseInput,
          anchorDate: new Date(`${anchor}T00:00:00Z`),
          view: "day",
        }),
        (db) =>
          getCalendarRange(
            {
              ...baseInput,
              anchorDate: new Date(`${anchor}T00:00:00Z`),
              view: "day",
            },
            db
          )
      );
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
    await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        filters: { recordTypeCategory: "xero_leave" },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            filters: { recordTypeCategory: "xero_leave" },
          },
          db
        )
    );
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source_type: { in: ["xero_leave", "team_calendar_leave"] },
        }),
      })
    );
  });
  it("includes own drafts only when includeDrafts is true", async () => {
    await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        actingPersonId: ids.person,
        filters: { includeDrafts: true },
        scope: { type: "my_self" },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            actingPersonId: ids.person,
            filters: { includeDrafts: true },
            scope: { type: "my_self" },
          },
          db
        )
    );
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        actingPersonId: ids.peer,
        role: "viewer",
        scope: { type: "all_teams" },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            actingPersonId: ids.peer,
            role: "viewer",
            scope: { type: "all_teams" },
          },
          db
        )
    );
    expect(result.ok).toBe(false);
    const detail = await withTestTenantResult(
      tenantTestAccount({
        accountId: ids.account,
        actingPersonId: ids.peer,
        actingUserId: "user_2",
        organisationId: ids.org,
        recordId: "00000000-0000-4000-8000-000000000099",
        role: "owner",
      }),
      (db) =>
        getEventDetail(
          {
            accountId: ids.account,
            actingPersonId: ids.peer,
            actingUserId: "user_2",
            organisationId: ids.org,
            recordId: "00000000-0000-4000-8000-000000000099",
            role: "owner",
          },
          db
        )
    );
    expect(detail.ok).toBe(true);
    if (!detail.ok) {
      return;
    }
    expect(detail.value.displayName).toBe("Ari Report");
    expect(detail.value.notesInternal).toBe("Private note");
  });
  it("redacts private peer records in range output", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        role: "owner",
        scope: { type: "all_teams" },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            role: "owner",
            scope: { type: "all_teams" },
          },
          db
        )
    );
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scope: { type: "team", value: ids.team },
      }),
      (db) =>
        getCalendarRange(
          {
            ...baseInput,
            scope: { type: "team", value: ids.team },
          },
          db
        )
    );
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
        account_id: "org_2",
        organisation_id: ids.otherOrg,
      });
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: ids.account,
        actingPersonId: ids.manager,
        actingUserId: "user_1",
        organisationId: ids.org,
        recordId: "00000000-0000-4000-8000-000000000099",
        role: "manager",
      }),
      (db) =>
        getEventDetail(
          {
            accountId: ids.account,
            actingPersonId: ids.manager,
            actingUserId: "user_1",
            organisationId: ids.org,
            recordId: "00000000-0000-4000-8000-000000000099",
            role: "manager",
          },
          db
        )
    );
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
    const result = await withTestTenantResult(
      tenantTestAccount(detailInput()),
      (db) => getEventDetail(detailInput(), db)
    );
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
    const result = await withTestTenantResult(
      tenantTestAccount(detailInput()),
      (db) => getEventDetail(detailInput(), db)
    );
    expect(result.ok).toBe(true);
  });
  it("allows direct-report detail under direct-only manager visibility", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount(detailInput()),
      (db) => getEventDetail(detailInput(), db)
    );
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
    const result = await withTenantDb(
      ids.account,
      (db) => getCalendarRange(baseInput, db),
      TENANT_READ_TRANSACTION_OPTIONS
    );
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
    expect(mocks.resolvePublicHolidays).toHaveBeenCalledWith(
      {
        accountId: ids.account,
        from: "2026-04-13",
        organisationId: ids.org,
        to: "2026-04-19",
      },
      undefined,
      expect.objectContaining({ person: expect.any(Object) })
    );
  });
});
function detailInput() {
  return {
    accountId: ids.account,
    actingPersonId: ids.manager,
    actingUserId: "user_1",
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
    organisation_id: ids.org,
    person_type: "employee",
    team: { id: ids.team, name: "Operations" },
    team_id: ids.team,
    user_id: id === ids.manager ? "user_1" : `user_${id}`,
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

function company(id: string, name: string) {
  return { country_code: "AU", id, name, timezone: "Australia/Brisbane" };
}

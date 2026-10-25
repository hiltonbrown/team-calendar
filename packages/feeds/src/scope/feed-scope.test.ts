import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  companies: vi.fn(async () => [
    { id: "10000000-0000-4000-8000-000000000001", name: "A" },
    { id: "company-a", name: "A" },
    { id: "company-b", name: "B" },
  ]),
  personFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
const tenantTestState = vi.hoisted(() => ({
  client: null as Record<string, unknown> | null,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) => {
      if (!tenantTestState.client) {
        throw new Error("Missing feed fixture delegates");
      }
      return await executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...tenantTestState.client,
      });
    },
  },
}));
vi.mock("@repo/database", async () => {
  const client = {
    person: {
      findMany: mocks.personFindMany,
    },
  };
  tenantTestState.client = client;
  return {
    getAccountSettings: async () => ({
      manager_visibility_scope: "direct_reports_only",
    }),
    resolveAccountCompanies: mocks.companies,
    ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
      "@repo/database/tenant-db"
    )),
  };
});

const { canViewFeed, normaliseRole, resolvePeopleForFeed, resolveScopeRows } =
  await import("./feed-scope");

const baseInput = {
  accountId: "org_1",
  actingPersonId: "00000000-0000-4000-8000-000000000001",
  createdByUserId: null,
  organisationId: "10000000-0000-4000-8000-000000000001",
};

function buildPerson(input: {
  userId?: string | null;
  displayName: string;
  firstName: string;
  id: string;
  lastName: string;
  isActive?: boolean;
  managerPersonId?: string | null;
  teamId?: string | null;
}) {
  return {
    account_id: baseInput.accountId,
    display_name: input.displayName,
    first_name: input.firstName,
    id: input.id,
    is_active: input.isActive ?? true,
    last_name: input.lastName,
    location: null,
    location_id: null,
    manager_person_id: input.managerPersonId ?? null,
    organisation_id: baseInput.organisationId,
    team: input.teamId ? { id: input.teamId, name: "Operations" } : null,
    team_id: input.teamId ?? null,
    user_id: input.userId ?? null,
  };
}

const activePeople = [
  buildPerson({
    displayName: "Avery Viewer",
    firstName: "Avery",
    id: baseInput.actingPersonId,
    lastName: "Viewer",
    teamId: "20000000-0000-4000-8000-000000000001",
  }),
  buildPerson({
    displayName: "Blair Other",
    firstName: "Blair",
    id: "00000000-0000-4000-8000-000000000002",
    lastName: "Other",
    teamId: "20000000-0000-4000-8000-000000000002",
  }),
  buildPerson({
    displayName: "Casey Report",
    firstName: "Casey",
    id: "00000000-0000-4000-8000-000000000003",
    lastName: "Report",
    managerPersonId: baseInput.actingPersonId,
    teamId: "20000000-0000-4000-8000-000000000001",
  }),
];

const broadPeopleWhere = {
  account_id: baseInput.accountId,
  archived_at: null,
  is_active: true,
  organisation_id: baseInput.organisationId,
};

describe("resolvePeopleForFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches person-scoped feeds by person id and returns matching people", async () => {
    const personId = "00000000-0000-4000-8000-000000000002";
    const scopes = [{ scopeType: "person", scopeValue: personId }] as const;
    const expected = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: { people: activePeople, teams: [] },
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            preloaded: { people: activePeople, teams: [] },
            scopes,
          },
          db
        )
    );
    mocks.personFindMany.mockResolvedValueOnce(
      activePeople.filter((person) => person.id === personId)
    );

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            scopes,
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...broadPeopleWhere,
          OR: [{ id: { in: [personId] } }],
        },
      })
    );
    expect(result).toEqual(expected);
  });

  it("fetches team-scoped feeds by team id and returns matching people", async () => {
    const teamId = "20000000-0000-4000-8000-000000000001";
    const scopes = [{ scopeType: "team", scopeValue: teamId }] as const;
    const expected = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: { people: activePeople, teams: [] },
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            preloaded: { people: activePeople, teams: [] },
            scopes,
          },
          db
        )
    );
    mocks.personFindMany.mockResolvedValueOnce(
      activePeople.filter((person) => person.team_id === teamId)
    );

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            scopes,
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...broadPeopleWhere,
          OR: [{ team_id: { in: [teamId] } }],
        },
      })
    );
    expect(result).toEqual(expected);
  });

  it("fetches mixed person and team scopes with one combined OR", async () => {
    const personId = "00000000-0000-4000-8000-000000000002";
    const teamId = "20000000-0000-4000-8000-000000000001";
    const scopes = [
      { scopeType: "person", scopeValue: personId },
      { scopeType: "team", scopeValue: teamId },
    ] as const;
    const expected = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: { people: activePeople, teams: [] },
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            preloaded: { people: activePeople, teams: [] },
            scopes,
          },
          db
        )
    );
    mocks.personFindMany.mockResolvedValueOnce(
      activePeople.filter(
        (person) => person.id === personId || person.team_id === teamId
      )
    );

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            scopes,
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...broadPeopleWhere,
          OR: [{ id: { in: [personId] } }, { team_id: { in: [teamId] } }],
        },
      })
    );
    expect(result).toEqual(expected);
  });

  it("keeps org-scoped feeds on the broad people fetch", async () => {
    const scopes = [{ scopeType: "org", scopeValue: null }] as const;
    const expected = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: { people: activePeople, teams: [] },
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            preloaded: { people: activePeople, teams: [] },
            scopes,
          },
          db
        )
    );
    mocks.personFindMany.mockResolvedValueOnce(activePeople);

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            scopes,
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: broadPeopleWhere,
      })
    );
    expect(result).toEqual(expected);
  });

  it("keeps self-scoped feeds on the broad people fetch", async () => {
    const scopes = [{ scopeType: "self", scopeValue: null }] as const;
    const expected = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: { people: activePeople, teams: [] },
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            preloaded: { people: activePeople, teams: [] },
            scopes,
          },
          db
        )
    );
    mocks.personFindMany.mockResolvedValueOnce(activePeople);

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            scopes,
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: broadPeopleWhere,
      })
    );
    expect(result).toEqual(expected);
  });

  it("keeps manager-team-scoped feeds on the broad people fetch", async () => {
    mocks.personFindMany.mockResolvedValue(activePeople);
    const scopes = [{ scopeType: "manager_team", scopeValue: null }] as const;
    const expected = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: { people: activePeople, teams: [] },
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            preloaded: { people: activePeople, teams: [] },
            scopes,
          },
          db
        )
    );
    mocks.personFindMany.mockResolvedValueOnce(activePeople);

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        scopes,
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            scopes,
          },
          db
        )
    );

    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: broadPeopleWhere,
      })
    );
    expect(result).toEqual(expected);
  });
});

describe("canViewFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["admin", "owner"] as const)(
    "allows %s callers without resolving people",
    async (role) => {
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...baseInput,
          actingPersonId: null,
          role,
          scopes: [
            { scopeType: "person", scopeValue: baseInput.actingPersonId },
          ],
        }),
        (db) =>
          canViewFeed(
            {
              ...baseInput,
              actingPersonId: null,
              role,
              scopes: [
                { scopeType: "person", scopeValue: baseInput.actingPersonId },
              ],
            },
            db
          )
      );

      expect(result).toEqual({ ok: true, value: true });
      expect(mocks.personFindMany).not.toHaveBeenCalled();
    }
  );

  it("allows a viewer when their person is in scope", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      buildPerson({
        displayName: "Avery Viewer",
        firstName: "Avery",
        id: baseInput.actingPersonId,
        lastName: "Viewer",
      }),
    ]);

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        role: "viewer",
        scopes: [{ scopeType: "person", scopeValue: baseInput.actingPersonId }],
      }),
      (db) =>
        canViewFeed(
          {
            ...baseInput,
            role: "viewer",
            scopes: [
              { scopeType: "person", scopeValue: baseInput.actingPersonId },
            ],
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: true });
  });

  it("denies a viewer when their person is outside scope", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      buildPerson({
        displayName: "Blair Other",
        firstName: "Blair",
        id: "00000000-0000-4000-8000-000000000002",
        lastName: "Other",
      }),
      buildPerson({
        displayName: "Avery Viewer",
        firstName: "Avery",
        id: baseInput.actingPersonId,
        lastName: "Viewer",
      }),
    ]);

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        role: "viewer",
        scopes: [
          {
            scopeType: "person",
            scopeValue: "00000000-0000-4000-8000-000000000002",
          },
        ],
      }),
      (db) =>
        canViewFeed(
          {
            ...baseInput,
            role: "viewer",
            scopes: [
              {
                scopeType: "person",
                scopeValue: "00000000-0000-4000-8000-000000000002",
              },
            ],
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: false });
  });

  it("allows a manager when a transitive report is in scope", async () => {
    const teamId = "20000000-0000-4000-8000-000000000001";
    const directReportId = "00000000-0000-4000-8000-000000000003";
    const transitiveReportId = "00000000-0000-4000-8000-000000000004";
    mocks.personFindMany.mockResolvedValueOnce([
      buildPerson({
        displayName: "Morgan Manager",
        firstName: "Morgan",
        id: baseInput.actingPersonId,
        lastName: "Manager",
        teamId,
      }),
      buildPerson({
        displayName: "Casey Lead",
        firstName: "Casey",
        id: directReportId,
        lastName: "Lead",
        managerPersonId: baseInput.actingPersonId,
        teamId,
      }),
      buildPerson({
        displayName: "Riley Report",
        firstName: "Riley",
        id: transitiveReportId,
        lastName: "Report",
        managerPersonId: directReportId,
        teamId,
      }),
    ]);

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        role: "manager",
        scopes: [{ scopeType: "team", scopeValue: teamId }],
      }),
      (db) =>
        canViewFeed(
          {
            ...baseInput,
            role: "manager",
            scopes: [{ scopeType: "team", scopeValue: teamId }],
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: true });
  });

  it("denies non-admin callers without an acting person", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        actingPersonId: null,
        role: "viewer",
        scopes: [{ scopeType: "org", scopeValue: null }],
      }),
      (db) =>
        canViewFeed(
          {
            ...baseInput,
            actingPersonId: null,
            role: "viewer",
            scopes: [{ scopeType: "org", scopeValue: null }],
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: false });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });

  it("ignores inactive preloaded people for viewer visibility", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        preloaded: {
          people: [
            buildPerson({
              displayName: "Avery Viewer",
              firstName: "Avery",
              id: baseInput.actingPersonId,
              isActive: false,
              lastName: "Viewer",
            }),
          ],
          teams: [],
        },
        role: "viewer",
        scopes: [{ scopeType: "person", scopeValue: baseInput.actingPersonId }],
      }),
      (db) =>
        canViewFeed(
          {
            ...baseInput,
            preloaded: {
              people: [
                buildPerson({
                  displayName: "Avery Viewer",
                  firstName: "Avery",
                  id: baseInput.actingPersonId,
                  isActive: false,
                  lastName: "Viewer",
                }),
              ],
              teams: [],
            },
            role: "viewer",
            scopes: [
              { scopeType: "person", scopeValue: baseInput.actingPersonId },
            ],
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: false });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });
});

describe("resolveScopeRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses inactive unarchived preloaded people for labels", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: baseInput.accountId,
        organisationId: baseInput.organisationId,
        preloaded: {
          people: [
            buildPerson({
              displayName: "Avery Viewer",
              firstName: "Avery",
              id: baseInput.actingPersonId,
              isActive: false,
              lastName: "Viewer",
            }),
          ],
          teams: [],
        },
        scopes: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            scope_type: "person",
            scope_value: baseInput.actingPersonId,
          },
        ],
      }),
      (db) =>
        resolveScopeRows(
          {
            accountId: baseInput.accountId,
            organisationId: baseInput.organisationId,
            preloaded: {
              people: [
                buildPerson({
                  displayName: "Avery Viewer",
                  firstName: "Avery",
                  id: baseInput.actingPersonId,
                  isActive: false,
                  lastName: "Viewer",
                }),
              ],
              teams: [],
            },
            scopes: [
              {
                id: "30000000-0000-4000-8000-000000000001",
                scope_type: "person",
                scope_value: baseInput.actingPersonId,
              },
            ],
          },
          db
        )
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          label: "Avery Viewer",
          scopeType: "person",
          scopeValue: baseInput.actingPersonId,
        },
      ],
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });
});

describe("account feed scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.companies.mockResolvedValue([
      { id: "company-a", name: "A" },
      { id: "company-b", name: "B" },
    ]);
  });
  const accountPeople = [
    {
      ...activePeople[0],
      account_id: "org_1",
      id: "manager-a",
      organisation_id: "company-a",
      user_id: "manager",
    },
    {
      ...activePeople[0],
      account_id: "org_1",
      id: "manager-b",
      organisation_id: "company-b",
      user_id: "manager",
    },
    {
      ...activePeople[2],
      account_id: "org_1",
      id: "report-a",
      manager_person_id: "manager-a",
      organisation_id: "company-a",
    },
    {
      ...activePeople[2],
      account_id: "org_1",
      id: "report-b",
      manager_person_id: "manager-b",
      organisation_id: "company-b",
    },
    {
      ...activePeople[0],
      account_id: "org_other",
      id: "foreign-manager",
      organisation_id: "company-other",
      user_id: "manager",
    },
  ];
  it("resolves self in every owned company and excludes another account", async () => {
    mocks.personFindMany.mockResolvedValue(accountPeople);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        createdByUserId: "manager",
        organisationId: null,
        scopes: [{ scopeType: "self" }],
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            createdByUserId: "manager",
            organisationId: null,
            scopes: [{ scopeType: "self" }],
          },
          db
        )
    );
    expect(result.ok && result.value.map((person) => person.id).sort()).toEqual(
      ["manager-a", "manager-b"]
    );
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: "org_1",
          organisation_id: { in: ["company-a", "company-b"] },
        }),
      })
    );
  });
  it("includes a manager's reports in both companies", async () => {
    mocks.personFindMany.mockResolvedValue(accountPeople);
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...baseInput,
        createdByUserId: "manager",
        organisationId: null,
        scopes: [{ scopeType: "manager_team" }],
      }),
      (db) =>
        resolvePeopleForFeed(
          {
            ...baseInput,
            createdByUserId: "manager",
            organisationId: null,
            scopes: [{ scopeType: "manager_team" }],
          },
          db
        )
    );
    expect(result.ok && result.value.map((person) => person.id).sort()).toEqual(
      ["manager-a", "manager-b", "report-a", "report-b"]
    );
  });
});

describe("neutral feed role validation", () => {
  it.each(["owner", "admin", "manager", "viewer"])(
    "keeps the recognised %s role",
    (role) => {
      expect(normaliseRole(role)).toBe(role);
    }
  );

  it.each([null, undefined, "", "unexpected"])(
    "does not grant a viewer role for %s",
    (role) => {
      expect(normaliseRole(role)).toBeNull();
    }
  );
});

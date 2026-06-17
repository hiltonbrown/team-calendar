import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    person: {
      findMany: mocks.personFindMany,
    },
  },
}));

const { canViewFeed, resolveScopeRows } = await import("./feed-scope");

const baseInput = {
  actingPersonId: "00000000-0000-4000-8000-000000000001",
  clerkOrgId: "org_1",
  createdByUserId: null,
  organisationId: "10000000-0000-4000-8000-000000000001",
};

function buildPerson(input: {
  clerkUserId?: string | null;
  displayName: string;
  firstName: string;
  id: string;
  lastName: string;
  isActive?: boolean;
  managerPersonId?: string | null;
  teamId?: string | null;
}) {
  return {
    clerk_user_id: input.clerkUserId ?? null,
    display_name: input.displayName,
    first_name: input.firstName,
    id: input.id,
    is_active: input.isActive ?? true,
    last_name: input.lastName,
    location: null,
    location_id: null,
    manager_person_id: input.managerPersonId ?? null,
    team: input.teamId ? { id: input.teamId, name: "Operations" } : null,
    team_id: input.teamId ?? null,
  };
}

describe("canViewFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "admin",
    "owner",
  ] as const)("allows %s callers without resolving people", async (role) => {
    const result = await canViewFeed({
      ...baseInput,
      actingPersonId: null,
      role,
      scopes: [{ scopeType: "person", scopeValue: baseInput.actingPersonId }],
    });

    expect(result).toEqual({ ok: true, value: true });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });

  it("allows a viewer when their person is in scope", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      buildPerson({
        displayName: "Avery Viewer",
        firstName: "Avery",
        id: baseInput.actingPersonId,
        lastName: "Viewer",
      }),
    ]);

    const result = await canViewFeed({
      ...baseInput,
      role: "viewer",
      scopes: [{ scopeType: "person", scopeValue: baseInput.actingPersonId }],
    });

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

    const result = await canViewFeed({
      ...baseInput,
      role: "viewer",
      scopes: [
        {
          scopeType: "person",
          scopeValue: "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

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

    const result = await canViewFeed({
      ...baseInput,
      role: "manager",
      scopes: [{ scopeType: "team", scopeValue: teamId }],
    });

    expect(result).toEqual({ ok: true, value: true });
  });

  it("denies non-admin callers without an acting person", async () => {
    const result = await canViewFeed({
      ...baseInput,
      actingPersonId: null,
      role: "viewer",
      scopes: [{ scopeType: "org", scopeValue: null }],
    });

    expect(result).toEqual({ ok: true, value: false });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });

  it("ignores inactive preloaded people for viewer visibility", async () => {
    const result = await canViewFeed({
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
    });

    expect(result).toEqual({ ok: true, value: false });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
  });
});

describe("resolveScopeRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses inactive unarchived preloaded people for labels", async () => {
    const result = await resolveScopeRows({
      clerkOrgId: baseInput.clerkOrgId,
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
    });

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

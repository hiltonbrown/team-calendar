import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feedCount: vi.fn(),
  feedFindMany: vi.fn(),
  personFindMany: vi.fn(),
  teamFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    feed: {
      count: mocks.feedCount,
      findMany: mocks.feedFindMany,
    },
    person: {
      findMany: mocks.personFindMany,
    },
    team: {
      findMany: mocks.teamFindMany,
    },
  },
}));

const { getFeedSummaryForDashboard, listFeeds } = await import(
  "./feed-service"
);

const baseInput = {
  actingRole: "owner" as const,
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};
const actingPersonId = "00000000-0000-4000-8000-000000000002";
const teamId = "00000000-0000-4000-8000-000000000003";
const scopedPersonId = "00000000-0000-4000-8000-000000000004";

describe("feed-service dashboard summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedFindMany.mockResolvedValue([
      {
        id: "feed_1",
        last_rendered_at: new Date("2026-04-18T09:00:00.000Z"),
      },
      {
        id: "feed_2",
        last_rendered_at: new Date("2026-04-17T09:00:00.000Z"),
      },
    ]);
    mocks.feedCount.mockResolvedValue(3);
  });

  it("returns exact active and paused counts with latest render time", async () => {
    const result = await getFeedSummaryForDashboard(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: {
        activeCount: 2,
        pausedCount: 3,
      },
    });
    expect(result.ok && result.value.lastRenderedAt).toEqual(
      new Date("2026-04-18T09:00:00.000Z")
    );
  });

  it("rejects non-admin callers", async () => {
    const result = await getFeedSummaryForDashboard({
      ...baseInput,
      actingRole: "viewer",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "not_authorised" },
    });
  });
});

describe("feed-service list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindMany.mockResolvedValue([
      buildPerson({
        firstName: "Avery",
        id: actingPersonId,
        lastName: "Viewer",
        teamId,
      }),
      buildPerson({
        firstName: "Blair",
        id: scopedPersonId,
        isActive: false,
        lastName: "Scoped",
        teamId,
      }),
    ]);
    mocks.teamFindMany.mockResolvedValue([{ id: teamId, name: "Operations" }]);
  });

  it("loads people and teams once for the feed page", async () => {
    mocks.feedFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) =>
        buildFeed({
          id: `10000000-0000-4000-8000-00000000000${index}`,
          scopes:
            index % 2 === 0
              ? [
                  {
                    id: `20000000-0000-4000-8000-00000000000${index}`,
                    scope_type: "team",
                    scope_value: teamId,
                  },
                ]
              : [
                  {
                    id: `20000000-0000-4000-8000-00000000000${index}`,
                    scope_type: "person",
                    scope_value: scopedPersonId,
                  },
                ],
        })
      )
    );

    const result = await listFeeds({
      ...baseInput,
      actingPersonId,
      filters: { status: ["active", "paused"] },
      pagination: { pageSize: 5 },
    });

    expect(result).toMatchObject({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({ id: "10000000-0000-4000-8000-000000000000" }),
        expect.objectContaining({
          id: "10000000-0000-4000-8000-000000000001",
          scopeSummary: "Blair Scoped",
        }),
      ]),
    });
    expect(result.ok && result.value).toHaveLength(5);
    expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.teamFindMany).toHaveBeenCalledTimes(1);
  });
});

function buildFeed(input: {
  id: string;
  scopes: Array<{
    id: string;
    scope_type: "manager_team" | "org" | "person" | "self" | "team";
    scope_value: string | null;
  }>;
}) {
  return {
    created_at: new Date("2026-04-18T09:00:00.000Z"),
    created_by_user_id: "user_1",
    description: null,
    id: input.id,
    includes_public_holidays: false,
    last_rendered_at: null,
    name: `Feed ${input.id}`,
    privacy_mode: "named",
    scopes: input.scopes,
    status: "active",
    tokens: [],
  };
}

function buildPerson(input: {
  firstName: string;
  id: string;
  isActive?: boolean;
  lastName: string;
  teamId: string;
}) {
  return {
    clerk_user_id: null,
    display_name: `${input.firstName} ${input.lastName}`,
    first_name: input.firstName,
    id: input.id,
    is_active: input.isActive ?? true,
    last_name: input.lastName,
    location: null,
    location_id: null,
    manager_person_id: null,
    team: { id: input.teamId, name: "Operations" },
    team_id: input.teamId,
  };
}

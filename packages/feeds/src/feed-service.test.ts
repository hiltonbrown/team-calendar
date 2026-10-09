import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_API_URL ||= "https://api.test.local";

const mocks = vi.hoisted(() => ({
  feedCount: vi.fn(),
  feedFindFirst: vi.fn(),
  feedFindMany: vi.fn(),
  logError: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  scopedTo: vi.fn((input: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  })),
  teamFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError, info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/database", () => ({
  database: {
    feed: {
      count: mocks.feedCount,
      findFirst: mocks.feedFindFirst,
      findMany: mocks.feedFindMany,
    },
    person: {
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
    },
    team: {
      findMany: mocks.teamFindMany,
    },
  },
  scopedTo: mocks.scopedTo,
}));

const { createSignedFeedToken, getFeedDetail, listFeeds } = await import(
  "../index"
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

describe("feed-service getFeedDetail cross-tenant behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns feed_not_found without reading another organisation for diagnostics", async () => {
    mocks.feedFindFirst.mockResolvedValue(null);

    const result = await getFeedDetail({
      ...baseInput,
      actingPersonId,
      feedId: "00000000-0000-4000-8000-000000000099",
    });

    expect(result).toMatchObject({
      error: { code: "feed_not_found" },
      ok: false,
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("returns identical result for cross-tenant feed and non-existent feed", async () => {
    mocks.feedFindFirst.mockResolvedValue(null);
    const crossTenantResult = await getFeedDetail({
      ...baseInput,
      actingPersonId,
      feedId: "00000000-0000-4000-8000-000000000099",
    });

    mocks.feedFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const nonExistentResult = await getFeedDetail({
      ...baseInput,
      actingPersonId,
      feedId: "00000000-0000-4000-8000-000000000099",
    });

    expect(crossTenantResult).toEqual(nonExistentResult);
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

  it("returns the full active subscribe URL to an authorised viewer", async () => {
    const tokenId = "30000000-0000-4000-8000-000000000001";
    const tokenHash = "ab".repeat(32);
    mocks.feedFindMany.mockResolvedValue([
      buildFeed({
        id: "10000000-0000-4000-8000-000000000001",
        scopes: [
          {
            id: "20000000-0000-4000-8000-000000000001",
            scope_type: "team",
            scope_value: teamId,
          },
        ],
        tokens: [
          {
            created_at: new Date("2026-08-01T00:00:00.000Z"),
            id: tokenId,
            last_used_at: null,
            revoked_at: null,
            rotated_from_token_id: null,
            status: "active",
            token_hash: tokenHash,
            token_hint: "hint",
          },
        ],
      }),
    ]);

    const result = await listFeeds({
      ...baseInput,
      actingPersonId,
      actingRole: "viewer",
      filters: { status: ["active"] },
      pagination: { pageSize: 5 },
    });

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          subscribeUrl: `https://api.test.local/ical/${createSignedFeedToken({ tokenHash, tokenId })}.ics`,
        },
      ],
    });
  });
});

function buildFeed(input: {
  id: string;
  scopes: Array<{
    id: string;
    scope_type: "manager_team" | "org" | "person" | "self" | "team";
    scope_value: string | null;
  }>;
  tokens?: Array<{
    created_at: Date;
    id: string;
    last_used_at: Date | null;
    revoked_at: Date | null;
    rotated_from_token_id: string | null;
    status: "active" | "expired" | "revoked";
    token_hash: string;
    token_hint: string;
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
    tokens: input.tokens ?? [],
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

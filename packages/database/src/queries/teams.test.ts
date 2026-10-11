import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordFindMany: vi.fn(),
  teamFindFirst: vi.fn(),
  teamFindMany: vi.fn(),
  teamUpdateMany: vi.fn(),
}));

vi.mock("../tenant-client", () => ({
  tenantDatabase: () => ({
    availabilityRecord: { findMany: mocks.recordFindMany },
    team: {
      findFirst: mocks.teamFindFirst,
      findMany: mocks.teamFindMany,
      updateMany: mocks.teamUpdateMany,
    },
  }),
}));

const {
  countAwayPeopleByTeamAndDay,
  listTeamsWithCoverageMinimum,
  setTeamCoverageMinimum,
} = await import("./teams");

const scope = {
  clerkOrgId: "org_test_teams",
  organisationId: "55555555-5555-4555-8555-555555555555",
};
const teamA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const teamB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const brisbane = "Australia/Brisbane";

const buildRecord = (overrides: {
  allDay?: boolean;
  endsAt: string;
  personId: string;
  startsAt: string;
  teamId?: string | null;
}) => ({
  all_day: overrides.allDay ?? false,
  ends_at: new Date(overrides.endsAt),
  person: {
    team_id: overrides.teamId === undefined ? teamA : overrides.teamId,
  },
  person_id: overrides.personId,
  starts_at: new Date(overrides.startsAt),
});

const countInput = (overrides: Partial<{ from: string; to: string }> = {}) => ({
  ...scope,
  awayRecordTypes: ["annual_leave", "training"] as const,
  from: "2026-10-12",
  teamIds: [teamA, teamB],
  timezone: brisbane,
  to: "2026-10-14",
  ...overrides,
});

describe("team queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTeamsWithCoverageMinimum", () => {
    it("scopes teams and active headcount by both tenancy keys", async () => {
      mocks.teamFindMany.mockResolvedValue([
        {
          _count: { people: 7 },
          id: teamA,
          minimum_available_people: 2,
          name: "Customer support",
        },
        {
          _count: { people: 0 },
          id: teamB,
          minimum_available_people: null,
          name: "Operations",
        },
      ]);

      const result = await listTeamsWithCoverageMinimum(scope);

      expect(result).toEqual({
        ok: true,
        value: [
          {
            activePeopleCount: 7,
            id: teamA,
            minimumAvailablePeople: 2,
            name: "Customer support",
          },
          {
            activePeopleCount: 0,
            id: teamB,
            minimumAvailablePeople: null,
            name: "Operations",
          },
        ],
      });
      const query = mocks.teamFindMany.mock.calls[0]?.[0];
      expect(query.where).toEqual({
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
      });
      expect(query.select._count.select.people.where).toEqual({
        archived_at: null,
        clerk_org_id: scope.clerkOrgId,
        is_active: true,
        organisation_id: scope.organisationId,
      });
    });

    it("returns an internal error when the read fails", async () => {
      mocks.teamFindMany.mockRejectedValue(new Error("down"));

      const result = await listTeamsWithCoverageMinimum(scope);

      expect(result).toMatchObject({ error: { code: "internal" }, ok: false });
    });
  });

  describe("setTeamCoverageMinimum", () => {
    it("updates the scoped team and reports the before and after values", async () => {
      mocks.teamFindFirst.mockResolvedValue({
        id: teamA,
        minimum_available_people: null,
        name: "Customer support",
      });
      mocks.teamUpdateMany.mockResolvedValue({ count: 1 });

      const result = await setTeamCoverageMinimum({
        ...scope,
        minimum: 2,
        teamId: teamA,
      });

      expect(result).toEqual({
        ok: true,
        value: {
          after: 2,
          before: null,
          teamId: teamA,
          teamName: "Customer support",
        },
      });
      const where = {
        clerk_org_id: scope.clerkOrgId,
        id: teamA,
        organisation_id: scope.organisationId,
      };
      expect(mocks.teamFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where })
      );
      expect(mocks.teamUpdateMany).toHaveBeenCalledWith({
        data: { minimum_available_people: 2 },
        where,
      });
    });

    it("returns not_found without updating when the team is outside the tenant", async () => {
      mocks.teamFindFirst.mockResolvedValue(null);

      const result = await setTeamCoverageMinimum({
        ...scope,
        minimum: 1,
        teamId: teamB,
      });

      expect(result).toMatchObject({ error: { code: "not_found" }, ok: false });
      expect(mocks.teamUpdateMany).not.toHaveBeenCalled();
    });

    it("uses the transaction client when one is passed", async () => {
      const tx = {
        team: {
          findFirst: vi.fn().mockResolvedValue({
            id: teamA,
            minimum_available_people: 3,
            name: "Customer support",
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const result = await setTeamCoverageMinimum(
        { ...scope, minimum: null, teamId: teamA },
        // The test double implements only the two delegate methods used.
        tx as unknown as Parameters<typeof setTeamCoverageMinimum>[1]
      );

      expect(result).toMatchObject({
        ok: true,
        value: { after: null, before: 3 },
      });
      expect(tx.team.updateMany).toHaveBeenCalledOnce();
      expect(mocks.teamFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("countAwayPeopleByTeamAndDay", () => {
    it("filters approved, non-archived away records of active people in the teams, scoped by both keys", async () => {
      mocks.recordFindMany.mockResolvedValue([]);

      await countAwayPeopleByTeamAndDay(countInput());

      const query = mocks.recordFindMany.mock.calls[0]?.[0];
      expect(query.where).toEqual({
        approval_status: "approved",
        archived_at: null,
        clerk_org_id: scope.clerkOrgId,
        // Brisbane is UTC+10: from 12 October local midnight, through the
        // end of the all-day UTC date 14 October.
        ends_at: { gte: new Date("2026-10-11T14:00:00.000Z") },
        organisation_id: scope.organisationId,
        person: {
          archived_at: null,
          clerk_org_id: scope.clerkOrgId,
          is_active: true,
          organisation_id: scope.organisationId,
          team_id: { in: [teamA, teamB] },
        },
        record_type: { in: ["annual_leave", "training"] },
        starts_at: { lt: new Date("2026-10-15T00:00:00.000Z") },
      });
      expect(Object.keys(query.select)).not.toContain("notes_internal");
    });

    it("counts each person once per day and returns zero-filled maps for every team and day", async () => {
      mocks.recordFindMany.mockResolvedValue([
        // Two overlapping records for one person on 12 October.
        buildRecord({
          endsAt: "2026-10-12T14:00:00.000Z",
          personId: "p1",
          startsAt: "2026-10-11T14:00:00.000Z",
        }),
        buildRecord({
          endsAt: "2026-10-12T04:00:00.000Z",
          personId: "p1",
          startsAt: "2026-10-12T00:00:00.000Z",
        }),
        // A second person away 12 and 13 October.
        buildRecord({
          endsAt: "2026-10-13T14:00:00.000Z",
          personId: "p2",
          startsAt: "2026-10-11T14:00:00.000Z",
        }),
      ]);

      const result = await countAwayPeopleByTeamAndDay(countInput());

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(Object.fromEntries(result.value.get(teamA) ?? [])).toEqual({
        "2026-10-12": 2,
        "2026-10-13": 1,
        "2026-10-14": 0,
      });
      expect(Object.fromEntries(result.value.get(teamB) ?? [])).toEqual({
        "2026-10-12": 0,
        "2026-10-13": 0,
        "2026-10-14": 0,
      });
    });

    it("uses half-open day boundaries in the given timezone", async () => {
      mocks.recordFindMany.mockResolvedValue([
        // Ends exactly at local midnight starting 13 October: 12 October only.
        buildRecord({
          endsAt: "2026-10-12T14:00:00.000Z",
          personId: "p1",
          startsAt: "2026-10-12T02:00:00.000Z",
        }),
      ]);

      const result = await countAwayPeopleByTeamAndDay(countInput());

      expect(
        result.ok && Object.fromEntries(result.value.get(teamA) ?? [])
      ).toEqual({
        "2026-10-12": 1,
        "2026-10-13": 0,
        "2026-10-14": 0,
      });
    });

    it("counts all-day records on their stored dates only", async () => {
      mocks.recordFindMany.mockResolvedValue([
        // A form-entered one-day leave on 12 October.
        buildRecord({
          allDay: true,
          endsAt: "2026-10-12T23:59:59.999Z",
          personId: "p1",
          startsAt: "2026-10-12T00:00:00.000Z",
        }),
        // A Xero one-day leave on 14 October (midnight to midnight).
        buildRecord({
          allDay: true,
          endsAt: "2026-10-14T00:00:00.000Z",
          personId: "p2",
          startsAt: "2026-10-14T00:00:00.000Z",
        }),
      ]);

      const result = await countAwayPeopleByTeamAndDay(countInput());

      expect(
        result.ok && Object.fromEntries(result.value.get(teamA) ?? [])
      ).toEqual({
        "2026-10-12": 1,
        "2026-10-13": 0,
        "2026-10-14": 1,
      });
    });

    it("resolves day boundaries across a daylight saving change", async () => {
      mocks.recordFindMany.mockResolvedValue([
        // 23:30 on 4 October in Sydney, after the change to UTC+11.
        buildRecord({
          endsAt: "2026-10-04T13:00:00.000Z",
          personId: "p1",
          startsAt: "2026-10-04T12:30:00.000Z",
        }),
        // 00:30 on 5 October in Sydney.
        buildRecord({
          endsAt: "2026-10-04T14:00:00.000Z",
          personId: "p2",
          startsAt: "2026-10-04T13:30:00.000Z",
        }),
      ]);

      const result = await countAwayPeopleByTeamAndDay({
        ...countInput({ from: "2026-10-04", to: "2026-10-04" }),
        timezone: "Australia/Sydney",
      });

      const query = mocks.recordFindMany.mock.calls[0]?.[0];
      // Sydney moves from UTC+10 to UTC+11 at 02:00 on 4 October 2026.
      expect(query.where.ends_at).toEqual({
        gte: new Date("2026-10-03T14:00:00.000Z"),
      });
      expect(
        result.ok && Object.fromEntries(result.value.get(teamA) ?? [])
      ).toEqual({ "2026-10-04": 1 });
    });

    it("skips the query when there are no teams", async () => {
      const result = await countAwayPeopleByTeamAndDay({
        ...countInput(),
        teamIds: [],
      });

      expect(result).toEqual({ ok: true, value: new Map() });
      expect(mocks.recordFindMany).not.toHaveBeenCalled();
    });

    it("rejects a range that ends before it starts", async () => {
      const result = await countAwayPeopleByTeamAndDay(
        countInput({ from: "2026-10-14", to: "2026-10-12" })
      );

      expect(result).toMatchObject({
        error: { code: "bad_request" },
        ok: false,
      });
      expect(mocks.recordFindMany).not.toHaveBeenCalled();
    });
  });
});

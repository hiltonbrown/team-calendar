import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { withTenantResult as withTestTenantResult } from "./src/tenant-db";
import { tenantTestAccount } from "./src/test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));
const fixture = allocateLiveTestFixture(
  "packages/database/teams.integration.test.ts"
);
const { systemDatabase: database } = await import("./index.js");
const {
  countAwayPeopleByTeamAndDay,
  listTeamsWithCoverageMinimum,
  setTeamCoverageMinimum,
} = await import("./src/queries/teams.js");

const tenantA = {
  accountId: fixture.tenants[0]?.accountId as string,
  organisationId: fixture.tenants[0]?.organisationId as string,
  teamId: fixture.id("team", 0),
} as const;
const tenantB = {
  accountId: fixture.tenants[1]?.accountId as string,
  organisationId: fixture.tenants[1]?.organisationId as string,
  teamId: fixture.id("team", 1),
} as const;
type Tenant = typeof tenantA | typeof tenantB;
const testAccountIds = [tenantA.accountId, tenantB.accountId];
const scopeOf = (tenant: Tenant) => ({
  accountId: tenant.accountId,
  organisationId: tenant.organisationId,
});

const cleanTestData = async () => {
  const scope = { account_id: { in: testAccountIds } };
  await database.availabilityRecord.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.team.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
};

const createTenant = async (tenant: Tenant, teamName: string) => {
  await database.organisation.create({
    data: {
      account_id: tenant.accountId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Test ${tenant.accountId}`,
      timezone: "Australia/Brisbane",
    },
  });
  await database.team.create({
    data: {
      account_id: tenant.accountId,
      id: tenant.teamId,
      minimum_available_people: 1,
      name: teamName,
      organisation_id: tenant.organisationId,
    },
  });
};

let personIndex = 0;
const createPerson = async (
  tenant: Tenant,
  state: { archived?: boolean; isActive?: boolean } = {}
) => {
  personIndex += 1;
  const id = fixture.id("person", personIndex);
  await database.person.create({
    data: {
      account_id: tenant.accountId,
      archived_at: state.archived ? new Date() : null,
      email: `${fixture.key("person", personIndex)}@example.com`,
      employment_type: "employee",
      first_name: "Test",
      id,
      is_active: state.isActive ?? true,
      last_name: `Person ${personIndex}`,
      organisation_id: tenant.organisationId,
      source_system: "MANUAL",
      team_id: tenant.teamId,
    },
  });
  return id;
};

let recordIndex = 0;
const createRecord = (
  tenant: Tenant,
  personId: string,
  overrides: {
    approvalStatus?: "approved" | "submitted";
    archived?: boolean;
    partDay?: boolean;
    recordType?: "annual_leave" | "wfh";
  } = {}
) => {
  recordIndex += 1;
  const id = fixture.id("availability-record", recordIndex);
  return database.availabilityRecord.create({
    data: {
      account_id: tenant.accountId,
      approval_status: overrides.approvalStatus ?? "approved",
      archived_at: overrides.archived ? new Date() : null,
      contactability: "contactable",
      derived_uid_key: `test:${id}`,
      // 12 October 2026 in Brisbane (UTC+10), or 09:00 to 13:00 that day.
      ends_at: new Date(
        overrides.partDay
          ? "2026-10-12T03:00:00.000Z"
          : "2026-10-12T14:00:00.000Z"
      ),
      id,
      include_in_feed: true,
      organisation_id: tenant.organisationId,
      person_id: personId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: overrides.recordType ?? "annual_leave",
      source_type: "manual",
      starts_at: new Date(
        overrides.partDay
          ? "2026-10-11T23:00:00.000Z"
          : "2026-10-11T14:00:00.000Z"
      ),
    },
  });
};

const countFor = (tenant: Tenant, teamIds: string[]) =>
  withTestTenantResult(
    tenantTestAccount({
      ...scopeOf(tenant),
      awayRecordTypes: ["annual_leave"],
      from: "2026-10-12",
      teamIds,
      timezone: "Australia/Brisbane",
      to: "2026-10-12",
    }),
    (db) =>
      countAwayPeopleByTeamAndDay(
        {
          ...scopeOf(tenant),
          awayRecordTypes: ["annual_leave"],
          from: "2026-10-12",
          teamIds,
          timezone: "Australia/Brisbane",
          to: "2026-10-12",
        },
        db
      )
  );

beforeEach(cleanTestData);
afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("team coverage queries", () => {
  test("lists only the tenant's teams with their active headcount", async () => {
    await createTenant(tenantA, "Customer support");
    await createTenant(tenantB, "Other tenant team");
    await createPerson(tenantA);
    await createPerson(tenantA);
    await createPerson(tenantA, { isActive: false });
    await createPerson(tenantA, { archived: true });
    await createPerson(tenantB);

    const result = await withTestTenantResult(
      tenantTestAccount(scopeOf(tenantA)),
      (db) => listTeamsWithCoverageMinimum(scopeOf(tenantA), db)
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          activePeopleCount: 2,
          id: tenantA.teamId,
          minimumAvailablePeople: 1,
          name: "Customer support",
        },
      ],
    });
  });

  test("updates a team in scope and refuses a team from another tenant", async () => {
    await createTenant(tenantA, "Customer support");
    await createTenant(tenantB, "Other tenant team");

    const updated = await withTestTenantResult(
      tenantTestAccount({
        ...scopeOf(tenantA),
        minimum: 2,
        teamId: tenantA.teamId,
      }),
      (db) =>
        setTeamCoverageMinimum(
          {
            ...scopeOf(tenantA),
            minimum: 2,
            teamId: tenantA.teamId,
          },
          db
        )
    );
    const crossTenant = await withTestTenantResult(
      tenantTestAccount({
        ...scopeOf(tenantA),
        minimum: 0,
        teamId: tenantB.teamId,
      }),
      (db) =>
        setTeamCoverageMinimum(
          {
            ...scopeOf(tenantA),
            minimum: 0,
            teamId: tenantB.teamId,
          },
          db
        )
    );

    expect(updated).toMatchObject({ ok: true, value: { after: 2, before: 1 } });
    expect(crossTenant).toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
    const otherTeam = await database.team.findUnique({
      where: { id: tenantB.teamId },
    });
    expect(otherTeam?.minimum_available_people).toBe(1);
  });

  test("counts approved away records of active people once per day, within the tenant only", async () => {
    await createTenant(tenantA, "Customer support");
    await createTenant(tenantB, "Other tenant team");
    const away = await createPerson(tenantA);
    const wfh = await createPerson(tenantA);
    const pending = await createPerson(tenantA);
    const inactive = await createPerson(tenantA, { isActive: false });
    const archivedRecordOwner = await createPerson(tenantA);
    const otherTenant = await createPerson(tenantB);
    await createRecord(tenantA, away);
    await createRecord(tenantA, away, { partDay: true });
    await createRecord(tenantA, wfh, { recordType: "wfh" });
    await createRecord(tenantA, pending, { approvalStatus: "submitted" });
    await createRecord(tenantA, inactive);
    await createRecord(tenantA, archivedRecordOwner, { archived: true });
    await createRecord(tenantB, otherTenant);

    const result = await countFor(tenantA, [tenantA.teamId, tenantB.teamId]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.get(tenantA.teamId)?.get("2026-10-12")).toBe(1);
    expect(result.value.get(tenantB.teamId)?.get("2026-10-12")).toBe(0);
  });
});

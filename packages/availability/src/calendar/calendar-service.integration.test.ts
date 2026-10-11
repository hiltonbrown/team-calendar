import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });
const fixture = allocateLiveTestFixture(
  "packages/availability/src/calendar/calendar-service.integration.test.ts"
);
const [accountA, accountB] = fixture.tenants;
if (!(accountA && accountB)) {
  throw new Error("Calendar accounts were not allocated");
}
const companies = [
  {
    clerkOrgId: accountA.clerkOrgId,
    id: accountA.organisationId,
    name: "Restaurants",
  },
  {
    clerkOrgId: accountA.clerkOrgId,
    id: fixture.id("second-company", 0),
    name: "Hotels",
  },
  {
    clerkOrgId: accountB.clerkOrgId,
    id: accountB.organisationId,
    name: "Other account",
  },
];
const { systemDatabase, tenantTransaction } = await import("@repo/database");
const { getCalendarRange } = await import("./calendar-service");
const clerkOrgIds = [accountA.clerkOrgId, accountB.clerkOrgId];
const input = {
  actingUserId: fixture.key("viewer", 0),
  anchorDate: new Date("2026-04-15T12:00:00Z"),
  clerkOrgId: accountA.clerkOrgId,
  role: "viewer",
  scope: { type: "all_teams" },
  view: "week",
};
async function clean() {
  const where = { clerk_org_id: { in: clerkOrgIds } };
  await systemDatabase.availabilityRecord.deleteMany({ where });
  await systemDatabase.person.deleteMany({ where });
  await systemDatabase.organisationSettings.deleteMany({ where });
  await systemDatabase.organisation.deleteMany({ where });
}
beforeAll(async () => {
  await clean();
  for (const [index, company] of companies.entries()) {
    await systemDatabase.organisation.create({
      data: {
        clerk_org_id: company.clerkOrgId,
        country_code: "AU",
        id: company.id,
        name: company.name,
        timezone: "Australia/Brisbane",
      },
    });
    await systemDatabase.person.create({
      data: {
        clerk_org_id: company.clerkOrgId,
        email: `${index}@calendar.example.test`,
        employment_type: "employee",
        first_name: "Sensitive",
        id: fixture.id("employee", index),
        last_name: company.name,
        organisation_id: company.id,
        source_person_key: "same-xero-employee",
        source_system: "XERO",
        xero_employee_id: "same-xero-employee",
      },
    });
    await systemDatabase.availabilityRecord.create({
      data: {
        all_day: true,
        approval_status: "approved",
        clerk_org_id: company.clerkOrgId,
        contactability: "limited",
        derived_uid_key: fixture.key("leave-uid", index),
        ends_at: new Date("2026-04-15T23:59:59Z"),
        id: fixture.id("leave", index),
        notes_internal: "Payroll medical detail",
        organisation_id: company.id,
        person_id: fixture.id("employee", index),
        privacy_mode: "private",
        record_type: "annual_leave",
        source_remote_id: "same-xero-leave",
        source_type: "xero_leave",
        starts_at: new Date("2026-04-15T00:00:00Z"),
      },
    });
  }
});
afterAll(clean);
describe("account-wide calendar isolation", () => {
  it("keeps identical provider IDs separate and transforms private leave before returning it", async () => {
    const result = await getCalendarRange(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.companies.map((company) => company.name)).toEqual([
      "Restaurants",
      "Hotels",
    ]);
    expect(result.value.people.map((person) => person.companyId)).toEqual([
      companies[0].id,
      companies[1].id,
    ]);
    const events = result.value.days.flatMap((day) => day.events);
    expect(new Set(events.map((event) => event.id))).toEqual(
      new Set([fixture.id("leave", 0), fixture.id("leave", 1)])
    );
    expect(
      events.every(
        (event) =>
          event.recordType === "private" &&
          event.displayName === "Unavailable" &&
          event.notesInternal === null &&
          event.xeroWriteError === null
      )
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain("Payroll medical detail");
    expect(JSON.stringify(events)).not.toContain("annual_leave");
  });
  it("filters to an owned company and rejects crafted other-account company IDs", async () => {
    const [, ownCompany] = companies;
    const result = await getCalendarRange({
      ...input,
      companyIds: [ownCompany.id],
    });
    expect(result).toMatchObject({
      ok: true,
      value: { people: [{ companyId: ownCompany.id }] },
    });
    expect(
      await getCalendarRange({
        ...input,
        companyIds: [accountB.organisationId],
      })
    ).toMatchObject({ error: { code: "validation_error" }, ok: false });
  });
  it("enforces RLS when all application filters are removed", async () => {
    const records = await tenantTransaction(accountA.clerkOrgId, (tx) =>
      tx.availabilityRecord.findMany({
        select: { id: true, organisation_id: true },
      })
    );
    expect(records.some((record) => record.id === fixture.id("leave", 2))).toBe(
      false
    );
    expect(new Set(records.map((record) => record.organisation_id))).toEqual(
      new Set([companies[0].id, companies[1].id])
    );
  });
});

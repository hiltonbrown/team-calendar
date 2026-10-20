import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const state = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  visible: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),
  resolveAccountCompanies: async () => companies,
  scopedQuery: (account: string, company: string) => ({
    clerk_org_id: account,
    organisation_id: company,
  }),
}));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));
vi.mock("./current-status", () => ({
  computeCurrentStatus: vi.fn(),
  computeCurrentStatusForPeople: async (requestInput: {
    people: { personId: string }[];
  }) =>
    new Map(
      requestInput.people.map((person) => [
        person.personId,
        {
          activePublicHoliday: null,
          activeRecord: null,
          approvalStatus: null,
          contactabilityStatus: null,
          label: "Available",
          recordType: null,
          statusKey: "available",
        },
      ])
    ),
  computePublicHolidayApplicability: vi.fn(),
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: async () => state.visible,
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: vi.fn(),
}));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import { canAccessPerson, listPeople, type PeopleRole } from "./people-service";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const foreignId = "55555555-5555-4555-8555-555555555555";
const companies = [
  { id: companyA, name: "Company A" },
  { id: companyB, name: "Company B" },
];
const rows = companies.map((company, index) => ({
  archived_at: null,
  avatar_url: null,
  clerk_org_id: "account-A",
  email: "person@example.com",
  employment_type: "employee",
  first_name: index ? "Blair" : "Alex",
  id: index ? reportId : actorId,
  job_title: null,
  last_name: "Person",
  location: null,
  location_id: null,
  manager: null,
  organisation: company,
  organisation_id: company.id,
  person_type: "employee",
  team: null,
  xero_employee_id: null,
}));
interface DirectoryWhere {
  clerk_org_id: string;
  id?: { in: string[] };
  organisation_id: { in: string[] };
}
function matchingRows(where: DirectoryWhere) {
  return rows.filter(
    (row) =>
      row.clerk_org_id === where.clerk_org_id &&
      where.organisation_id.in.includes(row.organisation_id) &&
      (!where.id || where.id.in.includes(row.id))
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.visible = [actorId, reportId];
  state.findMany.mockImplementation(
    async ({ where }: { where: DirectoryWhere }) => matchingRows(where)
  );
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Delegate fake exercises the real root transaction and scope ownership.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: { groupBy: async () => [] },
        person: {
          count: async ({ where }: { where: DirectoryWhere }) =>
            matchingRows(where).length,
          findMany: state.findMany,
        },
      } as unknown as Prisma.TransactionClient;
      return await run(db);
    }
  );
});
const input = { actingPersonId: actorId, clerkOrgId: "account-A" };
test.each(["owner", "admin"] as const)(
  "%s sees each owned company with provenance by default",
  async (role) => {
    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, role }),
      (db) => listPeople({ ...input, role }, db)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected directory");
    }
    expect(
      result.value.people.map((person) => [
        person.companyId,
        person.companyName,
      ])
    ).toEqual([
      [companyA, "Company A"],
      [companyB, "Company B"],
    ]);
    expect(result.value.totalCount).toBe(2);
    expect(state.transaction).toHaveBeenCalledTimes(1);
  }
);
test("company filter narrows account directory", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({
      ...input,
      companyIds: [companyB],
      role: "owner",
    }),
    (db) =>
      listPeople(
        {
          ...input,
          companyIds: [companyB],
          role: "owner",
        },
        db
      )
  );
  expect(result.ok && result.value.people.map((person) => person.id)).toEqual([
    reportId,
  ]);
});
test.each(["viewer", "manager"] as const)(
  "%s keeps its role scope across companies",
  async (role) => {
    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, role }),
      (db) => listPeople({ ...input, role }, db)
    );
    expect(result.ok && result.value.people.map((person) => person.id)).toEqual(
      role === "viewer" ? [actorId] : [actorId, reportId]
    );
  }
);
test("unlinked viewer sees no people", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({ clerkOrgId: "account-A", role: "viewer" }),
    (db) => listPeople({ clerkOrgId: "account-A", role: "viewer" }, db)
  );
  expect(result.ok && result.value.totalCount).toBe(0);
  expect(state.findMany).not.toHaveBeenCalled();
});
test("manager profile access follows cross-company scope and excludes a foreign person", async () => {
  await withTenantDb("account-A", async (db) => {
    expect(
      await canAccessPerson(
        {
          ...input,
          organisationId: companyB,
          personId: reportId,
          role: "manager",
        },
        db
      )
    ).toBe(true);
    expect(
      await canAccessPerson(
        {
          ...input,
          organisationId: companyB,
          personId: foreignId,
          role: "manager",
        },
        db
      )
    ).toBe(false);
    expect((await listPeople({ ...input, role: "manager" }, db)).ok).toBe(true);
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test.each(["owner", "admin", "manager", "viewer"] as PeopleRole[])(
  "%s rejects mismatched caller before data access",
  async (role) => {
    await expect(
      withTenantDb("account-B", (db) => listPeople({ ...input, role }, db))
    ).rejects.toBeInstanceOf(TenantMismatchError);
    expect(state.findMany).not.toHaveBeenCalled();
  }
);
test("foreign-company selection fails before people reads", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({
      ...input,
      companyIds: [foreignId],
      role: "admin",
    }),
    (db) =>
      listPeople(
        {
          ...input,
          companyIds: [foreignId],
          role: "admin",
        },
        db
      )
  );
  expect(!result.ok && result.error.code).toBe("validation_error");
  expect(state.findMany).not.toHaveBeenCalled();
});

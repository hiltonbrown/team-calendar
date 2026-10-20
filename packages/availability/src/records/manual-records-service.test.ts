import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  availabilityCreate: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityFindMany: vi.fn(),
  availabilityUpdate: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(),
  personFindFirst: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),

  scopedQuery: mocks.scopedQuery,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      availabilityRecord: {
        create: mocks.availabilityCreate,
        findFirst: mocks.availabilityFindFirst,
        findMany: mocks.availabilityFindMany,
        update: mocks.availabilityUpdate,
      },
      person: {
        findFirst: mocks.personFindFirst,
      },
    },
  };
}
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn() },
}));

const {
  archiveManualAvailability,
  createManualAvailability,
  updateManualAvailability,
} = await import("./manual-records-service");

const tenant = {
  clerkOrgId: "org_clerk_123",
  organisationId: "22222222-2222-4222-a222-222222222222",
};

const targetPerson = {
  clerk_user_id: "user_target",
  id: "11111111-1111-4111-a111-111111111111",
  manager_person_id: "33333333-3333-4333-a333-333333333333",
};

const recordView = {
  all_day: false,
  contactability: "contactable",
  ends_at: new Date("2026-07-01T17:00:00.000Z"),
  id: "44444444-4444-4444-8444-444444444444",
  include_in_feed: true,
  notes_internal: null,
  person: {
    display_name: "Taylor Target",
    email: "taylor@example.com",
    first_name: "Taylor",
    id: targetPerson.id,
    last_name: "Target",
  },
  privacy_mode: "named",
  record_type: "wfh",
  starts_at: new Date("2026-07-01T09:00:00.000Z"),
  title: "WFH",
  working_location: null,
};

const validInput = {
  allDay: false,
  contactability: "contactable",
  endsAt: new Date("2026-07-01T17:00:00.000Z"),
  includeInFeed: true,
  personId: targetPerson.id,
  preferredContactMethod: "Email",
  privacyMode: "named",
  recordType: "wfh",
  startsAt: new Date("2026-07-01T09:00:00.000Z"),
  title: "WFH",
};

describe("manual-records-service authorisation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.availabilityFindFirst.mockResolvedValue(null);
    mocks.availabilityCreate.mockResolvedValue(recordView);
    mocks.availabilityUpdate.mockResolvedValue(recordView);
    mocks.materialiseAvailabilityPublication.mockResolvedValue({
      ok: true,
      value: undefined,
    });
  });

  it("rejects a peer creating a manual record for another person", async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: "99999999-9999-4999-a999-999999999999" });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      createManualAvailability(
        tenant,
        validInput,
        {
          orgRole: "org:viewer",
          userId: "user_peer",
        },
        db
      )
    );

    expect(result).toMatchObject({
      error: expect.objectContaining({ code: "not_authorised" }),
      ok: false,
    });
    expect(mocks.availabilityCreate).not.toHaveBeenCalled();
  });

  it("allows a person to create their own manual record", async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: "99999999-9999-4999-a999-999999999999" });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      createManualAvailability(
        tenant,
        validInput,
        {
          orgRole: "org:viewer",
          userId: "user_target",
        },
        db
      )
    );

    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({
        id: recordView.id,
        personId: targetPerson.id,
      }),
    });
    expect(mocks.availabilityCreate).toHaveBeenCalledTimes(1);
  });

  it("allows an admin to create a manual record for another person", async () => {
    mocks.personFindFirst.mockResolvedValueOnce(targetPerson);

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      createManualAvailability(
        tenant,
        validInput,
        {
          orgRole: "org:admin",
          userId: "user_admin",
        },
        db
      )
    );

    expect(result).toMatchObject({ ok: true });
    expect(mocks.personFindFirst).toHaveBeenCalledTimes(1);
  });

  it("preserves the assigned UID while changing manual dates and type", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...recordView,
        derived_uid_key: "assigned@ical.teamcalendar.online",
        person: targetPerson,
        person_id: targetPerson.id,
        preferred_contact_method: "Email",
        source_type: "manual",
      })
      .mockResolvedValueOnce(null);
    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      updateManualAvailability(
        tenant,
        recordView.id,
        {
          ...validInput,
          endsAt: new Date("2026-07-02T17:00:00.000Z"),
          recordType: "training",
          startsAt: new Date("2026-07-02T09:00:00.000Z"),
        },
        { orgRole: "org:admin", userId: "user_admin" },
        db
      )
    );
    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          derived_uid_key: expect.anything(),
        }),
        where: expect.objectContaining({
          clerk_org_id: tenant.clerkOrgId,
          organisation_id: tenant.organisationId,
        }),
      })
    );
  });

  it("rejects a peer updating another person's manual record", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        person: targetPerson,
        person_id: targetPerson.id,
      })
      .mockResolvedValueOnce(null);
    mocks.personFindFirst.mockResolvedValueOnce({
      id: "99999999-9999-4999-a999-999999999999",
    });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      updateManualAvailability(
        tenant,
        recordView.id,
        validInput,
        { orgRole: "org:viewer", userId: "user_peer" },
        db
      )
    );

    expect(result).toMatchObject({
      error: expect.objectContaining({ code: "not_authorised" }),
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("rejects a peer archiving another person's manual record", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({ person: targetPerson });
    mocks.personFindFirst.mockResolvedValueOnce({
      id: "99999999-9999-4999-a999-999999999999",
    });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      archiveManualAvailability(
        tenant,
        recordView.id,
        {
          orgRole: "org:viewer",
          userId: "user_peer",
        },
        db
      )
    );

    expect(result).toMatchObject({
      error: expect.objectContaining({ code: "not_authorised" }),
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("allows a direct manager and rejects an indirect manager", async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: targetPerson.manager_person_id });

    const directManagerResult = await withTestTenantResult(
      tenantTestAccount(tenant),
      (db) =>
        createManualAvailability(
          tenant,
          validInput,
          {
            orgRole: "org:viewer",
            userId: "user_manager",
          },
          db
        )
    );

    expect(directManagerResult).toMatchObject({ ok: true });

    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: "55555555-5555-4555-a555-555555555555" });

    const indirectManagerResult = await withTestTenantResult(
      tenantTestAccount(tenant),
      (db) =>
        createManualAvailability(
          tenant,
          validInput,
          {
            orgRole: "org:viewer",
            userId: "user_indirect_manager",
          },
          db
        )
    );

    expect(indirectManagerResult).toMatchObject({
      error: expect.objectContaining({ code: "not_authorised" }),
      ok: false,
    });
  });
});

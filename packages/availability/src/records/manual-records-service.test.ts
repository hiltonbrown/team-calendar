import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@repo/database", () => ({
  database: {
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
  scopedQuery: mocks.scopedQuery,
}));
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

    const result = await createManualAvailability(tenant, validInput, {
      orgRole: "org:viewer",
      userId: "user_peer",
    });

    expect(result).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "not_authorised" }),
    });
    expect(mocks.availabilityCreate).not.toHaveBeenCalled();
  });

  it("allows a person to create their own manual record", async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: "99999999-9999-4999-a999-999999999999" });

    const result = await createManualAvailability(tenant, validInput, {
      orgRole: "org:viewer",
      userId: "user_target",
    });

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

    const result = await createManualAvailability(tenant, validInput, {
      orgRole: "org:admin",
      userId: "user_admin",
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.personFindFirst).toHaveBeenCalledTimes(1);
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

    const result = await updateManualAvailability(
      tenant,
      recordView.id,
      validInput,
      { orgRole: "org:viewer", userId: "user_peer" }
    );

    expect(result).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "not_authorised" }),
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("rejects a peer archiving another person's manual record", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({ person: targetPerson });
    mocks.personFindFirst.mockResolvedValueOnce({
      id: "99999999-9999-4999-a999-999999999999",
    });

    const result = await archiveManualAvailability(tenant, recordView.id, {
      orgRole: "org:viewer",
      userId: "user_peer",
    });

    expect(result).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "not_authorised" }),
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("allows a direct manager and rejects an indirect manager", async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: targetPerson.manager_person_id });

    const directManagerResult = await createManualAvailability(
      tenant,
      validInput,
      {
        orgRole: "org:viewer",
        userId: "user_manager",
      }
    );

    expect(directManagerResult).toMatchObject({ ok: true });

    mocks.personFindFirst
      .mockResolvedValueOnce(targetPerson)
      .mockResolvedValueOnce({ id: "55555555-5555-4555-a555-555555555555" });

    const indirectManagerResult = await createManualAvailability(
      tenant,
      validInput,
      {
        orgRole: "org:viewer",
        userId: "user_indirect_manager",
      }
    );

    expect(indirectManagerResult).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "not_authorised" }),
    });
  });
});

import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFetchLeaveForEmployeeForRegion = vi.fn();
const mockFetchLeaveRecordsForRegion = vi.fn();
const mockInngestSend = vi.fn(async () => ({ ids: ["event_1"] }));
const ICAL_UID_SUFFIX_REGEX = /@ical.teamcalendar.online$/;
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-records" })),
    send: mockInngestSend,
  },
}));

vi.mock("@repo/xero", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/xero")>();
  return {
    ...original,
    fetchLeaveForEmployeeForRegion: (...args: unknown[]) =>
      mockFetchLeaveForEmployeeForRegion(...args),
    fetchLeaveRecordsForRegion: (...args: unknown[]) =>
      mockFetchLeaveRecordsForRegion(...args),
  };
});

await import("./setup-env");

const { getRegisteredSyncEventName } = await import("../events");

const fixture = allocateLiveTestFixture(
  "packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts"
);
const { database } = await import("@repo/database");
const { syncXeroLeaveRecords } = await import("./sync-xero-leave-records");

const tenantA = {
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  organisationId: fixture.tenants[0]?.organisationId as string,
  personId: fixture.id("person", 0),
  xeroConnectionId: fixture.id("connection", 0),
  xeroEmployeeId: fixture.id("employee", 0),
  xeroTenantId: fixture.id("tenant", 0),
} as const;

const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
  organisationId: fixture.tenants[1]?.organisationId as string,
  personId: fixture.id("person", 1),
  xeroConnectionId: fixture.id("connection", 1),
  xeroEmployeeId: tenantA.xeroEmployeeId,
  xeroTenantId: fixture.id("tenant", 1),
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

describe("sync-xero-leave-records handler", () => {
  it("is registered for dispatch", () => {
    expect(getRegisteredSyncEventName("leave_records")).toBe(
      "sync-xero-leave-records"
    );
  });
});

describe("sync-xero-leave-records database flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  it("syncs AU leave idempotently and archives stale scoped records", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    await setupFeed(tenantA);
    await createStaleRecord(tenantA);

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const input = syncInput(tenantA);
    const first = await syncXeroLeaveRecords(input);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toMatchObject({
        archived: 1,
        failed: 0,
        fetched: 1,
        status: "succeeded",
        upserted: 1,
      });
    }

    const second = await syncXeroLeaveRecords(input);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value).toMatchObject({
        archived: 0,
        failed: 0,
        fetched: 1,
        skipped: 1,
        status: "succeeded",
        upserted: 0,
      });
    }

    const records = await database.availabilityRecord.findMany({
      orderBy: { source_remote_id: "asc" },
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_type: "xero_leave",
      },
    });
    expect(records).toHaveLength(2);
    expect(
      records.filter((record) => record.archived_at === null)
    ).toHaveLength(1);
    expect(
      records.find((record) => record.source_remote_id === leaveId())
        ?.derived_uid_key
    ).toMatch(ICAL_UID_SUFFIX_REGEX);
    const currentRecord = records.find(
      (record) => record.source_remote_id === leaveId()
    );
    expect(currentRecord?.source_payload_json).toMatchObject({
      LeaveApplicationID: leaveId(),
    });
    expect(currentRecord?.source_remote_hash).toMatch(SHA256_HEX_REGEX);
    expect(
      records.find((record) => record.source_remote_id === staleLeaveId())
        ?.publish_status
    ).toBe("archived");
    const publications = await database.availabilityPublication.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
      },
    });
    expect(publications).toHaveLength(1);
    expect(
      publications.find((publication) =>
        publication.published_uid.endsWith("@ical.teamcalendar.online")
      )?.published_sequence
    ).toBe(0);

    expect(mockInngestSend).toHaveBeenCalledWith([
      {
        data: {
          clerkOrgId: tenantA.clerkOrgId,
          feedId: expect.any(String),
          organisationId: tenantA.organisationId,
          reason: "xero_leave_records_synced",
        },
        name: "rebuild-feed-cache",
      },
    ]);
  });

  it("isolates record failures and completes as partial_success", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [
          xeroLeaveRecord(tenantA),
          {
            ...xeroLeaveRecord(tenantA),
            employeeId: "",
            leaveApplicationId: "",
          },
        ],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        fetched: 2,
        status: "partial_success",
        upserted: 1,
      });
    }

    const failedRecords = await database.failedRecord.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
      },
    });
    expect(failedRecords).toHaveLength(1);
    expect(failedRecords[0]).toMatchObject({
      entity_type: "leave_records",
      error_code: "validation_error",
      record_type: "leave_records",
    });
  });

  it("requires both Clerk org and Organisation scope for people and records", async () => {
    await setupTenant(tenantA);
    await setupTenant(tenantB);
    await setupPerson(tenantB);

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        status: "partial_success",
        upserted: 0,
      });
    }

    const tenantBRecords = await database.availabilityRecord.findMany({
      where: {
        clerk_org_id: tenantB.clerkOrgId,
        organisation_id: tenantB.organisationId,
      },
    });
    expect(tenantBRecords).toHaveLength(0);
  });

  it("updates a matching Team Calendar leave instead of creating a duplicate Xero leave", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const existing = await createExistingRecord(tenantA, {
      approvalStatus: "approved",
      sourceRemoteId: leaveId(),
      sourceType: "team_calendar_leave",
    });
    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    const records = await database.availabilityRecord.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: leaveId(),
      },
    });
    expect(records).toHaveLength(1);
    // Title is user-owned on a Team Calendar leave and must not be
    // overwritten by the incoming Xero record. See sync-xero-leave-records.ts.
    expect(records[0]).toMatchObject({
      id: existing.id,
      source_type: "team_calendar_leave",
      title: "Previous title",
    });
  });

  it("skips an inbound snapshot older than the stored remote state", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const storedTimestamp = new Date("2026-06-01T00:00:00.000Z");
    const existing = await createExistingRecord(tenantA, {
      approvalNote: "Manager decision",
      approvalStatus: "approved",
      sourceLastModifiedAt: storedTimestamp,
      sourceRemoteHash: "stored-newer-hash",
      sourceRemoteId: leaveId(),
      sourceType: "xero_leave",
    });
    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        skipped: 1,
        upserted: 0,
      });
    }
    expect(
      await database.availabilityRecord.findUnique({
        where: { id: existing.id },
      })
    ).toMatchObject({
      approval_note: "Manager decision",
      approval_status: "approved",
      source_last_modified_at: storedTimestamp,
      source_remote_hash: "stored-newer-hash",
    });
  });

  it("preserves a concurrent local write when the compare-and-swap loses", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const existing = await createExistingRecord(tenantA, {
      approvalStatus: "approved",
      sourceRemoteId: leaveId(),
      sourceType: "xero_leave",
    });
    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const originalFindMany = database.availabilityRecord.findMany;
    let injected = false;
    const findManySpy = vi
      .spyOn(database.availabilityRecord, "findMany")
      .mockImplementation(async (args) => {
        const rows = await originalFindMany.call(
          database.availabilityRecord,
          args
        );
        if (args.select?.source_last_modified_at === true && !injected) {
          injected = true;
          await database.availabilityRecord.update({
            data: {
              approval_status: "declined",
              derived_sequence: 7,
              updated_at: new Date(),
            },
            where: { id: existing.id },
          });
        }
        return rows;
      });

    try {
      const result = await syncXeroLeaveRecords(syncInput(tenantA));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          failed: 0,
          skipped: 1,
          upserted: 0,
        });
      }
      expect(
        await database.availabilityRecord.findUnique({
          where: { id: existing.id },
        })
      ).toMatchObject({
        approval_status: "declined",
        derived_sequence: 7,
      });
    } finally {
      findManySpy.mockRestore();
    }
  });

  it("preserves a failed withdrawal while Xero still reports the leave as approved", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    const existing = await createExistingRecord(tenantA, {
      approvalStatus: "xero_sync_failed",
      failedAction: "withdraw",
      sourceRemoteId: leaveId(),
      sourceType: "team_calendar_leave",
    });
    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    expect(
      await database.availabilityRecord.findUnique({
        where: { id: existing.id },
      })
    ).toMatchObject({
      approval_status: "xero_sync_failed",
      failed_action: "withdraw",
    });
  });

  it("preserves a concurrent fresh write against stale archival when updated_at is after sync started", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    await setupFeed(tenantA);
    await createStaleRecord(tenantA);

    // Update the stale record with a future updated_at to simulate a concurrent write
    const futureDate = new Date(Date.now() + 60_000);
    await database.availabilityRecord.updateMany({
      data: { updated_at: futureDate },
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: staleLeaveId(),
      },
    });

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 0,
        failed: 0,
        status: "succeeded",
        upserted: 1,
      });
    }

    const record = await database.availabilityRecord.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: staleLeaveId(),
      },
    });
    expect(record?.archived_at).toBeNull();
    expect(record?.publish_status).toBe("eligible");
  });

  it("skips an incomplete fetch but archives an authoritative empty fetch", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    await setupFeed(tenantA);
    await createStaleRecord(tenantA);

    // Incomplete fetch
    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: false,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const incompleteResult = await syncXeroLeaveRecords(syncInput(tenantA));
    expect(incompleteResult.ok).toBe(true);
    if (incompleteResult.ok) {
      expect(incompleteResult.value.archived).toBe(0);
    }

    let record = await database.availabilityRecord.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: staleLeaveId(),
      },
    });
    expect(record?.archived_at).toBeNull();

    // Empty fetch
    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [],
        rawResponse: {},
      },
    });

    const emptyResult = await syncXeroLeaveRecords(syncInput(tenantA));
    expect(emptyResult.ok).toBe(true);
    if (emptyResult.ok) {
      expect(emptyResult.value.archived).toBe(2);
    }

    record = await database.availabilityRecord.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: staleLeaveId(),
      },
    });
    expect(record?.archived_at).not.toBeNull();
    expect(record?.publish_status).toBe("archived");
  });

  it("bulk archives multiple stale records for the same person and enqueues feed rebuild once", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    await setupFeed(tenantA);

    // Create 3 stale records for tenantA
    const staleIds = [
      "50000000-0000-4000-8000-000000000091",
      "50000000-0000-4000-8000-000000000092",
      "50000000-0000-4000-8000-000000000093",
    ];
    for (const id of staleIds) {
      await database.availabilityRecord.create({
        data: {
          all_day: true,
          approval_status: "approved",
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "unavailable",
          derived_uid_key: `stale-${id}`,
          ends_at: new Date("2026-05-05T00:00:00.000Z"),
          organisation_id: tenantA.organisationId,
          person_id: tenantA.personId,
          privacy_mode: "named",
          publish_status: "eligible",
          record_type: "annual_leave",
          source_remote_id: id,
          source_type: "xero_leave",
          starts_at: new Date("2026-05-04T00:00:00.000Z"),
        },
      });
    }

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 3,
        failed: 0,
        status: "succeeded",
        upserted: 1,
      });
    }

    const archivedRecords = await database.availabilityRecord.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_remote_id: { in: staleIds },
      },
    });
    expect(archivedRecords).toHaveLength(3);
    for (const rec of archivedRecords) {
      expect(rec.archived_at).not.toBeNull();
      expect(rec.publish_status).toBe("archived");
    }

    // Inngest send called with deduplicated feeds (1 event for the 1 person feed)
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    expect(mockInngestSend).toHaveBeenCalledWith([
      {
        data: {
          clerkOrgId: tenantA.clerkOrgId,
          feedId: "50000000-0000-4000-8000-000000000010",
          organisationId: tenantA.organisationId,
          reason: "xero_leave_records_synced",
        },
        name: "rebuild-feed-cache",
      },
    ]);
  });

  it("pages regional NZ leave in 20-person batches with cursor advancement and reset in database", async () => {
    await setupTenant(tenantA, "NZ");

    // Create 21 people in one batch
    const peopleData = Array.from({ length: 21 }, (_, i) => ({
      clerk_org_id: tenantA.clerkOrgId,
      email: `person${i + 1}@example.com`,
      employment_type: "employee" as const,
      first_name: "Person",
      id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      last_name: String(i + 1),
      organisation_id: tenantA.organisationId,
      source_person_key: `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      source_system: "XERO" as const,
      xero_employee_id: `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    }));
    await database.person.createMany({ data: peopleData });

    mockFetchLeaveForEmployeeForRegion.mockImplementation(
      async (_region, empInput: { xeroEmployeeId: string }) => ({
        ok: true,
        value: {
          complete: true,
          leaveRecords: [
            {
              employeeId: empInput.xeroEmployeeId,
              endDate: "2026-05-08",
              leaveApplicationId: `50000000-0000-4000-8000-${empInput.xeroEmployeeId.slice(-12)}`,
              leaveTypeId: "annual",
              leaveTypeName: "Annual Leave",
              rawPayload: {
                LeaveApplicationID: `50000000-0000-4000-8000-${empInput.xeroEmployeeId.slice(-12)}`,
              },
              startDate: "2026-05-07",
              status: "APPROVED" as const,
              title: "Annual leave",
              units: 8,
              updatedDateUtc: "2026-05-01T00:00:00.000Z",
            },
          ],
          rawResponse: {},
        },
      })
    );

    const input = syncInput(tenantA);

    // First page: processes 20 people
    const firstRun = await syncXeroLeaveRecords(input);
    expect(firstRun.ok).toBe(true);
    if (firstRun.ok) {
      expect(firstRun.value).toMatchObject({
        failed: 0,
        fetched: 20,
        status: "succeeded",
        upserted: 20,
      });
    }

    const cursor1 = await database.xeroSyncCursor.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        entity_type: "leave_records",
        organisation_id: tenantA.organisationId,
        xero_tenant_id: tenantA.xeroTenantId,
      },
    });
    expect(cursor1?.cursor_value).toBe(peopleData[19]?.id);

    const tenantAfterPage1 = await database.xeroTenant.findUnique({
      where: { id: tenantA.xeroTenantId },
    });
    expect(tenantAfterPage1?.leave_records_stale_since).not.toBeNull();

    // Second page: processes remaining 1 person
    const secondRun = await syncXeroLeaveRecords(input);
    expect(secondRun.ok).toBe(true);
    if (secondRun.ok) {
      expect(secondRun.value).toMatchObject({
        failed: 0,
        fetched: 1,
        status: "succeeded",
        upserted: 1,
      });
    }

    const cursor2 = await database.xeroSyncCursor.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        entity_type: "leave_records",
        organisation_id: tenantA.organisationId,
        xero_tenant_id: tenantA.xeroTenantId,
      },
    });
    expect(cursor2?.cursor_value).toBeNull();

    const tenantAfterPage2 = await database.xeroTenant.findUnique({
      where: { id: tenantA.xeroTenantId },
    });
    expect(tenantAfterPage2?.leave_records_stale_since).toBeNull();
  }, 20_000);

  it("isolates person-scoped stale archival between Person A and Person B in NZ regional sync", async () => {
    await setupTenant(tenantA, "NZ");
    await setupPerson(tenantA);

    const personBId = "50000000-0000-4000-8000-000000000088";
    const employeeBId = "60000000-0000-4000-8000-000000000088";
    await database.person.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        email: "personb@example.com",
        employment_type: "employee",
        first_name: "Person",
        id: personBId,
        last_name: "B",
        organisation_id: tenantA.organisationId,
        source_person_key: employeeBId,
        source_system: "XERO",
        xero_employee_id: employeeBId,
      },
    });

    // Create stale record for Person A
    const staleAId = "50000000-0000-4000-8000-000000000091";
    await database.availabilityRecord.create({
      data: {
        all_day: true,
        approval_status: "approved",
        clerk_org_id: tenantA.clerkOrgId,
        contactability: "unavailable",
        derived_uid_key: `stale-${staleAId}`,
        ends_at: new Date("2026-05-05T00:00:00.000Z"),
        organisation_id: tenantA.organisationId,
        person_id: tenantA.personId,
        privacy_mode: "named",
        publish_status: "eligible",
        record_type: "annual_leave",
        source_remote_id: staleAId,
        source_type: "xero_leave",
        starts_at: new Date("2026-05-04T00:00:00.000Z"),
      },
    });

    // Create stale record for Person B
    const staleBId = "50000000-0000-4000-8000-000000000092";
    await database.availabilityRecord.create({
      data: {
        all_day: true,
        approval_status: "approved",
        clerk_org_id: tenantA.clerkOrgId,
        contactability: "unavailable",
        derived_uid_key: `stale-${staleBId}`,
        ends_at: new Date("2026-05-05T00:00:00.000Z"),
        organisation_id: tenantA.organisationId,
        person_id: personBId,
        privacy_mode: "named",
        publish_status: "eligible",
        record_type: "annual_leave",
        source_remote_id: staleBId,
        source_type: "xero_leave",
        starts_at: new Date("2026-05-04T00:00:00.000Z"),
      },
    });

    // Person A has a new active leave in Xero, stale record is omitted
    mockFetchLeaveForEmployeeForRegion.mockImplementation(
      async (_region, input: { xeroEmployeeId: string }) => ({
        ok: true,
        value: {
          complete: true,
          leaveRecords: [
            {
              employeeId: input.xeroEmployeeId,
              endDate: "2026-05-08",
              leaveApplicationId: leaveId(),
              leaveTypeId: "annual",
              leaveTypeName: "Annual Leave",
              rawPayload: { LeaveApplicationID: leaveId() },
              startDate: "2026-05-07",
              status: "APPROVED" as const,
              title: "Annual leave",
              units: 8,
              updatedDateUtc: "2026-05-01T00:00:00.000Z",
            },
          ],
          rawResponse: {},
        },
      })
    );

    // Run targeted sync for Person A only
    const result = await syncXeroLeaveRecords({
      ...syncInput(tenantA),
      personId: tenantA.personId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 1,
        failed: 0,
        status: "succeeded",
        upserted: 1,
      });
    }

    // Person A's stale record is archived
    const recordA = await database.availabilityRecord.findFirst({
      where: { source_remote_id: staleAId },
    });
    expect(recordA?.archived_at).not.toBeNull();
    expect(recordA?.publish_status).toBe("archived");

    // Person B's stale record MUST REMAIN ACTIVE (untouched)
    const recordB = await database.availabilityRecord.findFirst({
      where: { source_remote_id: staleBId },
    });
    expect(recordB?.archived_at).toBeNull();
    expect(recordB?.publish_status).toBe("eligible");
  });

  it("handles CAS race condition in database when cursor is modified concurrently", async () => {
    await setupTenant(tenantA, "NZ");
    await setupPerson(tenantA);

    const initialCursor = "50000000-0000-4000-8000-000000000001";
    const modifiedCursor = "50000000-0000-4000-8000-000000000099";

    await database.xeroSyncCursor.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        cursor_value: initialCursor,
        entity_type: "leave_records",
        organisation_id: tenantA.organisationId,
        xero_tenant_id: tenantA.xeroTenantId,
      },
    });

    mockFetchLeaveForEmployeeForRegion.mockImplementation(async () => {
      // Modify cursor concurrently in the database
      await database.xeroSyncCursor.updateMany({
        data: { cursor_value: modifiedCursor },
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          entity_type: "leave_records",
          organisation_id: tenantA.organisationId,
          xero_tenant_id: tenantA.xeroTenantId,
        },
      });
      return {
        ok: true,
        value: {
          complete: true,
          leaveRecords: [],
          rawResponse: {},
        },
      };
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
    }

    // Ensure cursor value was NOT overwritten with next value
    const cursor = await database.xeroSyncCursor.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        entity_type: "leave_records",
        organisation_id: tenantA.organisationId,
        xero_tenant_id: tenantA.xeroTenantId,
      },
    });
    expect(cursor?.cursor_value).toBe(modifiedCursor);
  });

  it("does not advance cursor in database when blanket failure occurs", async () => {
    await setupTenant(tenantA, "NZ");
    await setupPerson(tenantA);

    mockFetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      error: { code: "auth_error", message: "Token expired or invalid" },
      ok: false,
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }

    const cursor = await database.xeroSyncCursor.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        entity_type: "leave_records",
        organisation_id: tenantA.organisationId,
        xero_tenant_id: tenantA.xeroTenantId,
      },
    });
    expect(cursor).toBeNull();
  });
});

async function setupTenant(
  tenant: typeof tenantA | typeof tenantB,
  payrollRegion: "AU" | "NZ" | "UK" = "AU"
) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: payrollRegion === "UK" ? "GB" : payrollRegion,
      id: tenant.organisationId,
      name: `Test Org ${tenant.clerkOrgId}`,
    },
  });

  await database.xeroConnection.create({
    data: {
      access_token_encrypted: "encrypted-token",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 3_600_000),
      id: tenant.xeroConnectionId,
      organisation_id: tenant.organisationId,
      status: "active",
    },
  });

  await database.xeroTenant.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.xeroTenantId,
      organisation_id: tenant.organisationId,
      payroll_region: payrollRegion,
      tenant_name: "Xero Tenant",
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: `xero-${tenant.xeroTenantId}`,
    },
  });
}

async function setupPerson(tenant: typeof tenantA | typeof tenantB) {
  await database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      email: `${tenant.personId}@example.com`,
      employment_type: "employee",
      first_name: "Pat",
      id: tenant.personId,
      last_name: "Taylor",
      organisation_id: tenant.organisationId,
      source_person_key: tenant.xeroEmployeeId,
      source_system: "XERO",
      xero_employee_id: tenant.xeroEmployeeId,
    },
  });
}

async function setupFeed(tenant: typeof tenantA) {
  const feed = await database.feed.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: "50000000-0000-4000-8000-000000000010",
      name: "Team feed",
      organisation_id: tenant.organisationId,
      slug: "team-feed",
      status: "active",
    },
    select: { id: true },
  });
  await database.feedScope.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      feed_id: feed.id,
      organisation_id: tenant.organisationId,
      scope_type: "person",
      scope_value: tenant.personId,
    },
  });
}

async function createStaleRecord(tenant: typeof tenantA) {
  await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_status: "approved",
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: "stale",
      ends_at: new Date("2026-05-05T00:00:00.000Z"),
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: "annual_leave",
      source_remote_id: staleLeaveId(),
      source_type: "xero_leave",
      starts_at: new Date("2026-05-04T00:00:00.000Z"),
    },
  });
}

async function createExistingRecord(
  tenant: typeof tenantA,
  input: {
    approvalNote?: string;
    approvalStatus: "approved" | "xero_sync_failed";
    failedAction?: "withdraw";
    sourceLastModifiedAt?: Date;
    sourceRemoteHash?: string;
    sourceRemoteId: string;
    sourceType: "team_calendar_leave" | "xero_leave";
  }
) {
  return await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_note: input.approvalNote ?? null,
      approval_status: input.approvalStatus,
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: `existing-${input.sourceRemoteId}`,
      ends_at: new Date("2026-05-08T00:00:00.000Z"),
      failed_action: input.failedAction ?? null,
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: "annual_leave",
      source_last_modified_at: input.sourceLastModifiedAt ?? null,
      source_remote_hash: input.sourceRemoteHash ?? null,
      source_remote_id: input.sourceRemoteId,
      source_type: input.sourceType,
      starts_at: new Date("2026-05-07T00:00:00.000Z"),
      title: "Previous title",
    },
  });
}

async function cleanTestData() {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.failedRecord.deleteMany({ where: scope });
  await database.xeroSyncCursor.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.availabilityPublication.deleteMany({ where: scope });
  await database.availabilityRecord.deleteMany({ where: scope });
  await database.feedScope.deleteMany({ where: scope });
  await database.feed.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
}

function syncInput(tenant: typeof tenantA) {
  return {
    clerkOrgId: tenant.clerkOrgId,
    organisationId: tenant.organisationId,
    triggerType: "manual" as const,
    xeroTenantId: tenant.xeroTenantId,
  };
}

function xeroLeaveRecord(tenant: typeof tenantA) {
  return {
    employeeId: tenant.xeroEmployeeId,
    endDate: "2026-05-08",
    leaveApplicationId: leaveId(),
    leaveTypeId: "annual",
    leaveTypeName: "Annual Leave",
    rawPayload: {
      LeaveApplicationID: leaveId(),
      LeaveType: "Annual Leave",
    },
    startDate: "2026-05-07",
    status: "APPROVED" as const,
    title: "Annual leave",
    units: 15.2,
    updatedDateUtc: "2026-05-01T01:02:03.000Z",
  };
}

function leaveId() {
  return "50000000-0000-4000-8000-000000000006";
}

function staleLeaveId() {
  return "50000000-0000-4000-8000-000000000009";
}

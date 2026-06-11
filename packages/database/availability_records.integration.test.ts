// biome-ignore-all lint/style/useFilenamingConvention: The requested test file is availability_records.integration.test.ts.
import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

config({ path: new URL("./.env", import.meta.url).pathname });
vi.mock("server-only", () => ({}));

const {
  availability_approval_status,
  availability_contactability,
  availability_privacy_mode,
  availability_publish_status,
  availability_record_type,
  availability_source_type,
  database,
  employment_type,
  source_system,
} = await import("./index.js");

const tenantA = {
  clerkOrgId: "org_test_availability_a",
  organisationId: "10000000-0000-4000-8000-000000000001",
  teamId: "10000000-0000-4000-8000-000000000002",
  locationId: "10000000-0000-4000-8000-000000000003",
  personId: "10000000-0000-4000-8000-000000000004",
} as const;

const tenantB = {
  clerkOrgId: "org_test_availability_b",
  organisationId: "20000000-0000-4000-8000-000000000001",
  teamId: "20000000-0000-4000-8000-000000000002",
  locationId: "20000000-0000-4000-8000-000000000003",
  personId: "20000000-0000-4000-8000-000000000004",
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

interface Tenant {
  clerkOrgId: string;
  locationId: string;
  organisationId: string;
  personId: string;
  teamId: string;
}

const availabilityRecordIds = {
  scoped: "30000000-0000-4000-8000-000000000001",
  otherTenant: "30000000-0000-4000-8000-000000000002",
  xeroOriginal: "30000000-0000-4000-8000-000000000003",
  xeroDuplicate: "30000000-0000-4000-8000-000000000004",
  manualOriginal: "30000000-0000-4000-8000-000000000005",
  manualDuplicate: "30000000-0000-4000-8000-000000000006",
} as const;

const createTenant = async (tenant: Tenant) => {
  await database.organisation.create({
    data: {
      id: tenant.organisationId,
      clerk_org_id: tenant.clerkOrgId,
      name: `Test ${tenant.clerkOrgId}`,
      country_code: "AU",
    },
  });

  await database.team.create({
    data: {
      id: tenant.teamId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      name: "Operations",
    },
  });

  await database.location.create({
    data: {
      id: tenant.locationId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      name: "Brisbane",
      region_code: "QLD",
    },
  });

  await database.person.create({
    data: {
      id: tenant.personId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      team_id: tenant.teamId,
      location_id: tenant.locationId,
      source_system: source_system.MANUAL,
      source_person_key: null,
      first_name: "Test",
      last_name: "Person",
      email: `${tenant.clerkOrgId}@example.com`,
      employment_type: employment_type.employee,
      is_active: true,
    },
  });
};

const createAvailabilityRecord = async ({
  id,
  tenant,
  sourceRemoteId = null,
  sourceType = availability_source_type.manual,
}: {
  id: string;
  tenant: Tenant;
  sourceRemoteId?: null | string;
  sourceType?:
    | typeof availability_source_type.manual
    | typeof availability_source_type.xero;
}) =>
  database.availabilityRecord.create({
    data: {
      id,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      record_type: availability_record_type.leave,
      source_type: sourceType,
      source_remote_id: sourceRemoteId,
      starts_at: new Date("2026-05-01T00:00:00.000Z"),
      ends_at: new Date("2026-05-02T00:00:00.000Z"),
      approval_status: availability_approval_status.approved,
      privacy_mode: availability_privacy_mode.named,
      contactability: availability_contactability.contactable,
      include_in_feed: true,
      publish_status: availability_publish_status.eligible,
      derived_uid_key: `test:${id}`,
    },
  });

const cleanTestData = async () => {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.failedRecord.deleteMany({ where: scope });
  await database.availabilityPublication.deleteMany({ where: scope });
  await database.auditEvent.deleteMany({ where: scope });
  await database.availabilityRecord.deleteMany({ where: scope });
  await database.leaveBalance.deleteMany({ where: scope });
  await database.alternativeContact.deleteMany({ where: scope });
  await database.notification.deleteMany({ where: scope });
  await database.notificationPreference.deleteMany({ where: scope });
  await database.xeroSyncCursor.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
  await database.publicHolidayAssignment.deleteMany({ where: scope });
  await database.publicHoliday.deleteMany({ where: scope });
  await database.publicHolidayJurisdiction.deleteMany({ where: scope });
  await database.feedToken.deleteMany({ where: scope });
  await database.feedScope.deleteMany({ where: scope });
  await database.feed.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.location.deleteMany({ where: scope });
  await database.team.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
};

const expectPrismaErrorCode = async (
  operation: Promise<unknown>,
  code: string
) => {
  let error: unknown;

  try {
    await operation;
  } catch (caught) {
    error = caught;
  }

  expect(error).toMatchObject({ code });
};

beforeEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("availability_records", () => {
  test("has expected foreign keys and indexes", async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname::text AS indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'availability_records'
    `;
    const indexNames = indexes.map(({ indexname }) => indexname);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "availability_records_clerk_org_id_idx",
        "availability_records_organisation_id_idx",
        "availability_records_person_id_starts_at_ends_at_idx",
        "availability_records_source_type_source_remote_id_idx",
        "availability_records_organisation_id_publish_status_include_idx",
        "availability_records_source_identity_key",
        "availability_records_source_type_source_last_modified_at_idx",
      ])
    );

    const foreignKeys = await database.$queryRaw<
      Array<{ constraint_name: string }>
    >`
      SELECT constraint_name::text AS constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'availability_records'
        AND constraint_type = 'FOREIGN KEY'
    `;
    const foreignKeyNames = foreignKeys.map(
      ({ constraint_name }) => constraint_name
    );

    expect(foreignKeyNames).toEqual(
      expect.arrayContaining([
        "availability_records_organisation_id_fkey",
        "availability_records_person_id_fkey",
      ])
    );
  });

  test("inserts scoped records", async () => {
    await createTenant(tenantA);

    const record = await createAvailabilityRecord({
      id: availabilityRecordIds.scoped,
      tenant: tenantA,
    });

    expect(record).toMatchObject({
      id: availabilityRecordIds.scoped,
      clerk_org_id: tenantA.clerkOrgId,
      organisation_id: tenantA.organisationId,
      person_id: tenantA.personId,
      source_type: availability_source_type.manual,
    });
  });

  test("rejects cross-org queries when tenant scope is applied", async () => {
    await createTenant(tenantA);
    await createTenant(tenantB);
    await createAvailabilityRecord({
      id: availabilityRecordIds.otherTenant,
      tenant: tenantB,
    });

    const crossOrgRecord = await database.availabilityRecord.findFirst({
      where: {
        id: availabilityRecordIds.otherTenant,
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
      },
    });
    const correctlyScopedRecord = await database.availabilityRecord.findFirst({
      where: {
        id: availabilityRecordIds.otherTenant,
        clerk_org_id: tenantB.clerkOrgId,
        organisation_id: tenantB.organisationId,
      },
    });

    expect(crossOrgRecord).toBeNull();
    expect(correctlyScopedRecord).toMatchObject({
      id: availabilityRecordIds.otherTenant,
      clerk_org_id: tenantB.clerkOrgId,
      organisation_id: tenantB.organisationId,
    });
  });

  test("validates uniqueness constraints", async () => {
    await createTenant(tenantA);
    await createAvailabilityRecord({
      id: availabilityRecordIds.xeroOriginal,
      tenant: tenantA,
      sourceRemoteId: "xero-leave-1",
      sourceType: availability_source_type.xero,
    });

    await expectPrismaErrorCode(
      createAvailabilityRecord({
        id: availabilityRecordIds.xeroDuplicate,
        tenant: tenantA,
        sourceRemoteId: "xero-leave-1",
        sourceType: availability_source_type.xero,
      }),
      "P2002"
    );

    await createAvailabilityRecord({
      id: availabilityRecordIds.manualOriginal,
      tenant: tenantA,
    });
    await expectPrismaErrorCode(
      createAvailabilityRecord({
        id: availabilityRecordIds.manualDuplicate,
        tenant: tenantA,
      }),
      "P2002"
    );
  });

  test("enforces foreign keys", async () => {
    await createTenant(tenantA);

    await expectPrismaErrorCode(
      database.availabilityRecord.create({
        data: {
          id: availabilityRecordIds.scoped,
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
          person_id: tenantB.personId,
          record_type: availability_record_type.leave,
          source_type: availability_source_type.manual,
          source_remote_id: null,
          starts_at: new Date("2026-05-01T00:00:00.000Z"),
          ends_at: new Date("2026-05-02T00:00:00.000Z"),
          approval_status: availability_approval_status.approved,
          privacy_mode: availability_privacy_mode.named,
          contactability: availability_contactability.contactable,
          include_in_feed: true,
          publish_status: availability_publish_status.eligible,
          derived_uid_key: "test:missing-person",
        },
      }),
      "P2003"
    );
  });
});

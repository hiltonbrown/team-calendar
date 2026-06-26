import { icsUidSuffix } from "@repo/seo/branding";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auditCreate = vi.fn();
  const availabilityCreate = vi.fn(async ({ data }) => ({
    ...data,
    archived_at: null,
    approval_note: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    person: personFixture,
    source_remote_id: null,
    submitted_at: null,
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    xero_write_error: null,
  }));
  const personFixture = {
    email: "person@example.com",
    first_name: "Test",
    id: "00000000-0000-4000-8000-000000000011",
    last_name: "Person",
    location_id: null,
    manager_person_id: null,
  };

  return {
    auditCreate,
    availabilityCreate,
    hasActiveXeroConnection: vi.fn(),
    materialiseAvailabilityPublication: vi.fn(() =>
      Promise.resolve({ ok: true, value: undefined })
    ),
    personFindFirst: vi.fn(),
    scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
      clerk_org_id: clerkOrgId,
      organisation_id: organisationId,
    })),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        auditEvent: { create: mocks.auditCreate },
        availabilityRecord: { create: mocks.availabilityCreate },
      }),
    person: { findFirst: mocks.personFindFirst },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("../xero-connection-state", () => ({
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
}));
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));

const { createRecord } = await import("./plan-service");

const baseInput = {
  actingOrgRole: "org:viewer",
  allDay: true,
  clerkOrgId: "org_1",
  contactabilityStatus: "contactable",
  createdByUserId: "user_1",
  endsAt: new Date("2026-05-05T00:00:00.000Z"),
  notesInternal: "Test note",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000011",
  privacyMode: "named",
  startsAt: new Date("2026-05-04T00:00:00.000Z"),
} as const;

describe("plan-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue({
      email: "person@example.com",
      first_name: "Test",
      id: baseInput.personId,
      last_name: "Person",
      location_id: null,
      manager_person_id: null,
    });
  });

  it.each([
    ["wfh", true, "manual", "approved"],
    ["wfh", false, "manual", "approved"],
    ["training", true, "manual", "approved"],
    ["annual_leave", true, "team_calendar_leave", "draft"],
    ["annual_leave", false, "team_calendar_leave", "approved"],
    ["sick_leave", true, "team_calendar_leave", "draft"],
  ] as const)("routes %s with Xero %s to %s and %s", async (recordType, hasXero, sourceType, approvalStatus) => {
    mocks.hasActiveXeroConnection.mockResolvedValue(hasXero);

    const result = await createRecord({ ...baseInput, recordType });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      approvalStatus,
      derivedSequence: 0,
      personId: baseInput.personId,
      recordType,
      sourceType,
    });
    expect(result.value.derivedUidKey).toContain(icsUidSuffix);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "availability_records.created",
          payload: expect.objectContaining({
            approvalStatus,
            sourceType,
          }),
        }),
      })
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  deriveXeroStableSourceKey,
  normaliseInboundLeaveRecord,
  recordTypeFromLeaveType,
} from "./inbound-leave-normaliser";

const ICAL_UID_SUFFIX_REGEX = /@ical\.leavesync\.app$/;

describe("inbound leave normaliser", () => {
  it.each([
    ["Annual Leave", "annual_leave"],
    ["Personal/Carer's Leave", "personal_leave"],
    ["Sick Leave", "sick_leave"],
    ["Long Service Leave", "long_service_leave"],
    ["Unpaid Leave", "unpaid_leave"],
    ["Public Holiday", "holiday"],
    [null, "leave"],
  ] as const)("maps leave type name %s to record type %s", (leaveTypeName, expectedRecordType) => {
    expect(recordTypeFromLeaveType(leaveTypeName)).toBe(expectedRecordType);
  });

  it("derives canonical Xero availability record fields", () => {
    const startsAt = new Date("2026-05-07T00:00:00.000Z");
    const endsAt = new Date("2026-05-08T00:00:00.000Z");
    const stableSourceKey = deriveXeroStableSourceKey({
      employeeId: "11111111-1111-4111-8111-111111111111",
      endsAt,
      leaveTypeId: "annual",
      startsAt,
      units: 15.2,
      xeroTenantId: "30000000-0000-4000-8000-000000000003",
    });

    const normalised = normaliseInboundLeaveRecord({
      approvalStatus: "approved",
      clerkOrgId: "org_1",
      endsAt,
      leaveTypeId: "annual",
      leaveTypeName: "Annual Leave",
      organisationId: "30000000-0000-4000-8000-000000000001",
      personId: "40000000-0000-4000-8000-000000000001",
      provider: "xero",
      rawPayload: { b: 2, a: 1 },
      sourceLastModifiedAt: new Date("2026-05-01T01:02:03.000Z"),
      sourceRemoteId: "22222222-2222-4222-8222-222222222222",
      stableSourceKey,
      startsAt,
      title: "Annual leave",
      units: 15.2,
    });

    expect(stableSourceKey).toBe(
      "30000000-0000-4000-8000-000000000003|11111111-1111-4111-8111-111111111111|annual|2026-05-07T00:00:00.000Z|2026-05-08T00:00:00.000Z|15.2000"
    );
    expect(normalised).toMatchObject({
      approvalStatus: "approved",
      contactability: "unavailable",
      includeInFeed: true,
      publishStatus: "eligible",
      recordType: "annual_leave",
      sourceRemoteId: "22222222-2222-4222-8222-222222222222",
      sourceType: "xero_leave",
      title: "Annual leave",
    });
    expect(normalised.derivedUidKey).toMatch(ICAL_UID_SUFFIX_REGEX);
    expect(normalised.sourceRemoteHash).toHaveLength(64);
  });

  it("keeps hash generation stable when raw payload key order changes", () => {
    const base = {
      approvalStatus: "submitted" as const,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      leaveTypeId: "personal",
      leaveTypeName: "Personal Leave",
      organisationId: "30000000-0000-4000-8000-000000000001",
      personId: "40000000-0000-4000-8000-000000000001",
      provider: "xero" as const,
      sourceLastModifiedAt: null,
      sourceRemoteId: "22222222-2222-4222-8222-222222222222",
      stableSourceKey: "stable",
      startsAt: new Date("2026-05-07T00:00:00.000Z"),
      title: null,
      units: 1,
    };

    const first = normaliseInboundLeaveRecord({
      ...base,
      rawPayload: { b: 2, a: 1 },
    });
    const second = normaliseInboundLeaveRecord({
      ...base,
      rawPayload: { a: 1, b: 2 },
    });

    expect(first.sourceRemoteHash).toBe(second.sourceRemoteHash);
  });
});

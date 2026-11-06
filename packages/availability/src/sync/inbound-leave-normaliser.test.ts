import { describe, expect, it } from "vitest";
import { normaliseInboundLeaveRecord } from "./inbound-leave-normaliser";

const ICAL_UID_SUFFIX_REGEX = /@ical\.teamcalendar\.online$/;

describe("inbound leave normaliser", () => {
  it("derives canonical Xero availability record fields", () => {
    const startsAt = new Date("2026-05-07T00:00:00.000Z");
    const endsAt = new Date("2026-05-08T00:00:00.000Z");
    const stableSourceKey = "xero-stable-source-key";

    const normalised = normaliseInboundLeaveRecord({
      accountId: "org_1",
      approvalStatus: "approved",
      endsAt,
      organisationId: "30000000-0000-4000-8000-000000000001",
      personId: "40000000-0000-4000-8000-000000000001",
      rawPayload: { a: 1, b: 2 },
      recordType: "annual_leave",
      sourceLastModifiedAt: new Date("2026-05-01T01:02:03.000Z"),
      sourceRemoteId: "22222222-2222-4222-8222-222222222222",
      sourceType: "xero_leave",
      stableSourceKey,
      startsAt,
      title: "Annual leave",
      units: 15.2,
    });

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
      accountId: "org_1",
      approvalStatus: "submitted" as const,
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      organisationId: "30000000-0000-4000-8000-000000000001",
      personId: "40000000-0000-4000-8000-000000000001",
      recordType: "personal_leave" as const,
      sourceLastModifiedAt: null,
      sourceRemoteId: "22222222-2222-4222-8222-222222222222",
      sourceType: "xero_leave" as const,
      stableSourceKey: "stable",
      startsAt: new Date("2026-05-07T00:00:00.000Z"),
      title: null,
      units: 1,
    };

    const first = normaliseInboundLeaveRecord({
      ...base,
      rawPayload: { a: 1, b: 2 },
    });
    const second = normaliseInboundLeaveRecord({
      ...base,
      rawPayload: Object.fromEntries([
        ["b", 2],
        ["a", 1],
      ]),
    });

    expect(first.sourceRemoteHash).toBe(second.sourceRemoteHash);
  });
});

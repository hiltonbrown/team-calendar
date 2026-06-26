import { createHash } from "node:crypto";
import { icsUidSuffix } from "@repo/seo/branding";
import { describe, expect, it } from "vitest";
import { deriveAvailabilityUidKey } from "./availability-uid";

const baseInput = {
  clerkOrgId: "org_uid",
  endsAt: new Date("2026-05-08T00:00:00.000Z"),
  organisationId: "30000000-0000-4000-8000-000000000001",
  personId: "40000000-0000-4000-8000-000000000001",
  recordType: "annual_leave" as const,
  sourceType: "manual" as const,
  stableSourceKey: "50000000-0000-4000-8000-000000000001",
  startsAt: new Date("2026-05-07T00:00:00.000Z"),
};

describe("deriveAvailabilityUidKey", () => {
  it("matches the PRODUCT UID formula exactly", () => {
    const formula = [
      baseInput.clerkOrgId,
      baseInput.organisationId,
      baseInput.personId,
      baseInput.sourceType,
      baseInput.stableSourceKey,
      baseInput.startsAt.toISOString(),
      baseInput.endsAt.toISOString(),
      baseInput.recordType,
    ].join("|");
    const expected = `${createHash("sha256").update(formula).digest("hex")}${icsUidSuffix}`;

    expect(deriveAvailabilityUidKey(baseInput)).toBe(expected);
  });

  it("differs by person, source identity, and window", () => {
    const base = deriveAvailabilityUidKey(baseInput);

    expect(
      deriveAvailabilityUidKey({
        ...baseInput,
        personId: "40000000-0000-4000-8000-000000000002",
      })
    ).not.toBe(base);
    expect(
      deriveAvailabilityUidKey({
        ...baseInput,
        stableSourceKey: "50000000-0000-4000-8000-000000000002",
      })
    ).not.toBe(base);
    expect(
      deriveAvailabilityUidKey({
        ...baseInput,
        endsAt: new Date("2026-05-09T00:00:00.000Z"),
      })
    ).not.toBe(base);
  });
});

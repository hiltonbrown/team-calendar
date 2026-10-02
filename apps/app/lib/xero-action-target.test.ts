import { describe, expect, it } from "vitest";
import { PlanRecordFormSchema } from "@/app/(authenticated)/plans/_schemas";
import { xeroActionTarget } from "./xero-action-target";

describe("validated action targets", () => {
  it("uses validated string dates and defaults, omitting absent optional form fields", () => {
    const parsed = PlanRecordFormSchema.parse({
      endsAt: "2026-10-04",
      notesInternal: undefined,
      organisationId: "00000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000002",
      recordType: "annual_leave",
      startsAt: "2026-10-03",
    });
    expect(xeroActionTarget(parsed)).toEqual({
      allDay: true,
      contactabilityStatus: "contactable",
      endsAt: "2026-10-04",
      organisationId: parsed.organisationId,
      personId: parsed.personId,
      privacyMode: "named",
      recordType: "annual_leave",
      startsAt: "2026-10-03",
    });
  });
  it.each([new Date(), { date: new Date() }, [undefined], { n: Number.NaN }])(
    "rejects non-JSON values instead of silently changing the target",
    (value) => {
      expect(() => xeroActionTarget(value)).toThrow();
    }
  );
});

import { describe, expect, it } from "vitest";
import { mapLeaveApplicationStatus } from "./leave-application-status";

describe("mapLeaveApplicationStatus", () => {
  it.each([
    ["APPROVED", "APPROVED"],
    ["SCHEDULED", "APPROVED"],
    ["REJECTED", "REJECTED"],
    ["DECLINED", "REJECTED"],
    ["WITHDRAWN", "WITHDRAWN"],
    ["DELETED", "DELETED"],
    ["SUBMITTED", "SUBMITTED"],
    ["PENDING", "SUBMITTED"],
  ] as const)("maps %s to %s", (xeroStatus, expectedStatus) => {
    const result = mapLeaveApplicationStatus({ Status: xeroStatus });

    expect(result.status).toBe(expectedStatus);
  });

  it("reads status from the first supported key in fallback order", () => {
    const result = mapLeaveApplicationStatus({
      LeaveApplicationStatus: "DECLINED",
      LeavePeriodStatus: "PENDING",
      Status: "SCHEDULED",
      status: "WITHDRAWN",
    });

    expect(result.status).toBe("APPROVED");
  });

  it("falls back across supported status key casing variants", () => {
    expect(
      mapLeaveApplicationStatus({ leaveApplicationStatus: "PENDING" }).status
    ).toBe("SUBMITTED");
    expect(
      mapLeaveApplicationStatus({ LeavePeriodStatus: "DECLINED" }).status
    ).toBe("REJECTED");
    expect(
      mapLeaveApplicationStatus({ leavePeriodStatus: "SCHEDULED" }).status
    ).toBe("APPROVED");
  });

  it("maps unknown and empty statuses to UNKNOWN", () => {
    expect(mapLeaveApplicationStatus({ Status: "NOT_A_STATUS" }).status).toBe(
      "UNKNOWN"
    );
    expect(mapLeaveApplicationStatus({ Status: "   " }).status).toBe("UNKNOWN");
    expect(mapLeaveApplicationStatus({}).status).toBe("UNKNOWN");
  });

  it("parses approved dates from the supported keys", () => {
    expect(
      mapLeaveApplicationStatus({
        ApprovedDate: "2026-05-01T01:02:03.000Z",
      }).approvedAt
    ).toEqual(new Date("2026-05-01T01:02:03.000Z"));
    expect(
      mapLeaveApplicationStatus({
        approvedDate: "2026-05-02T01:02:03.000Z",
      }).approvedAt
    ).toEqual(new Date("2026-05-02T01:02:03.000Z"));
    expect(
      mapLeaveApplicationStatus({
        UpdatedDateUTC: "2026-05-03T01:02:03.000Z",
      }).approvedAt
    ).toEqual(new Date("2026-05-03T01:02:03.000Z"));
    expect(
      mapLeaveApplicationStatus({
        updatedDateUTC: "2026-05-04T01:02:03.000Z",
      }).approvedAt
    ).toEqual(new Date("2026-05-04T01:02:03.000Z"));
  });

  it("returns null approvedAt for unparseable dates", () => {
    const result = mapLeaveApplicationStatus({
      ApprovedDate: "not a date",
      Status: "APPROVED",
    });

    expect(result.approvedAt).toBeNull();
    expect(result.status).toBe("APPROVED");
  });

  it("reads the first leave application from wrapped Xero responses", () => {
    const payload = {
      LeaveApplications: [
        {
          ApprovedDate: "2026-05-01T01:02:03.000Z",
          Status: "PENDING",
        },
      ],
    };

    const result = mapLeaveApplicationStatus(payload);

    expect(result).toEqual({
      approvedAt: new Date("2026-05-01T01:02:03.000Z"),
      rawResponse: payload,
      status: "SUBMITTED",
    });
  });
});

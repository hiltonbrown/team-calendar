import { describe, expect, it } from "vitest";
import { mapLeaveApplicationStatus } from "./leave-application-status";

describe("mapLeaveApplicationStatus", () => {
  it.each([
    ["APPROVED", "APPROVED"],
    ["SCHEDULED", "APPROVED"],
    ["PROCESSED", "APPROVED"],
    ["REJECTED", "REJECTED"],
    ["DECLINED", "REJECTED"],
    ["WITHDRAWN", "WITHDRAWN"],
    ["DELETED", "DELETED"],
    ["SUBMITTED", "SUBMITTED"],
    ["PENDING", "SUBMITTED"],
    ["REQUESTED", "SUBMITTED"],
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
  it("maps an AU v2 period status and .NET updated date", () => {
    const payload = {
      LeaveApplications: [
        {
          LeavePeriods: [
            {
              LeavePeriodStatus: "REQUESTED",
            },
          ],
          UpdatedDateUTC: "/Date(1785546245000+0000)/",
        },
      ],
    };
    expect(mapLeaveApplicationStatus(payload)).toEqual({
      approvedAt: new Date("2026-08-01T01:04:05.000Z"),
      rawResponse: payload,
      status: "SUBMITTED",
    });
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
  it("reads status from nested periods array in v2 employee leave shapes", () => {
    const payload = {
      leave: [
        {
          leaveID: "leave-1",
          periods: [
            {
              numberOfUnits: 8,
              periodEndDate: "2026-06-01",
              periodStartDate: "2026-06-01",
              periodStatus: "Completed",
            },
          ],
          updatedDateUTC: "2026-06-02T03:04:05.000Z",
        },
      ],
    };
    const result = mapLeaveApplicationStatus(payload);
    expect(result).toEqual({
      approvedAt: new Date("2026-06-02T03:04:05.000Z"),
      rawResponse: payload,
      status: "APPROVED",
    });
  });
  it("maps Estimated period status to APPROVED", () => {
    const payload = {
      leaveID: "leave-2",
      periods: [
        {
          periodStatus: "Estimated",
        },
      ],
    };
    expect(mapLeaveApplicationStatus(payload).status).toBe("APPROVED");
  });
});
describe("mapXeroReadHttpError", () => {
  it("maps 401 to auth_error and 403 to permission_error", async () => {
    const { mapXeroReadHttpError } = await import("./leave-application-status");
    const authRes = new Response(JSON.stringify({ Message: "Unauthorized" }), {
      status: 401,
      statusText: "Unauthorized",
    });
    expect(
      mapXeroReadHttpError(authRes, { Message: "Unauthorized" })
    ).toMatchObject({
      code: "auth_error",
      httpStatus: 401,
    });
    const permRes = new Response(JSON.stringify({ Message: "Forbidden" }), {
      status: 403,
      statusText: "Forbidden",
    });
    expect(
      mapXeroReadHttpError(permRes, { Message: "Forbidden" })
    ).toMatchObject({
      code: "permission_error",
      httpStatus: 403,
    });
  });
  it("maps 400, 404, 409, 429, and 500", async () => {
    const { mapXeroReadHttpError } = await import("./leave-application-status");
    expect(
      mapXeroReadHttpError(new Response("", { status: 400 }), {}).code
    ).toBe("validation_error");
    expect(
      mapXeroReadHttpError(new Response("", { status: 404 }), {}).code
    ).toBe("not_found_error");
    expect(
      mapXeroReadHttpError(new Response("", { status: 409 }), {}).code
    ).toBe("conflict_error");
    expect(
      mapXeroReadHttpError(new Response("", { status: 429 }), {}).code
    ).toBe("rate_limit_error");
    expect(
      mapXeroReadHttpError(new Response("", { status: 500 }), {}).code
    ).toBe("network_error");
  });
});

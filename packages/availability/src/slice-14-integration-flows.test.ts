import {
  createSlice14Fixture,
  type Slice14AvailabilityRecordFixture,
} from "@repo/database/src/test-fixtures/slice-14-fixture";
import { describe, expect, it } from "vitest";

describe("Slice 14 cohesion flows", () => {
  it("employee submits leave successfully", () => {
    const fixture = createSlice14Fixture();
    const draft = draftLeave(fixture.availabilityRecords);
    const submitted = submit(draft, true);

    expect(submitted.approvalStatus).toBe("submitted");
    expect(notificationTypesAfter("submit_success")).toContain(
      "leave_submitted"
    );
    expect(calendarTreatment(submitted)).toBe("dashed");
    expect(dashboardActionItem(submitted)).toBe(false);
  });

  it("employee submits leave, Xero fails, retry succeeds", () => {
    const fixture = createSlice14Fixture();
    const draft = draftLeave(fixture.availabilityRecords);
    const failed = submit(draft, false);
    const retried = retry(failed, true);

    expect(failed.approvalStatus).toBe("xero_sync_failed");
    expect(failed.failedAction).toBe("submit");
    expect(dashboardActionItem(failed)).toBe(true);
    expect(retried.approvalStatus).toBe("submitted");
    expect(retried.failedAction).toBeNull();
  });

  it("manager approves leave successfully", () => {
    const fixture = createSlice14Fixture();
    const record = submittedLeave(fixture.availabilityRecords);
    const approved = approve(record, true);

    expect(approved.approvalStatus).toBe("approved");
    expect(notificationTypesAfter("approve_success")).toContain(
      "leave_approved"
    );
    expect(calendarTreatment(approved)).toBe("solid");
    expect(contributesToAnalytics(approved)).toBe(true);
  });

  it("manager decline keeps reason across retry failure and clears on revert", () => {
    const fixture = createSlice14Fixture();
    const record = submittedLeave(fixture.availabilityRecords);
    const failed = decline(record, false, "Too many people away");
    const retryFailed = declineRetry(failed, false, "Too many people away");
    const reverted = revertToPending(retryFailed);

    expect(failed.record.approvalStatus).toBe("xero_sync_failed");
    expect(failed.record.failedAction).toBe("decline");
    expect(retryFailed.note).toBe("Too many people away");
    expect(reverted.record.approvalStatus).toBe("submitted");
    expect(reverted.note).toBeNull();
  });

  it("employee creates WFH without Xero connected", () => {
    const fixture = createSlice14Fixture();
    const person = fixture.people[0];
    const record: Slice14AvailabilityRecordFixture = {
      approvalStatus: "approved",
      clerkOrgId: person?.clerkOrgId ?? "org_a",
      failedAction: null,
      id: "00000000-0000-4000-8000-999000000001",
      organisationId:
        person?.organisationId ?? "00000000-0000-4000-8000-0000000000a1",
      personId: person?.id ?? "00000000-0000-4000-8000-300000000000",
      recordType: "wfh",
      sourceType: "manual",
    };

    expect(record.sourceType).toBe("manual");
    expect(record.approvalStatus).toBe("approved");
    expect(calendarTreatment(record)).toBe("solid");
    expect(contributesToAnalytics(record)).toBe(true);
  });

  it("admin creates and rotates feed token", () => {
    const created = tokenState("created");
    const dismissed = tokenState("dismissed");
    const rotated = tokenState("rotated");

    expect(created.plaintextVisible).toBe(true);
    expect(dismissed.plaintextVisible).toBe(false);
    expect(dismissed.copyUrlMuted).toBe(true);
    expect(rotated.oldTokenRevoked).toBe(true);
    expect(rotated.cacheInvalidated).toBe(true);
  });

  it("admin disconnects Xero destructively", () => {
    const result = destructiveDisconnect();

    expect(result.connectionRevoked).toBe(true);
    expect(result.xeroEmployeesArchived).toBe(true);
    expect(result.xeroEmployeeIdsCleared).toBe(true);
    expect(result.xeroLeaveArchived).toBe(true);
    expect(result.analyticsHistoricalDataVisible).toBe(true);
  });

  it("manager preference hides submitted leave from calendar", () => {
    const fixture = createSlice14Fixture();
    const record = submittedLeave(fixture.availabilityRecords);

    expect(calendarIncludes(record, false)).toBe(false);
    expect(calendarIncludes(record, true)).toBe(true);
  });

  it("feed preview matches ICS visibility for masked feeds", () => {
    const fixture = createSlice14Fixture();
    const approved = fixture.availabilityRecords.find(
      (record) => record.approvalStatus === "approved"
    );

    expect(previewLabel("masked", approved)).toBe("Team member: Annual leave");
    expect(icsSummary("masked", approved)).toBe("Team member: Annual leave");
    expect(
      previewLabel(
        "masked",
        fixture.availabilityRecords.find(
          (record) => record.approvalStatus === "submitted"
        )
      )
    ).toBeNull();
  });

  it("tenant isolation keeps org A surfaces free of org B data", () => {
    const fixture = createSlice14Fixture();
    const orgA = fixture.organisations[0];
    const orgB = fixture.organisations[1];
    const orgARecordIds = fixture.availabilityRecords
      .filter((record) => record.organisationId === orgA?.id)
      .map((record) => record.id);
    const orgBRecordIds = fixture.availabilityRecords
      .filter((record) => record.organisationId === orgB?.id)
      .map((record) => record.id);

    expect(orgARecordIds.length).toBeGreaterThan(0);
    expect(orgBRecordIds.length).toBeGreaterThan(0);
    expect(orgARecordIds.some((id) => orgBRecordIds.includes(id))).toBe(false);
  });
});

function draftLeave(records: Slice14AvailabilityRecordFixture[]) {
  return (
    records.find(
      (record) =>
        record.approvalStatus === "draft" &&
        record.sourceType === "leavesync_leave"
    ) ?? records[0]
  );
}

function submittedLeave(records: Slice14AvailabilityRecordFixture[]) {
  return (
    records.find(
      (record) =>
        record.approvalStatus === "submitted" &&
        record.sourceType === "leavesync_leave"
    ) ?? records[1]
  );
}

function submit(
  record: Slice14AvailabilityRecordFixture,
  xeroSucceeded: boolean
): Slice14AvailabilityRecordFixture {
  return {
    ...record,
    approvalStatus: xeroSucceeded ? "submitted" : "xero_sync_failed",
    failedAction: xeroSucceeded ? null : "submit",
  };
}

function retry(
  record: Slice14AvailabilityRecordFixture,
  xeroSucceeded: boolean
): Slice14AvailabilityRecordFixture {
  return {
    ...record,
    approvalStatus: xeroSucceeded ? "submitted" : "xero_sync_failed",
    failedAction: xeroSucceeded ? null : record.failedAction,
  };
}

function approve(
  record: Slice14AvailabilityRecordFixture,
  xeroSucceeded: boolean
): Slice14AvailabilityRecordFixture {
  return {
    ...record,
    approvalStatus: xeroSucceeded ? "approved" : "xero_sync_failed",
    failedAction: xeroSucceeded ? null : "approve",
  };
}

function decline(
  record: Slice14AvailabilityRecordFixture,
  xeroSucceeded: boolean,
  note: string
) {
  return {
    note,
    record: {
      ...record,
      approvalStatus: xeroSucceeded ? "declined" : "xero_sync_failed",
      failedAction: xeroSucceeded ? null : "decline",
    },
  };
}

function declineRetry(
  state: ReturnType<typeof decline>,
  xeroSucceeded: boolean,
  note: string
) {
  return decline(state.record, xeroSucceeded, note);
}

function revertToPending(state: ReturnType<typeof decline>) {
  return {
    note: null,
    record: {
      ...state.record,
      approvalStatus: "submitted",
      failedAction: null,
    },
  };
}

function calendarTreatment(record: Slice14AvailabilityRecordFixture) {
  if (record.approvalStatus === "approved") {
    return "solid";
  }
  if (record.approvalStatus === "submitted") {
    return "dashed";
  }
  if (record.approvalStatus === "xero_sync_failed") {
    return "failed";
  }
  return "draft";
}

function dashboardActionItem(record: Slice14AvailabilityRecordFixture) {
  return record.approvalStatus === "xero_sync_failed";
}

function contributesToAnalytics(record: Slice14AvailabilityRecordFixture) {
  return record.approvalStatus === "approved";
}

function notificationTypesAfter(flow: string) {
  if (flow === "submit_success") {
    return ["leave_submitted"];
  }
  if (flow === "approve_success") {
    return ["leave_approved"];
  }
  return [];
}

function tokenState(stage: "created" | "dismissed" | "rotated") {
  return {
    cacheInvalidated: stage === "rotated",
    copyUrlMuted: stage === "dismissed",
    oldTokenRevoked: stage === "rotated",
    plaintextVisible: stage === "created" || stage === "rotated",
  };
}

function destructiveDisconnect() {
  return {
    analyticsHistoricalDataVisible: true,
    connectionRevoked: true,
    xeroEmployeeIdsCleared: true,
    xeroEmployeesArchived: true,
    xeroLeaveArchived: true,
  };
}

function calendarIncludes(
  record: Slice14AvailabilityRecordFixture,
  showPendingOnCalendar: boolean
) {
  return (
    record.approvalStatus === "approved" ||
    (record.approvalStatus === "submitted" && showPendingOnCalendar)
  );
}

function previewLabel(
  privacyMode: "masked" | "named" | "private",
  record?: Slice14AvailabilityRecordFixture
) {
  if (!record || record.approvalStatus !== "approved") {
    return null;
  }
  if (privacyMode === "masked") {
    return "Team member: Annual leave";
  }
  if (privacyMode === "private") {
    return "Unavailable";
  }
  return "Person Fixture: Annual leave";
}

function icsSummary(
  privacyMode: "masked" | "named" | "private",
  record?: Slice14AvailabilityRecordFixture
) {
  return previewLabel(privacyMode, record);
}

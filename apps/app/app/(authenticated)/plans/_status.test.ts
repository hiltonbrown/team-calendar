import { describe, expect, it } from "vitest";
import { planStatusForRecord } from "./_status";

describe("plans status vocabulary", () => {
  it.each([
    ["draft", null, "draft", "Draft"],
    ["submitted", null, "pending", "Pending"],
    ["approved", null, "approved", "Approved"],
    ["declined", null, "declined", "Declined"],
    ["withdrawn", null, "withdrawn", "Withdrawn"],
    ["xero_sync_failed", null, "xero_sync_failed", "Xero sync failed"],
    ["approved", "2026-05-10T00:00:00.000Z", "archived", "Archived"],
  ])("maps %s to %s", (approvalStatus, archivedAt, tone, label) => {
    expect(
      planStatusForRecord({
        approvalStatus,
        archivedAt,
      })
    ).toMatchObject({
      label,
      tone,
    });
  });
});

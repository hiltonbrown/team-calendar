import {
  AVAILABILITY_RECORD_TYPE_LABELS,
  getAvailabilityRecordLabel,
} from "@repo/core";
import { availability_record_type } from "@repo/database/generated/enums";
import { describe, expect, it } from "vitest";
import { recordTypeIcon } from "./record-type-icons";

const recordTypes = Object.values(availability_record_type);

describe("recordTypeIcon", () => {
  it.each([
    ["annual_leave", "xero", "xero"],
    ["annual_leave", "leave_request", "leave_request"],
    ["sick_leave", "manual", "other"],
    ["public_holiday", "xero", "xero"],
    ["public_holiday", "manual", "other"],
    ["wfh", "manual", "home"],
    ["client_site", "manual", "client"],
    ["another_office", "manual", "client"],
    ["offsite_meeting", "manual", "client"],
    ["training", "manual", "training"],
    ["travel", "manual", "travel"],
    ["travelling", "xero", "travel"],
    ["contractor_unavailable", "manual", "other"],
    ["other", "manual", "other"],
    ["private", "xero", "private"],
    ["unknown_type", "manual", "other"],
  ] as const)("maps %s from %s to %s", (recordType, provenance, icon) => {
    expect(recordTypeIcon(recordType, provenance)).toBe(icon);
  });

  it("has an icon and a sentence-case label for every record type", () => {
    for (const recordType of recordTypes) {
      expect(recordTypeIcon(recordType, "manual")).toBeTruthy();
      const label = AVAILABILITY_RECORD_TYPE_LABELS[recordType];
      expect(label).toBeTruthy();
      expect(getAvailabilityRecordLabel(recordType)).toBe(label);
      expect(label.slice(1)).toBe(label.slice(1).toLowerCase());
    }
  });

  it("labels working from home in full", () => {
    expect(getAvailabilityRecordLabel("wfh")).toBe("Working from home");
  });
});

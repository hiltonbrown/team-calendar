import type { availability_record_type } from "@repo/database/generated/enums";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isLegacyRecordType,
  isLocalOnlyType,
  isSystemRecordType,
  isUserCreatableRecordType,
  isXeroLeaveType,
  LOCAL_ONLY_TYPES,
  SYSTEM_RECORD_TYPES,
  sourceTypesForCategory,
  XERO_LEAVE_TYPES,
} from "./record-type-categories";

describe("record type categories", () => {
  it("classifies Xero leave types", () => {
    for (const recordType of XERO_LEAVE_TYPES) {
      expect(isXeroLeaveType(recordType)).toBe(true);
      expect(isLocalOnlyType(recordType)).toBe(false);
      expect(isUserCreatableRecordType(recordType)).toBe(true);
    }
  });

  it("classifies local-only types", () => {
    for (const recordType of LOCAL_ONLY_TYPES) {
      expect(isLocalOnlyType(recordType)).toBe(true);
      expect(isXeroLeaveType(recordType)).toBe(false);
      expect(isUserCreatableRecordType(recordType)).toBe(true);
    }
  });

  it("marks public holidays as system sourced", () => {
    expect(SYSTEM_RECORD_TYPES).toEqual(["public_holiday"]);
    expect(isSystemRecordType("public_holiday")).toBe(true);
    expect(isUserCreatableRecordType("public_holiday")).toBe(false);
  });

  it("marks legacy enum values as non-creatable", () => {
    for (const recordType of ["leave", "travel", "leave_request"] as const) {
      expect(isLegacyRecordType(recordType)).toBe(true);
      expect(isUserCreatableRecordType(recordType)).toBe(false);
    }
  });

  it("keeps the exhaustiveness check tied to the generated enum", () => {
    expectTypeOf<availability_record_type>().toEqualTypeOf<
      | "leave"
      | "annual_leave"
      | "personal_leave"
      | "holiday"
      | "sick_leave"
      | "long_service_leave"
      | "unpaid_leave"
      | "public_holiday"
      | "wfh"
      | "travel"
      | "travelling"
      | "training"
      | "client_site"
      | "another_office"
      | "offsite_meeting"
      | "contractor_unavailable"
      | "limited_availability"
      | "alternative_contact"
      | "other"
      | "leave_request"
    >();
  });

  it("maps calendar category filters to source types", () => {
    expect(sourceTypesForCategory("xero_leave")).toEqual([
      "xero_leave",
      "team_calendar_leave",
    ]);
    expect(sourceTypesForCategory("local_only")).toEqual(["manual"]);
    expect(sourceTypesForCategory("all")).toEqual([
      "xero_leave",
      "team_calendar_leave",
      "manual",
    ]);
  });
});

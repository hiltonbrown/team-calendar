import { describe, expect, it } from "vitest";
import { xeroRecoveryMessageFromCode } from "./xero-recovery";

describe("xeroRecoveryMessageFromCode", () => {
  it.each([
    ["update_permissions", "Update Xero permissions to continue."],
    ["retry_later", "Xero is temporarily unavailable. Try again later."],
    [
      "operational_incident",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    [
      "state_unavailable",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    ["reauthorisation_required", "Xero access needs to be renewed."],
  ])("translates the allowlisted code %s", (code, message) => {
    expect(xeroRecoveryMessageFromCode(code)).toBe(message);
  });
  it.each([
    null,
    "Payroll NZ is not enabled.",
    "Leave update_permissions unchanged.",
    "unknown_legacy_error",
  ])("preserves legacy or absent summary %s", (message) => {
    expect(xeroRecoveryMessageFromCode(message)).toBe(message);
  });
});

import { describe, expect, it } from "vitest";
import { toPlainLanguageMessage, type XeroWriteError } from "./types";

const cases: [XeroWriteError["code"], string][] = [
  [
    "auth_error",
    "Your Xero connection needs to be reauthorised. Ask an administrator to reconnect Xero in Settings > Integrations.",
  ],
  [
    "conflict_error",
    "This leave overlaps an existing record in Xero. Review the dates and try again.",
  ],
  [
    "not_found_error",
    "This employee or leave type is not yet set up in Xero. Ask your administrator to check the Xero configuration.",
  ],
  [
    "rate_limit_error",
    "Xero is temporarily rate-limited. Try again in a few minutes.",
  ],
  [
    "network_error",
    "Could not reach Xero. Check your internet connection and try again.",
  ],
  [
    "validation_error",
    "Xero rejected this request. Check the dates and leave type and try again.",
  ],
  [
    "region_not_supported_error",
    "Sending leave to Xero is not yet available for this payroll region. Manage this leave directly in Xero for now.",
  ],
  [
    "unknown_error",
    "Something went wrong when sending this to Xero. Try again or contact support if the issue continues.",
  ],
];

describe("toPlainLanguageMessage", () => {
  it.each(cases)("maps %s to documented copy", (code, expected) => {
    const message = toPlainLanguageMessage({
      code,
      httpStatus: 500,
      message: "raw message",
      rawPayload: { detail: "raw payload" },
    });

    expect(message).toBe(expected);
    expect(message).not.toContain("raw payload");
    expect(message).not.toContain("500");
  });
});

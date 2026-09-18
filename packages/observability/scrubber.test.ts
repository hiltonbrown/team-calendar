import { describe, expect, it } from "vitest";
import {
  isSensitiveKey,
  sanitizeObject,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from "./scrubber";

describe("observability scrubber", () => {
  it("allows the exact operational keys", () => {
    for (const key of [
      "actingClerkOrgId",
      "blockedOrigin",
      "clerkOrgId",
      "columnNumber",
      "disposition",
      "documentOrigin",
      "effectiveDirective",
      "errorCode",
      "lineNumber",
      "sourceOrigin",
      "statusCode",
      "stripeSubscriptionId",
      "xeroWriteSucceeded",
    ]) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });

  it("continues to scrub near-miss credential keys", () => {
    for (const key of [
      "clerkSecret",
      "stripeWebhookSecret",
      "xeroAccessToken",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it("recursively scrubs nested objects and arrays", () => {
    expect(
      sanitizeObject({
        nested: { token: "secret" },
        rows: [{ password: "secret" }],
      })
    ).toEqual({
      nested: { token: "[SCRUBBED]" },
      rows: [{ password: "[SCRUBBED]" }],
    });
  });

  it("lets a sensitive parent dominate an allowlisted child", () => {
    expect(sanitizeObject({ rawPayload: { clerkOrgId: "org_1" } })).toEqual({
      rawPayload: "[SCRUBBED]",
    });
  });

  it("normalises errors without retaining a canary", () => {
    const error = new Error("LEAK_CANARY");
    error.stack = "LEAK_CANARY";
    Object.assign(error, { custom: "LEAK_CANARY" });
    const result = sanitizeObject({ error });
    expect(result).toEqual({ error: { name: "Error" } });
    expect(JSON.stringify(result)).not.toContain("LEAK_CANARY");
  });

  it.each([
    [{ error: "runtime text" }, { error: "[SCRUBBED]" }],
    [
      { nested: { error: "runtime text" } },
      { nested: { error: "[SCRUBBED]" } },
    ],
    [{ ErRoR: "runtime text" }, { ErRoR: "[SCRUBBED]" }],
    [{ error: { detail: "runtime text" } }, { error: "[SCRUBBED]" }],
  ])("scrubs non-Error exception channels", (input, expected) => {
    expect(sanitizeObject(input)).toEqual(expected);
  });

  it("keeps safe error codes visible", () => {
    expect(sanitizeObject({ errorCode: "APPROVAL_FAILED" })).toEqual({
      errorCode: "APPROVAL_FAILED",
    });
  });

  it("scrubs exception-shaped object fields", () => {
    expect(
      sanitizeObject({
        cause: "secret",
        message: "secret",
        params: "secret",
        query: "secret",
        response: "secret",
      })
    ).toEqual({
      cause: "[SCRUBBED]",
      message: "[SCRUBBED]",
      params: "[SCRUBBED]",
      query: "[SCRUBBED]",
      response: "[SCRUBBED]",
    });
  });

  it("does not mutate its input", () => {
    const input = { nested: { token: "secret", useful: true } };
    const before = structuredClone(input);
    sanitizeObject(input);
    expect(input).toEqual(before);
  });

  it("scrubs event requests, users and breadcrumb messages", () => {
    const result = scrubSentryEvent({
      breadcrumbs: [{ data: { token: "LEAK" }, message: "LEAK" }],
      request: {
        data: { password: "LEAK" },
        headers: { authorization: "LEAK" },
      },
      user: { email: "LEAK", ip_address: "LEAK", username: "LEAK" },
    });

    expect(JSON.stringify(result)).not.toContain("LEAK");
  });

  it("scrubs standalone breadcrumbs and structured logs", () => {
    expect(
      scrubSentryBreadcrumb({ data: { token: "LEAK" }, message: "LEAK" })
    ).toEqual({ data: { token: "[SCRUBBED]" }, message: "[SCRUBBED]" });
    expect(
      scrubSentryLog({
        attributes: { email: "LEAK", statusCode: 500 },
        level: "error",
        message: "LEAK",
      })
    ).toEqual({
      attributes: { email: "[SCRUBBED]", statusCode: 500 },
      level: "error",
      message: "[SCRUBBED]",
    });
  });
});

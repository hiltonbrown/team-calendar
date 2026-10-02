import { describe, expect, it, vi } from "vitest";
import { XeroFetchError } from "../rate-limit/xero-fetch";
import {
  classifyXeroFailure,
  hasInsufficientScopeChallenge,
} from "./classify-xero-failure";

function classify(error: unknown, dispatched = false, isMutation = true) {
  return classifyXeroFailure({ dispatched, error, isMutation });
}
describe("Xero failure classifier", () => {
  it.each(["insufficient_scope", "insufficent_scope"])(
    "recognises exact Bearer and standalone %s",
    (token) => {
      for (const header of [
        token,
        `Bearer error="${token}"`,
        `Bearer realm="a,b", error=${token}`,
        `Basic realm="elsewhere", Bearer error="${token}"`,
      ]) {
        expect(hasInsufficientScopeChallenge(header)).toBe(true);
        for (const status of [401, 403]) {
          expect(
            classifyXeroFailure({
              dispatched: true,
              isMutation: true,
              response: new Response("misleading", {
                headers: { "WWW-Authenticate": header },
                status,
              }),
            })
          ).toEqual({
            code: "permission_error",
            recoveryReason: "update_permissions",
          });
        }
      }
    }
  );
  it.each([
    null,
    "Basic error=insufficient_scope",
    'Basic realm="insufficient_scope"',
    "Bearer realm=insufficient_scope",
    'Bearer error="prefix_insufficient_scope"',
    'Bearer error="insufficient_scope_extra"',
    'Bearer error="insufficient_scope" garbage',
    'Bearer error="insufficient_scope", bad',
    'Bearer error="insufficient_scope", error=other',
    'Bearer error="insufficient_scope',
    "insufficient_scope extra",
    "prefix_insufficent_scope",
  ])("rejects non-authoritative header %s", (header) =>
    expect(hasInsufficientScopeChallenge(header)).toBe(false)
  );
  it("ignores body prose and keeps generic403 cause unknown", () => {
    expect(
      classifyXeroFailure({
        dispatched: true,
        isMutation: true,
        response: new Response("insufficient_scope", { status: 403 }),
      })
    ).toEqual({ code: "permission_error", recoveryReason: "access_denied" });
  });
  it.each(["reauthorisation_required", "refresh_token_invalid"])(
    "requires reauthorisation for %s",
    (code) =>
      expect(classify({ code })).toMatchObject({
        recoveryReason: "reauthorise",
      })
  );
  it.each(["not_connected", "disconnected", "generation_changed"])(
    "preserves %s",
    (code) =>
      expect(classify({ code })).toMatchObject({
        recoveryReason: "not_connected",
      })
  );
  it.each([
    "client_credentials_invalid",
    "configuration_error",
    "unknown_key_version",
    "auth_tag_invalid",
    "admission_unavailable",
  ])("reports incident for %s", (code) =>
    expect(classify({ code })).toMatchObject({
      recoveryReason: "operational_incident",
    })
  );
  it.each(["cooldown", "minute", "concurrency", "daily"])(
    "reports retry for %s",
    (code) =>
      expect(classify({ code })).toMatchObject({
        code: "rate_limit_error",
        recoveryReason: "retry_later",
      })
  );
  it("retains Retry-After", () =>
    expect(
      classifyXeroFailure({
        dispatched: true,
        isMutation: true,
        response: new Response(null, {
          headers: { "Retry-After": "12" },
          status: 429,
        }),
      })
    ).toMatchObject({ recoveryReason: "retry_later", retryAfterMs: 12_000 }));
  it.each(["deadline_exceeded", "body_too_large"] as const)(
    "never retries ambiguous mutation %s",
    (code) => {
      expect(
        classify(new XeroFetchError(code, true), true, true)
      ).toMatchObject({ recoveryReason: "outcome_unknown" });
      expect(
        classify(new XeroFetchError(code, false), false, true)
      ).toMatchObject({ recoveryReason: "retry_later" });
      expect(
        classify(new XeroFetchError(code, true), true, false)
      ).toMatchObject({ recoveryReason: "retry_later" });
    }
  );
  it("classifies5xx by mutation evidence", () => {
    for (const isMutation of [true, false]) {
      expect(
        classifyXeroFailure({
          dispatched: true,
          isMutation,
          response: new Response(null, { status: 503 }),
        })
      ).toMatchObject({
        recoveryReason: isMutation ? "outcome_unknown" : "retry_later",
      });
    }
  });
});

// These tests isolate provider behaviour; runtime fencing is tested in the database protocol suite.
vi.mock("@repo/database/xero-campaign-access", () => ({
  withXeroCampaignCredentialScope: (
    _scope: unknown,
    _tenant: string,
    operation: () => Promise<unknown>
  ) => operation(),
  withXeroCampaignProviderEffect: (
    _target: unknown,
    operation: () => Promise<unknown>
  ) => operation(),
}));

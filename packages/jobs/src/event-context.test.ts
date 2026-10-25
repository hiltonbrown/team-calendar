import { NonRetriableError } from "inngest";
import { describe, expect, it } from "vitest";
import { readJobEventData } from "./event-context";

const company = "00000000-0000-4000-8000-000000000001";
describe("explicit Inngest account context", () => {
  it("maps wire tenancy into internal service identifiers and preserves provenance", () => {
    expect(
      readJobEventData({
        account_id: "account",
        organisation_id: company,
        runId: "run",
        triggeredByUserId: "user",
      })
    ).toEqual({
      accountId: "account",
      organisationId: company,
      runId: "run",
      triggeredByUserId: "user",
    });
  });
  it("keeps nullable company context for account-wide feed jobs", () => {
    expect(
      readJobEventData({ account_id: "account", organisation_id: null })
    ).toEqual({ accountId: "account", organisationId: null });
  });
  it.each([
    {},
    { account_id: "account" },
    { account_id: "", organisation_id: company },
    { account_id: "account", organisation_id: "invalid-company" },
    { accountId: "legacy-account", organisationId: company },
    {
      account_id: "account",
      accountId: "foreign-account",
      organisation_id: company,
    },
  ])(
    "rejects missing, legacy or ambiguous context without retriable work",
    (input) => {
      expect(() => readJobEventData(input)).toThrow(NonRetriableError);
    }
  );
});

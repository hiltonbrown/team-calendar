import { NonRetriableError } from "inngest";
import { afterEach, describe, expect, it } from "vitest";
import { currentJobIdentityGeneration } from "../keys";
import { assertJobIdentityGeneration, readJobEventData } from "./event-context";

const company = "00000000-0000-4000-8000-000000000001";

describe("explicit Inngest account context and identity generation fencing", () => {
  const originalEnv = process.env.JOB_IDENTITY_GENERATION;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.JOB_IDENTITY_GENERATION;
    } else {
      process.env.JOB_IDENTITY_GENERATION = originalEnv;
    }
  });

  it("maps wire tenancy into internal service identifiers and preserves provenance with current generation", () => {
    const currentGen = currentJobIdentityGeneration();
    expect(
      readJobEventData({
        account_id: "account",
        identity_generation: currentGen,
        organisation_id: company,
        runId: "run",
        triggeredByUserId: "user",
      })
    ).toEqual({
      accountId: "account",
      identityGeneration: currentGen,
      organisationId: company,
      runId: "run",
      triggeredByUserId: "user",
    });
  });

  it("keeps nullable company context for account-wide feed jobs", () => {
    const currentGen = currentJobIdentityGeneration();
    expect(
      readJobEventData({
        account_id: "account",
        identity_generation: currentGen,
        organisation_id: null,
      })
    ).toEqual({
      accountId: "account",
      identityGeneration: currentGen,
      organisationId: null,
    });
  });

  it("rejects absent identity generation without retriable work", () => {
    expect(() =>
      readJobEventData({
        account_id: "account",
        organisation_id: company,
      })
    ).toThrow(NonRetriableError);
  });

  it("rejects mismatched obsolete identity generation without retriable work", () => {
    expect(() =>
      readJobEventData({
        account_id: "account",
        identity_generation: "gen_obsolete_v0",
        organisation_id: company,
      })
    ).toThrow(NonRetriableError);
  });

  it("rejects camelCase identityGeneration injection attempt", () => {
    const currentGen = currentJobIdentityGeneration();
    expect(() =>
      readJobEventData({
        account_id: "account",
        identity_generation: currentGen,
        identityGeneration: currentGen,
        organisation_id: company,
      })
    ).toThrow(NonRetriableError);
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

  describe("assertJobIdentityGeneration", () => {
    it("passes when generation matches current release generation", () => {
      const currentGen = currentJobIdentityGeneration();
      expect(() => assertJobIdentityGeneration(currentGen)).not.toThrow();
    });

    it("throws NonRetriableError when generation is undefined or missing", () => {
      expect(() => assertJobIdentityGeneration(undefined)).toThrow(
        NonRetriableError
      );
    });

    it("throws NonRetriableError when generation is mismatched", () => {
      expect(() => assertJobIdentityGeneration("gen_old_v0")).toThrow(
        NonRetriableError
      );
    });
  });
});

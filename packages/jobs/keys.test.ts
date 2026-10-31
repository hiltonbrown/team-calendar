import { afterEach, describe, expect, it } from "vitest";
import {
  currentJobIdentityGeneration,
  DEFAULT_JOB_IDENTITY_GENERATION,
  keys,
} from "./keys";

describe("jobs keys and identity generation", () => {
  const originalEnv = process.env.JOB_IDENTITY_GENERATION;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.JOB_IDENTITY_GENERATION;
    } else {
      process.env.JOB_IDENTITY_GENERATION = originalEnv;
    }
  });

  it("defaults JOB_IDENTITY_GENERATION to DEFAULT_JOB_IDENTITY_GENERATION when unset", () => {
    delete process.env.JOB_IDENTITY_GENERATION;
    expect(keys().JOB_IDENTITY_GENERATION).toBe(
      DEFAULT_JOB_IDENTITY_GENERATION
    );
    expect(currentJobIdentityGeneration()).toBe(
      DEFAULT_JOB_IDENTITY_GENERATION
    );
  });

  it("reads custom JOB_IDENTITY_GENERATION when configured", () => {
    process.env.JOB_IDENTITY_GENERATION = "gen_release_v2";
    expect(keys().JOB_IDENTITY_GENERATION).toBe("gen_release_v2");
    expect(currentJobIdentityGeneration()).toBe("gen_release_v2");
  });

  it("rejects empty string for JOB_IDENTITY_GENERATION and falls back to default via emptyStringAsUndefined", () => {
    process.env.JOB_IDENTITY_GENERATION = "";
    expect(keys().JOB_IDENTITY_GENERATION).toBe(
      DEFAULT_JOB_IDENTITY_GENERATION
    );
  });
});

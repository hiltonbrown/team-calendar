import { afterEach, describe, expect, it } from "vitest";
import {
  currentJobIdentityGeneration,
  DEFAULT_JOB_IDENTITY_GENERATION,
} from "./job-generation";

interface ProcessEnvHolder {
  process?: {
    env?: Record<string, string | undefined>;
  };
}

describe("currentJobIdentityGeneration", () => {
  const envHolder = globalThis as unknown as ProcessEnvHolder;
  const originalEnv = envHolder.process?.env?.JOB_IDENTITY_GENERATION;

  afterEach(() => {
    if (!envHolder.process) {
      envHolder.process = { env: {} };
    }
    if (!envHolder.process.env) {
      envHolder.process.env = {};
    }
    if (originalEnv === undefined) {
      Reflect.deleteProperty(envHolder.process.env, "JOB_IDENTITY_GENERATION");
    } else {
      envHolder.process.env.JOB_IDENTITY_GENERATION = originalEnv;
    }
  });

  it("returns default generation when env var is unset", () => {
    if (envHolder.process?.env) {
      Reflect.deleteProperty(envHolder.process.env, "JOB_IDENTITY_GENERATION");
    }
    expect(currentJobIdentityGeneration()).toBe(
      DEFAULT_JOB_IDENTITY_GENERATION
    );
  });

  it("returns default generation when env var is blank whitespace", () => {
    if (envHolder.process?.env) {
      envHolder.process.env.JOB_IDENTITY_GENERATION = "   ";
    }
    expect(currentJobIdentityGeneration()).toBe(
      DEFAULT_JOB_IDENTITY_GENERATION
    );
  });

  it("returns custom generation when env var is configured", () => {
    if (envHolder.process?.env) {
      envHolder.process.env.JOB_IDENTITY_GENERATION = "gen_v2_post_cutover";
    }
    expect(currentJobIdentityGeneration()).toBe("gen_v2_post_cutover");
  });
});

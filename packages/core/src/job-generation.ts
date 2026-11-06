interface ProcessEnvHolder {
  process?: {
    env?: Record<string, string | undefined>;
  };
}

export const DEFAULT_JOB_IDENTITY_GENERATION = "gen_v1";

/**
 * Returns the active job identity generation string.
 * Bumping this value invalidates and fences any queued or cached job events
 * from previous identity generations (e.g. across auth provider cutover or restore rollback).
 */
export function currentJobIdentityGeneration(): string {
  const envHolder = globalThis as unknown as ProcessEnvHolder;
  const envGen = envHolder.process?.env?.JOB_IDENTITY_GENERATION?.trim();
  if (envGen && envGen.length > 0) {
    return envGen;
  }
  return DEFAULT_JOB_IDENTITY_GENERATION;
}

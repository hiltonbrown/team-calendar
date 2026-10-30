import { NonRetriableError } from "inngest";
import { z } from "zod";
import { currentJobIdentityGeneration } from "../keys";

const wireContextSchema = z.looseObject({
  account_id: z.string().min(1),
  identity_generation: z.string().min(1),
  organisation_id: z.uuid().nullable(),
});

/**
 * Asserts that the provided identity generation matches the running release generation.
 * Throws a non-retriable Inngest error if absent or mismatched, preventing stale cached steps
 * or quarantined generation executions from performing effectful operations.
 */
export function assertJobIdentityGeneration(generation?: string): void {
  const current = currentJobIdentityGeneration();
  if (!generation || generation !== current) {
    throw new NonRetriableError(
      `Job event identity generation mismatch: expected "${current}", received "${generation ?? "none"}"`
    );
  }
}

/** Jobs receive account context in their signed event, never from a session. */
export function readJobEventData(input: unknown) {
  const parsed = wireContextSchema.safeParse(input);
  if (
    !parsed.success ||
    Object.hasOwn(parsed.data, "accountId") ||
    Object.hasOwn(parsed.data, "organisationId") ||
    Object.hasOwn(parsed.data, "identityGeneration")
  ) {
    throw new NonRetriableError("Missing or invalid account job context");
  }
  const { account_id, identity_generation, organisation_id, ...data } =
    parsed.data;
  assertJobIdentityGeneration(identity_generation);
  return {
    ...data,
    accountId: account_id,
    identityGeneration: identity_generation,
    organisationId: organisation_id,
  };
}

import { NonRetriableError } from "inngest";
import { z } from "zod";

const wireContextSchema = z.looseObject({
  account_id: z.string().min(1),
  organisation_id: z.uuid().nullable(),
});

/** Jobs receive account context in their signed event, never from a session. */
export function readJobEventData(input: unknown) {
  const parsed = wireContextSchema.safeParse(input);
  if (
    !parsed.success ||
    Object.hasOwn(parsed.data, "accountId") ||
    Object.hasOwn(parsed.data, "organisationId")
  ) {
    throw new NonRetriableError("Missing or invalid account job context");
  }
  const { account_id, organisation_id, ...data } = parsed.data;
  return { ...data, accountId: account_id, organisationId: organisation_id };
}

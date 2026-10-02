import { parseArgs } from "node:util";
import { z } from "zod";

const identity = z.strictObject({
  credentialDomainId: z.uuid(),
  epoch: z.string().regex(/^[a-z0-9-]{1,32}$/),
});
/** Immediate admission is an explicit operator policy, never evidence of unused provider quota. */
export function parseXeroNamespaceInitialisationArgs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      "acknowledge-unknown-prior-usage": { type: "boolean" },
      "allow-immediate-admission": { type: "boolean" },
      "assume-spent-daily": { type: "boolean" },
      "credential-domain-id": { type: "string" },
      epoch: { type: "string" },
    },
    strict: true,
  });
  const scope = identity.parse({
    credentialDomainId: values["credential-domain-id"],
    epoch: values.epoch,
  });
  const conservative = values["assume-spent-daily"] === true;
  const immediate = values["allow-immediate-admission"] === true;
  const acknowledged = values["acknowledge-unknown-prior-usage"] === true;
  if (
    (conservative && (immediate || acknowledged)) ||
    !(conservative || (immediate && acknowledged))
  ) {
    throw new Error(
      "Choose --assume-spent-daily or explicit --allow-immediate-admission --acknowledge-unknown-prior-usage"
    );
  }
  return {
    ...scope,
    assumeSpentDaily: conservative,
    policy: conservative ? "conservative" : "authorised-immediate",
  };
}

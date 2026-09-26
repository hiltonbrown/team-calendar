import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";

const snapshotSchema = z.object({
  approvalStatus: z.string().min(1),
  independentRawAssertion: z.literal(true).optional(),
  knownRemoteId: z.string().min(1).nullable(),
  matches: z.array(
    z.object({
      approvalStatus: z.enum([
        "approved",
        "cancelled",
        "declined",
        "submitted",
        "withdrawn",
      ]),
      rawApplicationStatus: z.string().nullable().optional(),
      rawAssertionPassed: z.literal(true).optional(),
      rawPeriodStatuses: z.array(z.string()).optional(),
      remoteId: z.string().min(1),
    })
  ),
  mode: z.literal("LIVE").optional(),
  observedAt: z.iso.datetime().optional(),
  operationAction: z.string().nullable().optional(),
  origin: z.literal("https://api.xero.com").optional(),
});
export type ProviderSnapshot = z.infer<typeof snapshotSchema>;

export function readProviderSnapshot(recordId: string): ProviderSnapshot {
  const output = execFileSync(
    "bun",
    [
      "--preload",
      resolve("tooling/release/e2e/server-only-preload.mjs"),
      resolve(
        process.env.TC_XERO_MANIFEST
          ? "tooling/release/e2e/xero-independent-snapshot-cli.ts"
          : "tooling/release/e2e/provider-snapshot-cli.ts"
      ),
      z.string().uuid().parse(recordId),
    ],
    { encoding: "utf8", env: { ...process.env, NODE_ENV: "test" } }
  );
  return snapshotSchema.parse(JSON.parse(output));
}

export function requireExactProviderState(
  snapshot: ProviderSnapshot,
  expectedStatus: ProviderSnapshot["matches"][number]["approvalStatus"]
): string {
  if (
    snapshot.mode === "LIVE" &&
    (!(
      snapshot.origin &&
      snapshot.independentRawAssertion &&
      snapshot.observedAt
    ) ||
      Date.now() - Date.parse(snapshot.observedAt) > 60_000 ||
      Date.parse(snapshot.observedAt) > Date.now() + 30_000)
  ) {
    throw new Error(
      "Independent live provider observation is missing or stale"
    );
  }
  if (!snapshot.knownRemoteId || snapshot.matches.length !== 1) {
    throw new Error("Provider state is not exact");
  }
  const [match] = snapshot.matches;
  if (
    snapshot.mode === "LIVE" &&
    !(match?.rawAssertionPassed && match.rawPeriodStatuses?.length)
  ) {
    throw new Error("Independent raw provider state assertion is missing");
  }
  if (
    !match ||
    match.remoteId !== snapshot.knownRemoteId ||
    match.approvalStatus !== expectedStatus ||
    snapshot.approvalStatus !== expectedStatus
  ) {
    throw new Error("Provider state does not match the canonical operation");
  }
  return match.remoteId;
}

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";

const snapshotSchema = z.object({
  approvalStatus: z.string().min(1),
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
      remoteId: z.string().min(1),
    })
  ),
});
export type ProviderSnapshot = z.infer<typeof snapshotSchema>;

export function readProviderSnapshot(recordId: string): ProviderSnapshot {
  const output = execFileSync(
    "bun",
    [
      "--preload",
      resolve("tooling/release/e2e/server-only-preload.mjs"),
      resolve("tooling/release/e2e/provider-snapshot-cli.ts"),
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
  if (!snapshot.knownRemoteId || snapshot.matches.length !== 1) {
    throw new Error("Provider state is not exact");
  }
  const [match] = snapshot.matches;
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

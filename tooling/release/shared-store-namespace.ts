import { createHash } from "node:crypto";

// Hash the exact allocated fixture value, including underscores and its run marker.
export function sharedStoreFixtureEpoch(namespace: string): string {
  if (!namespace) {
    throw new Error("A manifest-owned shared-store namespace is required");
  }
  return createHash("sha256").update(namespace).digest("hex").slice(0, 32);
}

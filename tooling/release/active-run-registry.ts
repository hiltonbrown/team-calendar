import { z } from "zod";
import type { ReleaseManifest } from "./database-guard.js";

const ACTIVE_RUN_KEY = "release:active-run";
const catalogueDigestKey = (runId: string) =>
  `release:catalogue-digest:${runId}`;
const TRAILING_SLASH = /\/$/;
const envelopeSchema = z.object({ result: z.unknown() });

const request = async (
  input: { token?: string; url?: string },
  command: string[]
): Promise<unknown> => {
  if (!(input.token && input.url)) {
    throw new Error("Active-run registry KV configuration is required");
  }
  const path = command.map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(
    `${input.url.replace(TRAILING_SLASH, "")}/${path}`,
    {
      headers: { Authorization: `Bearer ${input.token}` },
    }
  );
  if (!response.ok) {
    throw new Error("Active-run registry request failed");
  }
  return envelopeSchema.parse(await response.json()).result;
};

export const acquireActiveRun = async (
  manifest: ReleaseManifest,
  input: { token?: string; url?: string }
): Promise<"acquired" | "interrupted"> => {
  const acquired = await request(input, [
    "set",
    ACTIVE_RUN_KEY,
    manifest.runId,
    "nx",
  ]);
  if (acquired === "OK") {
    return "acquired";
  }
  const current = await request(input, ["get", ACTIVE_RUN_KEY]);
  if (current === manifest.runId) {
    return "interrupted";
  }
  throw new Error("Another protected release run is active");
};

export const releaseActiveRun = async (
  manifest: ReleaseManifest,
  input: { token?: string; url?: string }
): Promise<void> => {
  const compareAndDelete =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  const result = await request(input, [
    "eval",
    compareAndDelete,
    "1",
    ACTIVE_RUN_KEY,
    manifest.runId,
  ]);
  if (result !== 1) {
    throw new Error("Active-run registry ownership changed before release");
  }
};

export const assertActiveRunOwner = async (
  manifest: ReleaseManifest,
  input: { token?: string; url?: string }
): Promise<void> => {
  const current = await request(input, ["get", ACTIVE_RUN_KEY]);
  if (current !== manifest.runId) {
    throw new Error("Release run does not own the active-run registry slot");
  }
};

export const persistCatalogueDigest = async (
  manifest: ReleaseManifest,
  digest: string,
  input: { token?: string; url?: string }
): Promise<void> => {
  const result = await request(input, [
    "set",
    catalogueDigestKey(manifest.runId),
    digest,
    "nx",
  ]);
  if (result !== "OK") {
    throw new Error("Release catalogue baseline already exists");
  }
};

export const readCatalogueDigest = async (
  manifest: ReleaseManifest,
  input: { token?: string; url?: string }
): Promise<string> => {
  const result = await request(input, [
    "get",
    catalogueDigestKey(manifest.runId),
  ]);
  if (typeof result !== "string") {
    throw new Error("Release catalogue baseline is missing");
  }
  return result;
};

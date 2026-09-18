import { readFileSync } from "node:fs";
import { z } from "zod";

const manifestSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  target: z.object({
    endpointId: z.string().min(1),
    hostname: z.string().min(1),
    database: z.string().min(1),
    role: z.string().min(1),
  }),
  namespace: z.string().min(1),
  durableManifestConfirmed: z.literal(true),
  active: z.literal(true),
});

export const assertTestDatabaseConnectionAllowed = (): void => {
  if (process.env.TC_SOURCE_GATES === "1") {
    throw new Error("Database connections are disabled during source-only gates");
  }
  if (process.env.NODE_ENV !== "test") {
    return;
  }
  if (
    process.env.ALLOW_LIVE_DATABASE_TESTS !==
    "I_ACKNOWLEDGE_LIVE_MUTATION"
  ) {
    throw new Error(
      "Database connections are disabled in unit tests. Use the guarded live integration runner."
    );
  }
  const manifestPath = process.env.TC_RELEASE_MANIFEST;
  const runId = process.env.TC_RELEASE_RUN_ID;
  const databaseUrl = process.env.DATABASE_URL;
  if (!(manifestPath && runId && databaseUrl)) {
    throw new Error("Protected live integration inputs are incomplete");
  }
  const value: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifest = manifestSchema.parse(value);
  const identity = new URL(databaseUrl);
  if (
    manifest.runId !== runId ||
    manifest.namespace !== `release:run:${runId}` ||
    decodeURIComponent(identity.pathname.slice(1)) !== manifest.target.database ||
    decodeURIComponent(identity.username) !== manifest.target.role ||
    identity.hostname !== manifest.target.hostname ||
    process.env.TC_RELEASE_DURABLE_VERIFIED !== runId ||
    process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== runId
  ) {
    throw new Error("Live database identity does not match the protected manifest");
  }
};

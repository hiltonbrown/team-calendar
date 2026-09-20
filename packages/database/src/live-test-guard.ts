import { readFileSync } from "node:fs";
import { z } from "zod";
import { isLocalDatabase } from "./is-local-database";

const manifestSchema = z.object({
  active: z.literal(true),
  consumerIsolation: z
    .object({
      kind: z.literal("unregistered-inngest-environment"),
    })
    .optional(),
  durableManifestConfirmed: z.literal(true),
  namespace: z.string().min(1),
  runId: z.string().uuid(),
  target: z.object({
    database: z.string().min(1),
    endpointId: z.string().min(1),
    hostname: z.string().min(1),
    role: z.string().min(1),
  }),
  version: z.literal(1),
});

export const assertTestDatabaseConnectionAllowed = (): void => {
  if (process.env.TC_SOURCE_GATES === "1") {
    throw new Error(
      "Database connections are disabled during source-only gates"
    );
  }
  if (process.env.NODE_ENV !== "test") {
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;

  if (process.env.ALLOW_LIVE_DATABASE_TESTS === "I_ACKNOWLEDGE_LIVE_MUTATION") {
    const manifestPath = process.env.TC_RELEASE_MANIFEST;
    const runId = process.env.TC_RELEASE_RUN_ID;
    if (!(manifestPath && runId && databaseUrl)) {
      throw new Error("Protected live integration inputs are incomplete");
    }
    const value: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const manifest = manifestSchema.parse(value);
    const identity = new URL(databaseUrl);
    if (
      manifest.runId !== runId ||
      manifest.namespace !== `release:run:${runId}` ||
      decodeURIComponent(identity.pathname.slice(1)) !==
        manifest.target.database ||
      decodeURIComponent(identity.username) !== manifest.target.role ||
      identity.hostname !== manifest.target.hostname ||
      process.env.TC_RELEASE_DURABLE_VERIFIED !== runId ||
      process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== runId
    ) {
      throw new Error(
        "Live database identity does not match the protected manifest"
      );
    }
    if (
      manifest.consumerIsolation &&
      process.env.TC_RELEASE_CONSUMERS_VERIFIED !== runId
    ) {
      throw new Error(
        "Unregistered consumers require verified live Inngest inventory"
      );
    }
    return;
  }

  if (process.env.ALLOW_LOCAL_DATABASE_TESTS === "1") {
    if (databaseUrl && isLocalDatabase(databaseUrl)) {
      return;
    }
    throw new Error(
      "ALLOW_LOCAL_DATABASE_TESTS can only be used with a local database connection."
    );
  }

  throw new Error(
    "Database connections are disabled in unit tests. Use the guarded live integration runner."
  );
};

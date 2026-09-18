import { readFileSync } from "node:fs";
import { z } from "zod";

export const LIVE_DATABASE_ACKNOWLEDGEMENT =
  "I_ACKNOWLEDGE_LIVE_MUTATION" as const;

const manifestSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  candidateSha: z.string().regex(/^[0-9a-f]{7,40}$/),
  target: z.object({
    projectId: z.string().min(1),
    branchId: z.string().min(1),
    endpointId: z.string().min(1),
    hostname: z.string().min(1),
    database: z.string().min(1),
    role: z.string().min(1),
  }),
  restoreEvidence: z.object({
    observedAt: z.string().datetime(),
    reference: z.string().min(1),
  }),
  namespace: z.string().regex(/^release:run:[0-9a-f-]{36}$/),
  durableManifestConfirmed: z.literal(true),
  active: z.literal(true),
  owned: z.object({
    clerkOrgIds: z.array(z.string()).default([]),
    organisationIds: z.array(z.string().uuid()).default([]),
    globalKeys: z.array(z.string()).default([]),
  }),
  pausedConsumers: z.record(z.string(), z.boolean()).default({}),
});

export type ReleaseManifest = z.infer<typeof manifestSchema>;

export type DatabaseIdentity = {
  hostname: string;
  database: string;
  role: string;
};

const REQUIRED_CONSUMERS = [
  "rebuild-feed-cache",
  "reconcile-feed-publications",
  "reconcile-xero-approval-state",
  "recount-usage",
  "schedule-xero-syncs",
  "send-notification-emails",
  "sync-xero-leave-balances",
  "sync-xero-leave-records",
  "sync-xero-people",
] as const;

export const parseDatabaseIdentity = (value: string): DatabaseIdentity => {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const role = decodeURIComponent(url.username);
  if (!(url.hostname && database && role)) {
    throw new Error("Database URL does not contain a host, database and role");
  }
  return { hostname: url.hostname, database, role };
};

export const readReleaseManifest = (path: string): ReleaseManifest => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return manifestSchema.parse(parsed);
};

export const assertLiveDatabaseAuthority = (input: {
  acknowledgement?: string;
  databaseUrl?: string;
  manifestPath?: string;
  runId?: string;
}): ReleaseManifest => {
  if (input.acknowledgement !== LIVE_DATABASE_ACKNOWLEDGEMENT) {
    throw new Error("Live database acknowledgement is missing");
  }
  if (!(input.databaseUrl && input.manifestPath && input.runId)) {
    throw new Error("Live database identity and manifest inputs are required");
  }
  const manifest = readReleaseManifest(input.manifestPath);
  if (manifest.runId !== input.runId) {
    throw new Error("Release run ID does not match the protected manifest");
  }
  if (manifest.namespace !== `release:run:${manifest.runId}`) {
    throw new Error("Release manifest namespace does not match its run ID");
  }
  if (
    REQUIRED_CONSUMERS.some(
      (consumer) => !(consumer in manifest.pausedConsumers)
    )
  ) {
    throw new Error("Protected manifest does not inventory every registered consumer");
  }
  const identity = parseDatabaseIdentity(input.databaseUrl);
  if (
    identity.database !== manifest.target.database ||
    identity.role !== manifest.target.role ||
    identity.hostname !== manifest.target.hostname
  ) {
    throw new Error("Configured database does not match the protected target");
  }
  return manifest;
};

export const assertDurableManifestReadBack = async (
  manifest: ReleaseManifest,
  input: { url?: string; token?: string }
): Promise<void> => {
  if (!(input.url && input.token)) {
    throw new Error("Durable manifest KV configuration is required");
  }
  const response = await fetch(
    `${input.url.replace(/\/$/, "")}/get/${encodeURIComponent(manifest.namespace)}`,
    { headers: { Authorization: `Bearer ${input.token}` } }
  );
  if (!response.ok) {
    throw new Error("Durable manifest read-back failed");
  }
  const body: unknown = await response.json();
  const envelope = z.object({ result: z.string().nullable() }).parse(body);
  if (!envelope.result) {
    throw new Error("Durable manifest is missing");
  }
  const durable = manifestSchema.parse(JSON.parse(envelope.result));
  if (JSON.stringify(durable) !== JSON.stringify(manifest)) {
    throw new Error("Durable manifest does not match the local protected copy");
  }
};

export const assertDatabaseConnectionAllowed = (): void => {
  if (process.env.NODE_ENV !== "test") {
    return;
  }
  assertLiveDatabaseAuthority({
    acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
    databaseUrl: process.env.DATABASE_URL,
    manifestPath: process.env.TC_RELEASE_MANIFEST,
    runId: process.env.TC_RELEASE_RUN_ID,
  });
};

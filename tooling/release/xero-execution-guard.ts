import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { parseReleaseManifest } from "./database-guard.js";
import { assertReviewedXeroSource } from "./xero-source-integrity.js";

const resourceSchema = z.strictObject({
  alias: z.string().regex(/^fixture-[a-z0-9-]+$/),
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  cohort: z.enum(["A", "B", "C", "D"]),
  employeeIds: z.array(z.uuid()).min(1).max(20),
  independentRecoveryAlias: z
    .string()
    .regex(/^fixture-[a-z0-9-]+$/)
    .nullable(),
  leaveTypeIds: z.array(z.uuid()).min(1).max(20),
  maximumMutations: z.number().int().nonnegative().max(20),
  organisationId: z.uuid(),
  permittedOperations: z
    .array(
      z.enum([
        "read",
        "create",
        "approve",
        "decline",
        "withdraw",
        "connect",
        "disconnect",
      ])
    )
    .min(1),
  xeroTenantId: z.uuid(),
});
const schema = z.strictObject({
  browserActions: z
    .array(
      z.strictObject({
        action: z.enum([
          "create",
          "approve",
          "decline",
          "withdraw",
          "connect",
          "disconnect",
        ]),
        candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
        nextActionId: z.string().regex(/^[a-f0-9]{40,64}$/),
        sourceReference: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
    )
    .max(20)
    .optional(),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  contractDecision: z.string().regex(/^au-contract-v[1-9][0-9]*$/),
  databaseManifest: z.unknown(),
  dateWindow: z.strictObject({ from: z.iso.date(), until: z.iso.date() }),
  deployments: z.strictObject({
    api: z.string().url(),
    app: z.string().url(),
    web: z.string().url(),
  }),
  environment: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  mode: z.literal("xero-e2e"),
  owned: z.array(resourceSchema).min(1).max(20),
  runId: z.uuid(),
  version: z.literal(2),
  workers: z.strictObject({
    allowedFunctions: z.array(z.string().min(1)).min(1).max(20),
    drainRequired: z.literal(true),
    environmentId: z.string().min(1),
    expectedRevision: z.string().regex(/^[a-f0-9]{40}$/),
    fenceGeneration: z.number().int().positive(),
    priorState: z.record(z.string(), z.boolean()),
    restoreRequired: z.literal(true),
  }),
});
export type XeroExecutionManifest = z.infer<typeof schema>;
export function parseXeroExecutionManifest(
  value: unknown
): XeroExecutionManifest {
  const manifest = schema.parse(value);
  const database = parseReleaseManifest(manifest.databaseManifest);
  if (
    database.runId === manifest.runId ||
    database.candidateSha !== manifest.candidateSha ||
    manifest.workers.expectedRevision !== manifest.candidateSha ||
    manifest.dateWindow.until < manifest.dateWindow.from
  ) {
    throw new Error("Xero execution manifest identity is invalid");
  }
  const aliases = new Set(manifest.owned.map((entry) => entry.alias));
  if (aliases.size !== manifest.owned.length) {
    throw new Error("Xero fixture aliases are duplicated");
  }
  for (const resource of manifest.owned) {
    if (
      !(
        database.owned.clerkOrgIds.includes(resource.clerkOrgId) &&
        database.owned.organisationIds.includes(resource.organisationId)
      )
    ) {
      throw new Error("Xero fixture scope is outside protected ownership");
    }
    if (
      resource.permittedOperations.includes("disconnect") &&
      (!resource.independentRecoveryAlias ||
        resource.independentRecoveryAlias === resource.alias ||
        !aliases.has(resource.independentRecoveryAlias))
    ) {
      throw new Error("Destructive fixture has no independent recovery path");
    }
  }
  for (const address of Object.values(manifest.deployments)) {
    const url = new URL(address);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      throw new Error("Candidate deployment origin is unsafe");
    }
  }
  return { ...manifest, databaseManifest: database };
}
export function readXeroExecutionManifest(path: string) {
  if (statSync(path).mode % 0o100 !== 0) {
    throw new Error("Protected Xero manifest permissions are unsafe");
  }
  return parseXeroExecutionManifest(JSON.parse(readFileSync(path, "utf8")));
}
const contextSchema = z.strictObject({
  appUrl: z.string().url(),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  nonce: z.uuid(),
  output: z.string(),
  runId: z.uuid(),
  runnerPid: z.number().int().positive(),
  verifiedFenceReference: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  version: z.literal(1),
});
export type XeroRunnerContext = z.infer<typeof contextSchema>;
export function writeXeroRunnerContext(
  path: string,
  value: Omit<
    XeroRunnerContext,
    "nonce" | "version" | "runnerPid" | "createdAt"
  >
) {
  const context = contextSchema.parse({
    ...value,
    createdAt: new Date().toISOString(),
    nonce: randomUUID(),
    runnerPid: process.pid,
    version: 1,
  });
  writeFileSync(path, JSON.stringify(context), { flag: "wx", mode: 0o600 });
  return context;
}
export function requireXeroRunnerContext(environment = process.env) {
  const path = environment.TC_XERO_RUNNER_CONTEXT;
  if (
    !(
      path &&
      resolve(path).startsWith(`${resolve("tooling/release/test-results")}/`)
    ) ||
    statSync(path).mode % 0o100 !== 0
  ) {
    throw new Error(
      "Xero Playwright configuration requires guarded runner context"
    );
  }
  const context = contextSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  if (
    context.nonce !== environment.TC_XERO_RUNNER_NONCE ||
    Date.parse(context.createdAt) > Date.now() + 30_000 ||
    Date.parse(context.expiresAt) <= Date.parse(context.createdAt) ||
    Date.parse(context.expiresAt) <= Date.now() ||
    Date.parse(context.expiresAt) - Date.now() > 60 * 60 * 1000 ||
    context.candidateSha !==
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() ||
    !resolve(context.output).startsWith(
      `${resolve("tooling/release/test-results")}/`
    )
  ) {
    throw new Error("Guarded Xero runner context is stale or mismatched");
  }
  const manifestPath = environment.TC_XERO_MANIFEST;
  if (!manifestPath) {
    throw new Error("Guarded Xero runner manifest is missing");
  }
  const rawManifest = readFileSync(resolve(manifestPath), "utf8");
  const manifest = readXeroExecutionManifest(resolve(manifestPath));
  if (
    createHash("sha256").update(rawManifest).digest("hex") !==
      context.manifestHash ||
    manifest.runId !== context.runId ||
    manifest.candidateSha !== context.candidateSha ||
    manifest.deployments.app !== context.appUrl
  ) {
    throw new Error("Guarded Xero runner manifest changed");
  }
  assertReviewedXeroSource(context.candidateSha);
  process.kill(context.runnerPid, 0);
  return context;
}

// Current workers have no run/tenant-generation fence. A manifest cannot prove
// enforcement. The CLI deliberately has no environment-variable enable switch.
export function currentXeroWorkerCapability() {
  return {
    available: false as const,
    reason: "worker-isolation-unavailable" as const,
    requiredContract:
      "Registered candidate revision plus enforced owned tenant/run/generation fence, terminal drain and restoration read-back",
  };
}

export async function requireDurableXeroRunnerAuthority(
  environment = process.env
) {
  const context = requireXeroRunnerContext(environment);
  const manifest = readXeroExecutionManifest(
    z.string().min(1).parse(environment.TC_XERO_MANIFEST)
  );
  const { assertDurableXeroExecutionManifestReadBack } = await import(
    "./xero-execution-manifest-store.js"
  );
  await assertDurableXeroExecutionManifestReadBack(manifest, {
    token: environment.KV_REST_API_TOKEN ?? "",
    url: environment.KV_REST_API_URL ?? "",
  });
  return context;
}

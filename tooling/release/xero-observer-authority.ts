import { readFileSync, statSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { assertActiveRunOwner } from "./active-run-registry.js";
import {
  assertDurableManifestReadBack,
  parseDatabaseIdentity,
  parseReleaseManifest,
  type ReleaseManifest,
} from "./database-guard.js";
import {
  parseXeroExecutionManifest,
  requireXeroRunnerContext,
  type XeroExecutionManifest,
  type XeroRunnerContext,
} from "./xero-execution-guard.js";
import { assertDurableXeroExecutionManifestReadBack } from "./xero-execution-manifest-store.js";

export interface XeroObserverBindings {
  context: XeroRunnerContext;
  databaseManifest: ReleaseManifest;
  databaseUrl: string;
  fixtureAlias: string;
  manifest: XeroExecutionManifest;
}

// This is a separate read-only protocol. It never asserts that live E2E
// workers satisfy the ordinary database-fixture pause contract.
export function assertXeroObserverBindings(input: XeroObserverBindings) {
  const manifest = parseXeroExecutionManifest(input.manifest);
  const database = parseReleaseManifest(input.databaseManifest);
  const embedded = parseReleaseManifest(manifest.databaseManifest);
  const identity = parseDatabaseIdentity(input.databaseUrl);
  const fixture = manifest.owned.find(
    (resource) => resource.alias === input.fixtureAlias
  );
  if (
    !fixture?.permittedOperations.includes("read") ||
    input.context.runId !== manifest.runId ||
    input.context.candidateSha !== manifest.candidateSha ||
    input.context.appUrl !== manifest.deployments.app ||
    database.runId === manifest.runId ||
    database.candidateSha !== manifest.candidateSha ||
    database.namespace !== `release:run:${database.runId}` ||
    JSON.stringify(database) !== JSON.stringify(embedded) ||
    identity.hostname !== database.target.hostname ||
    identity.database !== database.target.database ||
    identity.role !== database.target.role
  ) {
    throw new Error("Xero observer authority does not match exact ownership");
  }
  return { database, fixture, manifest };
}

const sqlIdentitySchema = z.object({
  rows: z
    .array(
      z.object({
        branchId: z.string(),
        database: z.string(),
        endpointId: z.string(),
        projectId: z.string(),
        readOnly: z.literal("on"),
        role: z.string(),
      })
    )
    .length(1),
});

interface ObserverClient {
  query: (sql: string) => Promise<unknown>;
  release: (discard?: boolean) => void;
}

async function releaseObserverClient(client: ObserverClient) {
  let discard = false;
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    discard = true;
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function withXeroReadOnlyObservation<
  Client extends ObserverClient,
  Result,
>(
  input: {
    assertCurrent: () => Promise<void>;
    databaseManifest: ReleaseManifest;
    pool: { connect: () => Promise<Client> };
  },
  observe: (client: Client) => Promise<Result>
): Promise<Result> {
  await input.assertCurrent();
  const client = await input.pool.connect();
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    const {
      rows: [identity],
    } = sqlIdentitySchema.parse(
      await client.query(
        `SELECT current_database() AS database, current_user AS role,
          current_setting('transaction_read_only') AS "readOnly",
          current_setting('neon.project_id') AS "projectId",
          current_setting('neon.branch_id') AS "branchId",
          current_setting('neon.endpoint_id') AS "endpointId"`
      )
    );
    const expected = input.databaseManifest.target;
    if (
      !identity ||
      identity.database !== expected.database ||
      identity.role !== expected.role ||
      identity.projectId !== expected.projectId ||
      identity.branchId !== expected.branchId ||
      identity.endpointId !== expected.endpointId
    ) {
      throw new Error("Xero observer SQL target identity changed");
    }
    await input.assertCurrent();
    const result = await observe(client);
    await input.assertCurrent();
    return result;
  } finally {
    await releaseObserverClient(client);
  }
}

function readProtected(path: string | undefined) {
  if (!path || statSync(path).mode % 0o100 !== 0) {
    throw new Error("Xero observer protected manifest is unavailable");
  }
  return readFileSync(path, "utf8");
}

export async function requireXeroObserverAuthority(
  fixtureAlias: string,
  environment = process.env
) {
  const databaseUrl = z.string().min(1).parse(environment.DATABASE_URL);
  const executionBytes = readProtected(environment.TC_XERO_MANIFEST);
  const databaseBytes = readProtected(environment.TC_RELEASE_MANIFEST);
  const context = requireXeroRunnerContext(environment);
  const bindings = assertXeroObserverBindings({
    context,
    databaseManifest: parseReleaseManifest(JSON.parse(databaseBytes)),
    databaseUrl,
    fixtureAlias,
    manifest: parseXeroExecutionManifest(JSON.parse(executionBytes)),
  });
  if (environment.TC_RELEASE_RUN_ID !== bindings.database.runId) {
    throw new Error("Xero observer database run identity changed");
  }
  const store = {
    token: z.string().min(1).parse(environment.KV_REST_API_TOKEN),
    url: z.string().url().parse(environment.KV_REST_API_URL),
  };
  const runtimeScope = {
    bindingGeneration: bindings.fixture.bindingGeneration,
    candidateSha: bindings.manifest.candidateSha,
    clerkOrgId: bindings.fixture.clerkOrgId,
    epoch: bindings.manifest.workers.fenceGeneration,
    externalTenantId: bindings.fixture.xeroTenantId,
    organisationId: bindings.fixture.organisationId,
    phases: ["active"] as const,
    runId: bindings.manifest.runId,
  };
  const runtimeStore = {
    ...store,
    credentialDomainId: z.uuid().parse(environment.XERO_CREDENTIAL_DOMAIN_ID),
    runtimeRevision: context.candidateSha,
  };
  const readControl = async () => {
    const current = requireXeroRunnerContext(environment);
    if (
      JSON.stringify(current) !== JSON.stringify(context) ||
      readProtected(environment.TC_XERO_MANIFEST) !== executionBytes ||
      readProtected(environment.TC_RELEASE_MANIFEST) !== databaseBytes ||
      environment.DATABASE_URL !== databaseUrl
    ) {
      throw new Error("Xero observer immutable authority changed");
    }
    await assertDurableManifestReadBack(bindings.database, store);
    await assertActiveRunOwner(bindings.database, store);
    await assertDurableXeroExecutionManifestReadBack(bindings.manifest, store);
    const { assertXeroCampaignAuthority } = await import(
      "../../packages/database/src/xero-campaign-access.js"
    );
    const { xeroCampaignTargetHash } = await import(
      "../../packages/database/src/xero-campaign-contract.js"
    );
    const control = await assertXeroCampaignAuthority(
      runtimeScope,
      runtimeStore
    );
    if (
      control.databaseRunId !== bindings.database.runId ||
      control.manifestHash !== context.manifestHash ||
      control.registrationReference !== context.verifiedFenceReference ||
      control.databaseTargetHash !==
        xeroCampaignTargetHash(bindings.database.target)
    ) {
      throw new Error("Xero observer runtime authority changed");
    }
    return control;
  };
  const assertCurrent = async () => {
    await readControl();
  };
  await assertCurrent();
  return {
    assertCurrent,
    context,
    databaseManifest: bindings.database,
    databaseUrl,
    fixture: bindings.fixture,
    manifest: bindings.manifest,
    observeProvider: async <Result>(observe: () => Promise<Result>) => {
      await assertCurrent();
      const { withXeroCampaignObservation } = await import(
        "../../packages/database/src/xero-campaign-access.js"
      );
      return withXeroCampaignObservation(
        runtimeScope,
        async () => {
          const result = await observe();
          await assertCurrent();
          return result;
        },
        runtimeStore
      );
    },
    readControl,
    readOnly: <Result>(
      pool: Pool,
      observe: (client: PoolClient) => Promise<Result>
    ) =>
      withXeroReadOnlyObservation(
        { assertCurrent, databaseManifest: bindings.database, pool },
        observe
      ),
  };
}

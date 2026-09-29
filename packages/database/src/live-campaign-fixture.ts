import { lstatSync, readFileSync } from "node:fs";
import { executeRedisRestCommand } from "@repo/core";
import { z } from "zod";
import { database } from "./client";
import {
  allocateLiveTestFixture,
  type LiveTestFixture,
} from "./live-test-fixture";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";
import { xeroCampaignTargetHash } from "./xero-campaign-contract";
import {
  XeroCampaignStore,
  xeroCampaignStoreCredentials,
} from "./xero-campaign-store";

const targetSchema = z.object({
  branchId: z.string(),
  database: z.string(),
  endpointId: z.string(),
  hostname: z.string(),
  projectId: z.string(),
  role: z.string(),
});
const manifestSchema = z.object({
  active: z.literal(true),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  namespace: z.string(),
  owned: z.object({
    clerkOrgIds: z.array(z.string().min(1)),
    globalKeys: z.array(z.string()),
    organisationIds: z.array(z.uuid()),
  }),
  runId: z.uuid(),
  target: targetSchema,
  version: z.literal(1),
});

const protectedCredentialDomains = new Set<string>();

/** This fixture uses the real shared store and exactly one manifest-owned domain. */
export async function initialiseLiveCampaignFixture(fixture: LiveTestFixture) {
  assertTestDatabaseConnectionAllowed();
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.ALLOW_LIVE_DATABASE_TESTS !== "I_ACKNOWLEDGE_LIVE_MUTATION"
  ) {
    throw new Error(
      "Campaign fixture requires the protected online test runner"
    );
  }
  const path = process.env.TC_RELEASE_MANIFEST;
  if (
    !path ||
    lstatSync(path).isSymbolicLink() ||
    !lstatSync(path).isFile() ||
    lstatSync(path).mode % 0o100 !== 0
  ) {
    throw new Error("Campaign fixture requires a protected online manifest");
  }
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const manifest = manifestSchema.parse(raw);
  const domain = z.uuid().parse(fixture.globalKey("campaign_domain"));
  const allocated = allocateLiveTestFixture(fixture.suite);
  const [tenant] = fixture.tenants;
  const configuredDomain = process.env.XERO_CREDENTIAL_DOMAIN_ID;
  if (configuredDomain !== undefined) {
    protectedCredentialDomains.add(z.uuid().parse(configuredDomain));
  }
  if (
    !tenant ||
    allocated.runId !== fixture.runId ||
    allocated.globalKey("campaign_domain") !== domain ||
    JSON.stringify(allocated.tenants) !== JSON.stringify(fixture.tenants) ||
    protectedCredentialDomains.has(domain)
  ) {
    throw new Error(
      "Campaign fixture domain or tenant allocation is not isolated"
    );
  }
  const credentials = xeroCampaignStoreCredentials();
  const token = z.string().min(1).parse(credentials.token);
  const url = z.url().parse(credentials.url);
  if (
    fixture.runId !== manifest.runId ||
    manifest.namespace !== `release:run:${manifest.runId}` ||
    !manifest.owned.globalKeys.includes(`campaign_domain:${domain}`)
  ) {
    throw new Error("Campaign fixture is outside exact manifest ownership");
  }
  const command = async (args: string[]) => {
    const result = await executeRedisRestCommand<unknown>({
      command: args,
      timeoutMs: 5000,
      token,
      url,
    });
    if (!result.ok) {
      throw new Error("Campaign fixture authority read failed");
    }
    return result.value;
  };
  if ((await command(["GET", "release:active-run"])) !== manifest.runId) {
    throw new Error("Campaign fixture requires current release ownership");
  }
  const durable = z.string().parse(await command(["GET", manifest.namespace]));
  if (JSON.stringify(JSON.parse(durable)) !== JSON.stringify(raw)) {
    throw new Error("Campaign fixture durable manifest differs");
  }
  const configured = new URL(z.string().parse(process.env.DATABASE_URL));
  if (
    configured.hostname !== manifest.target.hostname ||
    decodeURIComponent(configured.username) !== manifest.target.role ||
    decodeURIComponent(configured.pathname.slice(1)) !==
      manifest.target.database
  ) {
    throw new Error("Campaign fixture database target differs");
  }
  const rows = z
    .array(targetSchema.omit({ hostname: true }))
    .length(1)
    .parse(
      await database.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.$queryRaw`SELECT current_database() AS database, current_user AS role,
        current_setting('neon.project_id') AS "projectId",
        current_setting('neon.branch_id') AS "branchId",
        current_setting('neon.endpoint_id') AS "endpointId"`;
      })
    );
  const [actual] = rows;
  if (
    !actual ||
    Object.entries(actual).some(
      ([key, value]) => Reflect.get(manifest.target, key) !== value
    )
  ) {
    throw new Error("Campaign fixture live database identity differs");
  }
  if ((await command(["GET", "release:active-run"])) !== manifest.runId) {
    throw new Error("Campaign fixture release ownership changed");
  }
  const store = new XeroCampaignStore({
    credentialDomainId: domain,
    runtimeRevision: manifest.candidateSha,
    token,
    url,
  });
  const sentinel = {
    credentialDomainId: domain,
    databaseTargetHash: xeroCampaignTargetHash(manifest.target),
    version: 1,
  };
  const established = await command([
    "EVAL",
    "if redis.call('get',KEYS[1]) ~= ARGV[1] or redis.call('get',KEYS[2]) ~= ARGV[2] then return 0 end; if redis.call('set',KEYS[3],ARGV[3],'NX') then return 1 end; return 0",
    "3",
    "release:active-run",
    manifest.namespace,
    store.keys.sentinel,
    manifest.runId,
    durable,
    JSON.stringify(sentinel),
  ]);
  if (established !== 1) {
    throw new Error(
      "Campaign fixture sentinel was not established under ownership"
    );
  }
  const snapshot = await store.readOrganisation(tenant.organisationId);
  if (
    snapshot.control ||
    snapshot.sentinel.databaseTargetHash !== sentinel.databaseTargetHash ||
    (await command([
      "EVAL",
      "if redis.call('get',KEYS[1]) == ARGV[1] and redis.call('get',KEYS[2]) == ARGV[2] and redis.call('get',KEYS[3]) == ARGV[3] then return 1 end; return 0",
      "3",
      "release:active-run",
      manifest.namespace,
      store.keys.sentinel,
      manifest.runId,
      durable,
      JSON.stringify(sentinel),
    ])) !== 1
  ) {
    throw new Error("Campaign fixture sentinel read-back differs");
  }
  process.env.XERO_CREDENTIAL_DOMAIN_ID = domain;
  process.env.VERCEL_GIT_COMMIT_SHA = manifest.candidateSha;
}

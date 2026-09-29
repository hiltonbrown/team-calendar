import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialiseLiveCampaignFixture } from "./live-campaign-fixture";
import {
  allocateLiveTestFixture,
  type GlobalKeyKind,
  LIVE_FIXTURE_GLOBAL_KEY_KINDS,
  LIVE_FIXTURE_SUITES,
  REQUIRED_LIVE_FIXTURE_TENANT_SLOTS,
} from "./live-test-fixture";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  fetch: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("./client", () => ({ database: { $transaction: mocks.transaction } }));
const productionDomain = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const suite = "packages/jobs/src/handlers/sync-xero-people.integration.test.ts";
let sequence = 0;
function uuid() {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}
function makeManifest() {
  const runId = uuid();
  return {
    active: true,
    candidateSha: "a".repeat(40),
    durableManifestConfirmed: true,
    mode: "database-fixture",
    namespace: `release:run:${runId}`,
    owned: {
      clerkOrgIds: Array.from(
        { length: REQUIRED_LIVE_FIXTURE_TENANT_SLOTS },
        (_, index) => `org_unit_${runId}_${index}`
      ),
      globalKeys: LIVE_FIXTURE_GLOBAL_KEY_KINDS.flatMap((kind) => {
        const count = Object.values(LIVE_FIXTURE_SUITES).reduce(
          (total, allocation) => {
            const keys: Partial<Record<GlobalKeyKind, number>> =
              "globalKeys" in allocation ? allocation.globalKeys : {};
            return total + (keys[kind] ?? 0);
          },
          0
        );
        return Array.from({ length: count }, () => `${kind}:${uuid()}`);
      }),
      organisationIds: Array.from(
        { length: REQUIRED_LIVE_FIXTURE_TENANT_SLOTS },
        uuid
      ),
    },
    runId,
    target: {
      branchId: "branch-unit",
      database: "unit_db",
      endpointId: "endpoint-unit",
      hostname: "endpoint-unit.neon.test",
      projectId: "project-unit",
      role: "unit_role",
    },
    version: 1,
  };
}
let directory: string;
let path: string;
let manifest: ReturnType<typeof makeManifest>;
let state: Map<string, string>;
let commands: string[][];
function saveManifest() {
  const bytes = JSON.stringify(manifest);
  writeFileSync(path, bytes, { mode: 0o600 });
  state.set(manifest.namespace, bytes);
}
function response(args: string[]) {
  if (args[0] === "GET") {
    return state.get(args[1]) ?? null;
  }
  if (args[0] !== "EVAL") {
    throw new Error("Unexpected fixture command");
  }
  if (args[2] === "2") {
    const runId = args[5] || state.get(args[4]);
    return [
      state.get(args[3]) ?? null,
      runId ? (state.get(args[6] + runId) ?? null) : null,
      state.get("release:active-run") ?? null,
      runId ?? null,
    ];
  }
  if (args[2] !== "3") {
    throw new Error("Unexpected fixture script key count");
  }
  if (state.get(args[3]) !== args[6] || state.get(args[4]) !== args[7]) {
    return 0;
  }
  if (args[1].includes("'NX'")) {
    if (state.has(args[5])) {
      return 0;
    }
    state.set(args[5], args[8]);
    return 1;
  }
  return state.get(args[5]) === args[8] ? 1 : 0;
}
function sentinelKey() {
  return `xero:e2e:runtime:v1:${allocateLiveTestFixture(suite).globalKey("campaign_domain")}:sentinel`;
}
beforeEach(() => {
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), "tc-campaign-fixture-unit-"));
  path = join(directory, "manifest.json");
  manifest = makeManifest();
  state = new Map([["release:active-run", manifest.runId]]);
  commands = [];
  saveManifest();
  const environment = {
    ALLOW_LIVE_DATABASE_TESTS: "I_ACKNOWLEDGE_LIVE_MUTATION",
    DATABASE_URL:
      "postgresql://unit_role:unit-password@endpoint-unit.neon.test/unit_db",
    NODE_ENV: "test",
    TC_RELEASE_ACTIVE_RUN_VERIFIED: manifest.runId,
    TC_RELEASE_DURABLE_VERIFIED: manifest.runId,
    TC_RELEASE_MANIFEST: path,
    TC_RELEASE_RUN_ID: manifest.runId,
    TC_TEST_KV_REST_API_TOKEN: "unit-redis-token",
    TC_TEST_KV_REST_API_URL: "https://unit-redis.invalid",
    VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    XERO_CREDENTIAL_DOMAIN_ID: productionDomain,
  };
  for (const [key, value] of Object.entries(environment)) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv("KV_REST_API_URL", undefined);
  vi.stubEnv("KV_REST_API_TOKEN", undefined);
  vi.stubEnv("TC_SOURCE_GATES", undefined);
  vi.stubEnv("ALLOW_LOCAL_DATABASE_TESTS", undefined);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation((_url: unknown, options?: RequestInit) => {
    const args: string[] = JSON.parse(String(options?.body));
    commands.push(args);
    return Promise.resolve(Response.json({ result: response(args) }));
  });
  const { hostname, ...identity } = manifest.target;
  mocks.query.mockResolvedValue([identity]);
  mocks.execute.mockResolvedValue(0);
  mocks.transaction.mockImplementation(
    async (
      callback: (tx: {
        $executeRaw: typeof mocks.execute;
        $queryRaw: typeof mocks.query;
      }) => Promise<unknown>
    ) => await callback({ $executeRaw: mocks.execute, $queryRaw: mocks.query })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(directory, { force: true, recursive: true });
});
describe("real-store protected campaign fixture", () => {
  it("uses real default KV transport, live SQL identity and atomic owner/manifest/NX checks for one allocated domain", async () => {
    const fixture = allocateLiveTestFixture(suite);
    const key = sentinelKey();
    await initialiseLiveCampaignFixture(fixture);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://unit-redis.invalid",
      expect.objectContaining({ method: "POST", redirect: "error" })
    );
    expect(mocks.execute).toHaveBeenCalledWith(["SET TRANSACTION READ ONLY"]);
    expect(mocks.query).toHaveBeenCalledOnce();
    const writes = commands.filter(
      (args) => args[0] === "EVAL" && args[1].includes("'NX'")
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].slice(2, 8)).toEqual([
      "3",
      "release:active-run",
      manifest.namespace,
      key,
      manifest.runId,
      JSON.stringify(manifest),
    ]);
    expect(JSON.parse(state.get(key) ?? "null")).toEqual({
      credentialDomainId: fixture.globalKey("campaign_domain"),
      databaseTargetHash: expect.any(String),
      version: 1,
    });
    expect(process.env.XERO_CREDENTIAL_DOMAIN_ID).toBe(
      fixture.globalKey("campaign_domain")
    );
    expect(process.env.VERCEL_GIT_COMMIT_SHA).toBe(manifest.candidateSha);
    expect(
      commands
        .flat()
        .some((part) =>
          part.includes(`xero:e2e:runtime:v1:${productionDomain}:`)
        )
    ).toBe(false);
    expect(commands.filter((args) => args[2] === "3")).toHaveLength(2);
  });
  it("uses the protected child dedicated KV pair without injecting regular limiter credentials", async () => {
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    vi.stubEnv("TC_TEST_KV_REST_API_URL", "https://fixture-redis.invalid");
    vi.stubEnv("TC_TEST_KV_REST_API_TOKEN", "unit-fixture-token");
    const fixture = allocateLiveTestFixture(suite);
    await initialiseLiveCampaignFixture(fixture);
    expect(mocks.fetch).toHaveBeenCalled();
    for (const [url, options] of mocks.fetch.mock.calls) {
      expect(url).toBe("https://fixture-redis.invalid");
      expect(new Headers(options.headers).get("Authorization")).toBe(
        "Bearer unit-fixture-token"
      );
    }
    expect(state.has(sentinelKey())).toBe(true);
    expect(process.env.KV_REST_API_URL).toBeUndefined();
    expect(process.env.KV_REST_API_TOKEN).toBeUndefined();
  });
  it.each(["TC_TEST_KV_REST_API_URL", "TC_TEST_KV_REST_API_TOKEN"])(
    "rejects an incomplete dedicated pair with only %s and never falls back to regular KV",
    async (key) => {
      vi.stubEnv("KV_REST_API_URL", "https://ordinary-redis.invalid");
      vi.stubEnv("KV_REST_API_TOKEN", "unit-ordinary-token");
      vi.stubEnv("TC_TEST_KV_REST_API_URL", undefined);
      vi.stubEnv("TC_TEST_KV_REST_API_TOKEN", undefined);
      vi.stubEnv(
        key,
        key.endsWith("URL")
          ? "https://fixture-redis.invalid"
          : "unit-fixture-token"
      );
      await expect(
        initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
      ).rejects.toThrow();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );
  it("rejects dedicated credentials without current protected runner proof before any transport", async () => {
    const fixture = allocateLiveTestFixture(suite);
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    vi.stubEnv("TC_TEST_KV_REST_API_URL", "https://fixture-redis.invalid");
    vi.stubEnv("TC_TEST_KV_REST_API_TOKEN", "unit-fixture-token");
    vi.stubEnv("TC_RELEASE_ACTIVE_RUN_VERIFIED", undefined);
    await expect(initialiseLiveCampaignFixture(fixture)).rejects.toThrow(
      "protected manifest"
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["production", "development"])(
    "rejects %s execution although the general database guard allows production",
    async (mode) => {
      const fixture = allocateLiveTestFixture(suite);
      vi.stubEnv("NODE_ENV", mode);
      await expect(initialiseLiveCampaignFixture(fixture)).rejects.toThrow(
        "protected online test runner"
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );
  it("uses the real live guard and refuses missing durable/active runner verification", async () => {
    const fixture = allocateLiveTestFixture(suite);
    vi.stubEnv("TC_RELEASE_ACTIVE_RUN_VERIFIED", undefined);
    await expect(initialiseLiveCampaignFixture(fixture)).rejects.toThrow(
      "protected manifest"
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("refuses world-readable and symlinked authority files before KV access", async () => {
    const fixture = allocateLiveTestFixture(suite);
    chmodSync(path, 0o644);
    await expect(initialiseLiveCampaignFixture(fixture)).rejects.toThrow(
      "protected online manifest"
    );
    chmodSync(path, 0o600);
    const link = join(directory, "linked.json");
    symlinkSync(path, link);
    vi.stubEnv("TC_RELEASE_MANIFEST", link);
    await expect(initialiseLiveCampaignFixture(fixture)).rejects.toThrow(
      "protected online manifest"
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects empty, foreign or stolen suite allocations before initialising any key", async () => {
    const fixture = allocateLiveTestFixture(suite);
    for (const altered of [
      { ...fixture, tenants: [] },
      {
        ...fixture,
        tenants: [{ clerkOrgId: "org_foreign", organisationId: uuid() }],
      },
      { ...fixture, globalKey: () => uuid() },
      { ...fixture, runId: uuid() },
    ]) {
      await expect(initialiseLiveCampaignFixture(altered)).rejects.toThrow();
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects the configured domain even if a malformed allocation includes it and its sentinel is absent", async () => {
    const old = allocateLiveTestFixture(suite).globalKey("campaign_domain");
    manifest.owned.globalKeys = manifest.owned.globalKeys.map((key) =>
      key === `campaign_domain:${old}`
        ? `campaign_domain:${productionDomain}`
        : key
    );
    saveManifest();
    await expect(
      initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
    ).rejects.toThrow("not isolated");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["owner", "manifest"])(
    "refuses a changed durable %s before database access",
    async (kind) => {
      const fixture = allocateLiveTestFixture(suite);
      state.set(
        kind === "owner" ? "release:active-run" : manifest.namespace,
        kind === "owner" ? uuid() : "{}"
      );
      await expect(initialiseLiveCampaignFixture(fixture)).rejects.toThrow();
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );
  it.each(["projectId", "branchId", "endpointId", "role", "database"])(
    "refuses a mismatched live SQL %s before sentinel writes",
    async (field) => {
      const { hostname, ...identity } = manifest.target;
      mocks.query.mockResolvedValue([{ ...identity, [field]: "foreign" }]);
      await expect(
        initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
      ).rejects.toThrow("live database identity");
      expect(commands.filter((args) => args[1]?.includes("'NX'"))).toHaveLength(
        0
      );
    }
  );
  it("does not overwrite an existing sentinel", async () => {
    const key = sentinelKey();
    state.set(key, "existing-protected-value");
    await expect(
      initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
    ).rejects.toThrow("not established");
    expect(state.get(key)).toBe("existing-protected-value");
    expect(process.env.XERO_CREDENTIAL_DOMAIN_ID).toBe(productionDomain);
  });
  it.each(["owner", "manifest"])(
    "atomic initialisation rejects %s changing after the preliminary checks",
    async (kind) => {
      mocks.fetch.mockImplementation((_url: unknown, options?: RequestInit) => {
        const args: string[] = JSON.parse(String(options?.body));
        commands.push(args);
        if (args[1]?.includes("'NX'")) {
          state.set(
            kind === "owner" ? "release:active-run" : manifest.namespace,
            kind === "owner" ? uuid() : "{}"
          );
        }
        return Promise.resolve(Response.json({ result: response(args) }));
      });
      const key = sentinelKey();
      await expect(
        initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
      ).rejects.toThrow("not established");
      expect(state.has(key)).toBe(false);
    }
  );
  it("revalidates the durable manifest after sentinel creation before changing runtime configuration", async () => {
    mocks.fetch.mockImplementation((_url: unknown, options?: RequestInit) => {
      const args: string[] = JSON.parse(String(options?.body));
      commands.push(args);
      const result = response(args);
      if (args[1]?.includes("'NX'")) {
        state.set(manifest.namespace, "{}");
      }
      return Promise.resolve(Response.json({ result }));
    });
    await expect(
      initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
    ).rejects.toThrow("read-back differs");
    expect(process.env.XERO_CREDENTIAL_DOMAIN_ID).toBe(productionDomain);
    expect(process.env.VERCEL_GIT_COMMIT_SHA).toBe("b".repeat(40));
  });
  it("rejects a missing default KV response and never falls back to an in-memory store", async () => {
    mocks.fetch.mockRejectedValue(new Error("Offline unit transport"));
    await expect(
      initialiseLiveCampaignFixture(allocateLiveTestFixture(suite))
    ).rejects.toThrow("authority read failed");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

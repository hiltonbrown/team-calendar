import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { xeroCampaignTargetHash } from "../../packages/database/src/xero-campaign-contract.js";
import { parseReleaseManifest } from "./database-guard.js";
import { parseXeroExecutionManifest } from "./xero-execution-guard.js";
import {
  assertXeroObserverBindings,
  requireXeroObserverAuthority,
  withXeroReadOnlyObservation,
  type XeroObserverBindings,
} from "./xero-observer-authority.js";

const verification = vi.hoisted(() => ({
  context: vi.fn(),
  database: vi.fn(() => Promise.resolve()),
  execution: vi.fn(() => Promise.resolve()),
  observation: vi.fn((_scope: unknown, operation: () => Promise<unknown>) =>
    operation()
  ),
  owner: vi.fn(() => Promise.resolve()),
  runtime: vi.fn(),
}));
vi.mock("./xero-execution-guard.js", async (original) => ({
  ...(await original<typeof import("./xero-execution-guard.js")>()),
  requireXeroRunnerContext: verification.context,
}));
vi.mock("./database-guard.js", async (original) => ({
  ...(await original<typeof import("./database-guard.js")>()),
  assertDurableManifestReadBack: verification.database,
}));
vi.mock("./active-run-registry.js", () => ({
  assertActiveRunOwner: verification.owner,
}));
vi.mock("./xero-execution-manifest-store.js", () => ({
  assertDurableXeroExecutionManifestReadBack: verification.execution,
}));
vi.mock("../../packages/database/src/xero-campaign-access.js", () => ({
  assertXeroCampaignAuthority: verification.runtime,
  withXeroCampaignObservation: verification.observation,
}));

const runId = "70000000-0000-4000-8000-000000000001";
const databaseRunId = "70000000-0000-4000-8000-000000000002";
const organisationId = "70000000-0000-4000-8000-000000000003";
const tenantId = "70000000-0000-4000-8000-000000000004";
const candidateSha = "a".repeat(40);

function bindings(): XeroObserverBindings {
  const databaseManifest = parseReleaseManifest({
    active: true,
    candidateSha,
    durableManifestConfirmed: true,
    mode: "database-fixture",
    namespace: `release:run:${databaseRunId}`,
    owned: { clerkOrgIds: ["org_owned"], organisationIds: [organisationId] },
    pausedConsumers: {},
    restoreEvidence: {
      observedAt: "2026-09-29T00:00:00.000Z",
      reference: "synthetic-reference",
    },
    runId: databaseRunId,
    target: {
      branchId: "branch",
      database: "fixture",
      endpointId: "endpoint",
      hostname: "fixture.example.neon.tech",
      projectId: "project",
      role: "observer",
    },
    version: 1,
  });
  const manifest = parseXeroExecutionManifest({
    candidateSha,
    contractDecision: "au-contract-v1",
    databaseManifest,
    dateWindow: { from: "2026-10-01", until: "2026-10-10" },
    deployments: {
      api: "https://api.example.test",
      app: "https://app.example.test",
      web: "https://www.example.test",
    },
    environment: "fixture",
    mode: "xero-e2e",
    owned: [
      {
        alias: "fixture-primary",
        bindingGeneration: 2,
        clerkOrgId: "org_owned",
        cohort: "A",
        employeeIds: ["70000000-0000-4000-8000-000000000005"],
        independentRecoveryAlias: null,
        leaveTypeIds: ["70000000-0000-4000-8000-000000000006"],
        maximumMutations: 1,
        organisationId,
        permittedOperations: ["read"],
        xeroTenantId: tenantId,
      },
    ],
    runId,
    version: 2,
    workers: {
      allowedFunctions: ["sync-xero-people"],
      drainRequired: true,
      environmentId: "fixture",
      expectedRevision: candidateSha,
      fenceGeneration: 1,
      priorState: { "sync-xero-people": false },
      restoreRequired: true,
    },
  });
  return {
    context: {
      appUrl: manifest.deployments.app,
      candidateSha,
      createdAt: "2026-09-29T00:00:00.000Z",
      expiresAt: "2026-09-29T01:00:00.000Z",
      manifestHash: "b".repeat(64),
      nonce: "70000000-0000-4000-8000-000000000007",
      output: "/private/fixture",
      runId,
      runnerPid: 1,
      verifiedFenceReference: `sha256:${"c".repeat(64)}`,
      version: 1,
    },
    databaseManifest,
    databaseUrl:
      "postgresql://observer:synthetic@fixture.example.neon.tech/fixture",
    fixtureAlias: "fixture-primary",
    manifest,
  };
}

function transport() {
  const input = bindings();
  const identity = {
    ...input.databaseManifest.target,
    readOnly: "on",
    timezone: "UTC",
  };
  const query = vi.fn(
    async (sql: string): Promise<unknown> =>
      sql.startsWith("SELECT") ? { rows: [identity] } : { rows: [] }
  );
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  return {
    assertCurrent: vi.fn(() => Promise.resolve()),
    client,
    databaseManifest: input.databaseManifest,
    identity,
    pool,
  };
}

describe("separate Xero observer ownership", () => {
  it("accepts exact read ownership without claiming ordinary paused-worker authority", () => {
    const input = bindings();
    expect(input.databaseManifest.pauseWindow).toBeUndefined();
    expect(assertXeroObserverBindings(input).fixture.organisationId).toBe(
      organisationId
    );
  });

  it.each(["runId", "candidateSha", "appUrl"] as const)(
    "rejects changed runner %s",
    (key) => {
      const input = bindings();
      input.context[key] = "foreign";
      expect(() => assertXeroObserverBindings(input)).toThrow();
    }
  );

  it.each([
    "postgresql://observer:synthetic@foreign.example.neon.tech/fixture",
    "postgresql://foreign:synthetic@fixture.example.neon.tech/fixture",
    "postgresql://observer:synthetic@fixture.example.neon.tech/foreign",
  ])("rejects a foreign database connection", (databaseUrl) => {
    expect(() =>
      assertXeroObserverBindings({ ...bindings(), databaseUrl })
    ).toThrow();
  });

  it("rejects local database authority differing from the immutable embedded copy", () => {
    const input = bindings();
    input.databaseManifest = {
      ...input.databaseManifest,
      owned: { ...input.databaseManifest.owned, globalKeys: ["foreign"] },
    };
    expect(() => assertXeroObserverBindings(input)).toThrow();
  });

  it("rejects a namespace belonging to another database run", () => {
    const input = bindings();
    input.databaseManifest.namespace = `release:run:${runId}`;
    expect(() => assertXeroObserverBindings(input)).toThrow();
  });

  it("rejects missing and read-disabled fixtures", () => {
    const input = bindings();
    expect(() =>
      assertXeroObserverBindings({ ...input, fixtureAlias: "fixture-foreign" })
    ).toThrow();
    const [fixture] = input.manifest.owned;
    if (!fixture) {
      throw new Error("Missing test fixture");
    }
    fixture.permittedOperations = ["create"];
    expect(() => assertXeroObserverBindings(input)).toThrow();
  });
});

describe("read-only independent observations", () => {
  it("uses one read-only repeatable-read connection and verifies authority around the observation", async () => {
    const test = transport();
    const observe = vi.fn((client: typeof test.client) => {
      expect(client).toBe(test.client);
      expect(test.assertCurrent).toHaveBeenCalledTimes(2);
      return Promise.resolve("observed");
    });
    await expect(withXeroReadOnlyObservation(test, observe)).resolves.toBe(
      "observed"
    );
    expect(test.client.query.mock.calls[0]).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    ]);
    expect(test.client.query.mock.calls[1]).toEqual([
      "SET LOCAL TIME ZONE 'UTC'",
    ]);
    expect(test.client.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
    expect(test.assertCurrent).toHaveBeenCalledTimes(3);
    expect(test.client.release).toHaveBeenCalledOnce();
  });

  it("does not open a database connection after revoked authority", async () => {
    const test = transport();
    test.assertCurrent.mockRejectedValueOnce(new Error("revoked"));
    const observe = vi.fn();
    await expect(withXeroReadOnlyObservation(test, observe)).rejects.toThrow(
      "revoked"
    );
    expect(test.pool.connect).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it.each([
    "projectId",
    "branchId",
    "endpointId",
    "database",
    "role",
    "readOnly",
    "timezone",
  ] as const)(
    "rejects SQL %s drift before observing tenant data",
    async (key) => {
      const test = transport();
      test.identity[key] = "foreign";
      const observe = vi.fn();
      await expect(
        withXeroReadOnlyObservation(test, observe)
      ).rejects.toThrow();
      expect(observe).not.toHaveBeenCalled();
      expect(test.client.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
      expect(test.client.release).toHaveBeenCalledOnce();
    }
  );

  it("discards a completed observation if fresh authority changes during its query", async () => {
    const test = transport();
    const observe = vi.fn(() => {
      test.assertCurrent.mockRejectedValueOnce(new Error("fence replaced"));
      return Promise.resolve("must not publish");
    });
    await expect(withXeroReadOnlyObservation(test, observe)).rejects.toThrow(
      "fence replaced"
    );
    expect(test.client.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
    expect(test.client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases when the observation fails", async () => {
    const test = transport();
    await expect(
      withXeroReadOnlyObservation(test, () =>
        Promise.reject(new Error("query failed"))
      )
    ).rejects.toThrow("query failed");
    expect(test.client.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
    expect(test.client.release).toHaveBeenCalledOnce();
  });

  it("releases the checked-out client even if rollback fails", async () => {
    const test = transport();
    test.client.query.mockImplementation((sql) => {
      if (sql === "ROLLBACK") {
        return Promise.reject(new Error("rollback failed"));
      }
      return Promise.resolve({ rows: [test.identity] });
    });
    await expect(
      withXeroReadOnlyObservation(test, async () => "observation")
    ).rejects.toThrow("rollback failed");
    expect(test.client.release).toHaveBeenCalledOnce();
  });
});

function protectedFiles() {
  vi.clearAllMocks();
  verification.database.mockResolvedValue(undefined);
  verification.owner.mockResolvedValue(undefined);
  verification.execution.mockResolvedValue(undefined);
  const input = bindings();
  const folder = mkdtempSync(join(tmpdir(), "xero-observer-authority-"));
  chmodSync(folder, 0o700);
  const databasePath = join(folder, "database.json");
  const executionPath = join(folder, "execution.json");
  const executionBytes = JSON.stringify(input.manifest);
  input.context.manifestHash = createHash("sha256")
    .update(executionBytes)
    .digest("hex");
  writeFileSync(databasePath, JSON.stringify(input.databaseManifest), {
    mode: 0o600,
  });
  writeFileSync(executionPath, executionBytes, { mode: 0o600 });
  verification.context.mockReturnValue(input.context);
  const control = {
    databaseRunId,
    databaseTargetHash: xeroCampaignTargetHash(input.databaseManifest.target),
    manifestHash: input.context.manifestHash,
    registrationReference: input.context.verifiedFenceReference,
  };
  verification.runtime.mockResolvedValue(control);
  const environment: NodeJS.ProcessEnv = {
    DATABASE_URL: input.databaseUrl,
    KV_REST_API_TOKEN: "synthetic-store-token",
    KV_REST_API_URL: "https://kv.example.test",
    NODE_ENV: "test",
    TC_RELEASE_ACTIVE_RUN_VERIFIED: databaseRunId,
    TC_RELEASE_DURABLE_VERIFIED: databaseRunId,
    TC_RELEASE_MANIFEST: databasePath,
    TC_RELEASE_RUN_ID: databaseRunId,
    TC_XERO_MANIFEST: executionPath,
    XERO_CREDENTIAL_DOMAIN_ID: "70000000-0000-4000-8000-000000000008",
  };
  return {
    cleanup: () => rmSync(folder, { force: true, recursive: true }),
    control,
    databasePath,
    environment,
    executionPath,
    input,
  };
}

describe("fresh durable observer authority", () => {
  it("checks the actual owner, both durable manifests and exact runtime scope", async () => {
    const test = protectedFiles();
    try {
      const authority = await requireXeroObserverAuthority(
        "fixture-primary",
        test.environment
      );
      expect(verification.database).toHaveBeenCalledOnce();
      expect(verification.execution).toHaveBeenCalledOnce();
      expect(verification.owner).toHaveBeenCalledOnce();
      expect(verification.runtime.mock.calls[0]?.[0]).toEqual({
        bindingGeneration: 2,
        candidateSha,
        clerkOrgId: "org_owned",
        epoch: 1,
        externalTenantId: tenantId,
        organisationId,
        phases: ["active"],
        runId,
      });
      await authority.assertCurrent();
      expect(verification.owner).toHaveBeenCalledTimes(2);
      expect(verification.runtime).toHaveBeenCalledTimes(2);
    } finally {
      test.cleanup();
    }
  });

  it.each(["database", "execution", "owner"] as const)(
    "rejects missing %s proof despite matching environment receipts",
    async (proof) => {
      const test = protectedFiles();
      try {
        verification[proof].mockRejectedValueOnce(
          new Error("durable authority missing")
        );
        await expect(
          requireXeroObserverAuthority("fixture-primary", test.environment)
        ).rejects.toThrow("durable authority missing");
        expect(verification.runtime).not.toHaveBeenCalled();
      } finally {
        test.cleanup();
      }
    }
  );

  it.each([
    "databaseRunId",
    "databaseTargetHash",
    "manifestHash",
    "registrationReference",
  ] as const)("rejects mismatched runtime %s", async (field) => {
    const test = protectedFiles();
    try {
      verification.runtime.mockResolvedValue({
        ...test.control,
        [field]: "foreign",
      });
      await expect(
        requireXeroObserverAuthority("fixture-primary", test.environment)
      ).rejects.toThrow("runtime authority changed");
    } finally {
      test.cleanup();
    }
  });

  it.each(["databasePath", "executionPath"] as const)(
    "rejects local %s tampering after initial admission",
    async (path) => {
      const test = protectedFiles();
      try {
        const authority = await requireXeroObserverAuthority(
          "fixture-primary",
          test.environment
        );
        writeFileSync(test[path], "{}", { mode: 0o600 });
        await expect(authority.assertCurrent()).rejects.toThrow(
          "immutable authority changed"
        );
        expect(verification.owner).toHaveBeenCalledOnce();
      } finally {
        test.cleanup();
      }
    }
  );

  it("runs provider reads only inside the explicit read-only runtime context", async () => {
    const test = protectedFiles();
    try {
      const authority = await requireXeroObserverAuthority(
        "fixture-primary",
        test.environment
      );
      const observation = vi.fn(() => Promise.resolve("raw provider read"));
      await expect(authority.observeProvider(observation)).resolves.toBe(
        "raw provider read"
      );
      expect(verification.observation).toHaveBeenCalledOnce();
      expect(verification.observation.mock.calls[0]?.[0]).toEqual(
        verification.runtime.mock.calls[0]?.[0]
      );
      expect(observation).toHaveBeenCalledOnce();
      expect(verification.runtime).toHaveBeenCalledTimes(3);
    } finally {
      test.cleanup();
    }
  });

  it("discards a provider result if authority changes during the request", async () => {
    const test = protectedFiles();
    try {
      const authority = await requireXeroObserverAuthority(
        "fixture-primary",
        test.environment
      );
      await expect(
        authority.observeProvider(() => {
          verification.runtime.mockRejectedValueOnce(
            new Error("fence replaced during provider read")
          );
          return Promise.resolve("must not publish");
        })
      ).rejects.toThrow("fence replaced during provider read");
    } finally {
      test.cleanup();
    }
  });

  it("rejects runtime revocation after an initially valid observation authority", async () => {
    const test = protectedFiles();
    try {
      const authority = await requireXeroObserverAuthority(
        "fixture-primary",
        test.environment
      );
      verification.runtime.mockRejectedValueOnce(new Error("runtime revoked"));
      await expect(authority.assertCurrent()).rejects.toThrow(
        "runtime revoked"
      );
    } finally {
      test.cleanup();
    }
  });
});

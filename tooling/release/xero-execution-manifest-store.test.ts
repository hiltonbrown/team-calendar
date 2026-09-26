import { afterEach, describe, expect, it, vi } from "vitest";
import { parseXeroExecutionManifest } from "./xero-execution-guard.js";
import {
  assertDurableXeroExecutionManifestReadBack,
  persistXeroExecutionManifest,
} from "./xero-execution-manifest-store.js";

const runId = "70000000-0000-4000-8000-000000000001";
const databaseRunId = "70000000-0000-4000-8000-000000000002";
const firstOrganisationId = "70000000-0000-4000-8000-000000000003";
const secondOrganisationId = "70000000-0000-4000-8000-000000000004";
const candidateSha = "a".repeat(40);
const key = `xero:e2e:manifest:${runId}`;
const safeConfig = {
  token: "synthetic-store-token",
  url: "https://kv.example.test/",
};

function makeManifest() {
  return {
    candidateSha,
    contractDecision: "au-contract-v1",
    databaseManifest: {
      active: true,
      candidateSha,
      durableManifestConfirmed: true,
      mode: "database-fixture",
      namespace: `release:run:${databaseRunId}`,
      owned: {
        clerkOrgIds: ["org_fixture_primary", "org_fixture_secondary"],
        globalKeys: [],
        organisationIds: [firstOrganisationId, secondOrganisationId],
      },
      pausedConsumers: {},
      restoreEvidence: {
        observedAt: "2026-09-27T00:00:00.000Z",
        reference: "synthetic-restore-reference",
      },
      runId: databaseRunId,
      target: {
        branchId: "synthetic-branch",
        database: "fixture_database",
        endpointId: "synthetic-endpoint",
        hostname: "synthetic.example.neon.tech",
        projectId: "synthetic-project",
        role: "fixture_role",
      },
      version: 1,
    },
    dateWindow: { from: "2026-10-01", until: "2026-10-10" },
    deployments: {
      api: "https://api.fixture.example.test",
      app: "https://app.fixture.example.test",
      web: "https://web.fixture.example.test",
    },
    environment: "fixture-candidate",
    mode: "xero-e2e",
    owned: [
      {
        alias: "fixture-primary",
        bindingGeneration: 2,
        clerkOrgId: "org_fixture_primary",
        cohort: "A",
        employeeIds: ["70000000-0000-4000-8000-000000000006"],
        independentRecoveryAlias: null,
        leaveTypeIds: ["70000000-0000-4000-8000-000000000007"],
        maximumMutations: 3,
        organisationId: firstOrganisationId,
        permittedOperations: ["read", "create"],
        xeroTenantId: "70000000-0000-4000-8000-000000000005",
      },
      {
        alias: "fixture-secondary",
        bindingGeneration: 3,
        clerkOrgId: "org_fixture_secondary",
        cohort: "B",
        employeeIds: ["70000000-0000-4000-8000-000000000009"],
        independentRecoveryAlias: null,
        leaveTypeIds: ["70000000-0000-4000-8000-000000000010"],
        maximumMutations: 0,
        organisationId: secondOrganisationId,
        permittedOperations: ["read"],
        xeroTenantId: "70000000-0000-4000-8000-000000000008",
      },
    ],
    runId,
    version: 2,
    workers: {
      allowedFunctions: ["sync-xero-people", "sync-xero-leave-records"],
      drainRequired: true,
      environmentId: "synthetic-worker-environment",
      expectedRevision: candidateSha,
      fenceGeneration: 4,
      priorState: {
        "sync-xero-leave-records": false,
        "sync-xero-people": true,
      },
      restoreRequired: true,
    },
  };
}

type ManifestFixture = ReturnType<typeof makeManifest>;
function primaryFixture(manifest: ManifestFixture) {
  const [primary] = manifest.owned;
  if (!primary) {
    throw new Error("Missing primary fixture");
  }
  return primary;
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([name, entry]) => [name, reverseObjectKeys(entry)])
    );
  }
  return value;
}

function reader(value: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ result: JSON.stringify(value) }));
}

async function expectSafeFailure(promise: Promise<void>, message: string) {
  const failure: unknown = await promise.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) {
    throw new Error("Expected a rejected operation");
  }
  expect(failure.message).toBe(message);
  expect(failure.cause).toBeUndefined();
}

afterEach(() => vi.unstubAllGlobals());

describe("protected Xero execution manifest store", () => {
  it("persists a v2 manifest once with NX and verifies exact read-back", async () => {
    const manifest = makeManifest();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: "OK" }))
      .mockResolvedValueOnce(
        Response.json({ result: JSON.stringify(manifest) })
      );
    await expect(
      persistXeroExecutionManifest(manifest, { ...safeConfig, fetchImpl })
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://kv.example.test");
    const command: unknown[] = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body)
    );
    expect(command[0]).toBe("SET");
    expect(command[1]).toBe(key);
    expect(JSON.parse(String(command[2]))).toEqual(
      parseXeroExecutionManifest(manifest)
    );
    expect(command[3]).toBe("NX");
    expect(command).toHaveLength(4);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `https://kv.example.test/get/${encodeURIComponent(key)}`
    );
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({
        cache: "no-store",
        headers: { Authorization: "Bearer synthetic-store-token" },
        redirect: "error",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("uses an injected default fetch without making any real requests", async () => {
    const fetchImpl = reader(makeManifest());
    vi.stubGlobal("fetch", fetchImpl);
    await expect(
      assertDurableXeroExecutionManifestReadBack(makeManifest(), safeConfig)
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("compares nested object keys canonically, including nested v1 ownership", async () => {
    const manifest = makeManifest();
    await expect(
      assertDurableXeroExecutionManifestReadBack(reverseObjectKeys(manifest), {
        ...safeConfig,
        fetchImpl: reader(manifest),
      })
    ).resolves.toBeUndefined();
    await expect(
      assertDurableXeroExecutionManifestReadBack(manifest, {
        ...safeConfig,
        fetchImpl: reader(reverseObjectKeys(manifest)),
      })
    ).resolves.toBeUndefined();
  });

  const mutations: [string, (manifest: ManifestFixture) => void][] = [
    [
      "mode",
      (manifest) => {
        manifest.mode = "database-fixture";
      },
    ],
    [
      "version",
      (manifest) => {
        manifest.version = 1;
      },
    ],
    [
      "run",
      (manifest) => {
        manifest.runId = "70000000-0000-4000-8000-000000000011";
      },
    ],
    [
      "candidate",
      (manifest) => {
        manifest.candidateSha = "b".repeat(40);
        manifest.databaseManifest.candidateSha = manifest.candidateSha;
        manifest.workers.expectedRevision = manifest.candidateSha;
      },
    ],
    [
      "owned Clerk/organisation pair",
      (manifest) => {
        primaryFixture(manifest).clerkOrgId = "org_fixture_secondary";
        primaryFixture(manifest).organisationId = secondOrganisationId;
      },
    ],
    [
      "employee",
      (manifest) => {
        primaryFixture(manifest).employeeIds[0] =
          "70000000-0000-4000-8000-000000000012";
      },
    ],
    [
      "leave type",
      (manifest) => {
        primaryFixture(manifest).leaveTypeIds[0] =
          "70000000-0000-4000-8000-000000000013";
      },
    ],
    [
      "budget",
      (manifest) => {
        primaryFixture(manifest).maximumMutations += 1;
      },
    ],
    [
      "date window",
      (manifest) => {
        manifest.dateWindow.until = "2026-10-11";
      },
    ],
    [
      "worker generation",
      (manifest) => {
        manifest.workers.fenceGeneration += 1;
      },
    ],
    [
      "prior worker state",
      (manifest) => {
        manifest.workers.priorState["sync-xero-people"] = false;
      },
    ],
    [
      "function revision",
      (manifest) => {
        manifest.workers.expectedRevision = "b".repeat(40);
      },
    ],
    [
      "binding generation",
      (manifest) => {
        primaryFixture(manifest).bindingGeneration += 1;
      },
    ],
    [
      "allowed functions",
      (manifest) => {
        manifest.workers.allowedFunctions.push("sync-xero-leave-balances");
      },
    ],
    [
      "drain obligation",
      (manifest) => {
        manifest.workers.drainRequired = false;
      },
    ],
    [
      "restore obligation",
      (manifest) => {
        manifest.workers.restoreRequired = false;
      },
    ],
    [
      "operation array order",
      (manifest) => {
        primaryFixture(manifest).permittedOperations.reverse();
      },
    ],
    [
      "owned array order",
      (manifest) => {
        manifest.owned.reverse();
      },
    ],
  ];
  it.each(mutations)(
    "rejects modified durable %s evidence",
    async (name, mutate) => {
      const durable = makeManifest();
      mutate(durable);
      const invalidFields = new Set([
        "mode",
        "version",
        "function revision",
        "drain obligation",
        "restore obligation",
      ]);
      const expectedError = invalidFields.has(name)
        ? "Protected Xero durable manifest is invalid"
        : "Durable Xero manifest does not match the local protected copy";
      if (!invalidFields.has(name)) {
        expect(() => parseXeroExecutionManifest(durable)).not.toThrow();
      }
      await expect(
        assertDurableXeroExecutionManifestReadBack(makeManifest(), {
          ...safeConfig,
          fetchImpl: reader(durable),
        })
      ).rejects.toThrow(expectedError);
    }
  );

  it.each(["mode", "version"])(
    "rejects local foreign %s before any store request",
    async (field) => {
      const manifest = makeManifest();
      const local = {
        ...manifest,
        [field]: field === "mode" ? "database-fixture" : 1,
      };
      const fetchImpl = reader(manifest);
      await expect(
        persistXeroExecutionManifest(local, { ...safeConfig, fetchImpl })
      ).rejects.toThrow("Protected Xero local manifest is invalid");
      await expect(
        assertDurableXeroExecutionManifestReadBack(local, {
          ...safeConfig,
          fetchImpl,
        })
      ).rejects.toThrow("Protected Xero local manifest is invalid");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("never overwrites an existing run namespace or attempts read-back after NX fails", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ result: null }));
    await expect(
      persistXeroExecutionManifest(makeManifest(), { ...safeConfig, fetchImpl })
    ).rejects.toThrow("namespace already exists");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects missing durable evidence", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ result: null }));
    await expect(
      assertDurableXeroExecutionManifestReadBack(makeManifest(), {
        ...safeConfig,
        fetchImpl,
      })
    ).rejects.toThrow("Durable Xero manifest is missing");
  });

  it.each([
    {
      name: "credentials",
      url: "https://private-user:private-password@kv.example.test",
    },
    { name: "insecure protocol", url: "http://kv.example.test" },
    { name: "query", url: "https://kv.example.test/?token=private-token" },
    { name: "fragment", url: "https://kv.example.test/#private-token" },
    { name: "malformed URL", url: "private-url-value" },
  ])("rejects $name in configuration without exposing it", async ({ url }) => {
    const fetchImpl = reader(makeManifest());
    await expectSafeFailure(
      assertDurableXeroExecutionManifestReadBack(makeManifest(), {
        ...safeConfig,
        fetchImpl,
        url,
      }),
      "Durable Xero manifest KV configuration is invalid"
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([0, -1, 15_001, 1.5, Number.NaN])(
    "rejects an unbounded timeout %s",
    async (timeoutMs) => {
      const fetchImpl = reader(makeManifest());
      await expect(
        persistXeroExecutionManifest(makeManifest(), {
          ...safeConfig,
          fetchImpl,
          timeoutMs,
        })
      ).rejects.toThrow("KV configuration is invalid");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it.each(["", "  ", "private-token\r\nInjected: header"])(
    "rejects unsafe token configuration %#",
    async (token) => {
      const fetchImpl = reader(makeManifest());
      await expect(
        persistXeroExecutionManifest(makeManifest(), {
          ...safeConfig,
          fetchImpl,
          token,
        })
      ).rejects.toThrow("KV configuration is invalid");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it.each(["persistence", "read-back"] as const)(
    "masks network and HTTP %s failures",
    async (operation) => {
      const run =
        operation === "persistence"
          ? persistXeroExecutionManifest
          : assertDurableXeroExecutionManifestReadBack;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(
          new Error(
            "https://private-user:private-password@kv.example.test private-token"
          )
        );
      await expectSafeFailure(
        run(makeManifest(), { ...safeConfig, fetchImpl }),
        `Durable Xero manifest ${operation} failed`
      );
      fetchImpl.mockResolvedValueOnce(
        Response.json({ error: "private-provider-response" }, { status: 503 })
      );
      await expectSafeFailure(
        run(makeManifest(), { ...safeConfig, fetchImpl }),
        `Durable Xero manifest ${operation} failed`
      );
    }
  );

  it.each([
    {
      name: "malformed JSON",
      response: () => new Response("private-invalid-response"),
    },
    {
      name: "wrong envelope",
      response: () => Response.json({ result: { private: "private-payload" } }),
    },
    {
      name: "provider error",
      response: () => Response.json({ error: "private-error", result: "OK" }),
    },
  ])("fails closed on $name responses", async ({ response }) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response());
    await expect(
      persistXeroExecutionManifest(makeManifest(), { ...safeConfig, fetchImpl })
    ).rejects.toThrow("Durable Xero manifest persistence failed");
    await expect(
      assertDurableXeroExecutionManifestReadBack(makeManifest(), {
        ...safeConfig,
        fetchImpl,
      })
    ).rejects.toThrow("Durable Xero manifest read-back failed");
  });

  it("masks malformed durable JSON and sensitive parser inputs", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: "private-invalid-json" }))
      .mockResolvedValueOnce(
        Response.json({
          result: JSON.stringify({ privateToken: "private-token" }),
        })
      );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        assertDurableXeroExecutionManifestReadBack(makeManifest(), {
          ...safeConfig,
          fetchImpl,
        })
      ).rejects.toThrow("Protected Xero durable manifest is invalid");
    }
  });

  it("requires exact read-back after a successful SET", async () => {
    const durable = makeManifest();
    durable.workers.fenceGeneration += 1;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: "OK" }))
      .mockResolvedValueOnce(
        Response.json({ result: JSON.stringify(durable) })
      );
    await expect(
      persistXeroExecutionManifest(makeManifest(), { ...safeConfig, fetchImpl })
    ).rejects.toThrow("does not match the local protected copy");
  });

  it("bounds requests with an abort signal and masks abort failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private-timeout-detail")),
            { once: true }
          );
        })
    );
    await expect(
      assertDurableXeroExecutionManifestReadBack(makeManifest(), {
        ...safeConfig,
        fetchImpl,
        timeoutMs: 10,
      })
    ).rejects.toThrow("Durable Xero manifest read-back failed");
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runXeroE2e,
  superviseXeroBrowser,
  type XeroRunnerDependencies,
} from "./run-xero-e2e.js";
import { readXeroExecutionManifest } from "./xero-execution-guard.js";
import {
  dispatchXeroIntent,
  readXeroLedger,
  recordXeroIntent,
  type XeroLedgerEntry,
} from "./xero-ledger.js";
import { writeXeroReport } from "./xero-report.js";

const cleanupPaths: string[] = [];
function manifest() {
  const root = resolve("tooling/release/test-results");
  mkdirSync(root, { mode: 0o700, recursive: true });
  chmodSync(root, 0o700);
  const dir = mkdtempSync(`${root}/cli-`);
  cleanupPaths.push(dir);
  const runId = randomUUID();
  const org = randomUUID();
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const value = {
    candidateSha: sha,
    contractDecision: "au-contract-v1",
    databaseManifest: {
      active: true,
      candidateSha: sha,
      durableManifestConfirmed: true,
      namespace: `release:run:${randomUUID()}`,
      owned: {
        clerkOrgIds: ["org_owned"],
        globalKeys: [],
        organisationIds: [org],
      },
      pausedConsumers: {},
      restoreEvidence: {
        observedAt: new Date().toISOString(),
        reference: "owned-restore",
      },
      runId: randomUUID(),
      target: {
        branchId: "owned",
        database: "owned",
        endpointId: "owned",
        hostname: "owned.neon.tech",
        projectId: "owned",
        role: "owned",
      },
      version: 1,
    },
    dateWindow: { from: "2026-10-01", until: "2026-10-03" },
    deployments: {
      api: "https://api.example",
      app: "https://app.example",
      web: "https://web.example",
    },
    environment: "owned-candidate",
    mode: "xero-e2e",
    owned: [
      {
        alias: "fixture-owned",
        bindingGeneration: 1,
        clerkOrgId: "org_owned",
        cohort: "A",
        employeeIds: [randomUUID()],
        independentRecoveryAlias: null,
        leaveTypeIds: [randomUUID()],
        maximumMutations: 2,
        organisationId: org,
        permittedOperations: ["read", "create"],
        xeroTenantId: randomUUID(),
      },
    ],
    runId,
    version: 2,
    workers: {
      allowedFunctions: ["sync-xero-people"],
      drainRequired: true,
      environmentId: "owned",
      expectedRevision: sha,
      fenceGeneration: 1,
      priorState: {},
      restoreRequired: true,
    },
  };
  const path = resolve(dir, "manifest.json");
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return { dir, path, runId };
}
function recordPaths(report: Awaited<ReturnType<typeof runXeroE2e>>) {
  const base = resolve(
    "reports/xero-e2e",
    `${report.json.startedAt.slice(0, 10)}-${report.json.runId}`
  );
  cleanupPaths.push(
    `${base}.json`,
    `${base}.md`,
    resolve("tooling/release/test-results", report.json.diagnosticRunId)
  );
}
afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});
describe("Xero runner diagnostic bootstrap", () => {
  it.each([
    { args: [] },
    { args: ["--invalid"] },
    { args: ["--manifest"] },
    { args: ["--manifest", "missing", "--recover", "--preflight"] },
  ])("accounts for every case on invalid CLI %j", async ({ args }) => {
    const report = await runXeroE2e(args);
    recordPaths(report);
    expect(report.exitCode).toBe(2);
    expect(report.json.scenarios).toHaveLength(26);
    expect(report.json.lifecycle.cases).toHaveLength(40);
    expect(
      report.json.scenarios.every((entry) => entry.startedAt === null)
    ).toBe(true);
  });
  it("an unreadable or malformed manifest emits both safe reports before environment/config loading", async () => {
    const input = manifest();
    writeFileSync(input.path, "not-json", { mode: 0o600 });
    const browser = vi.fn();
    const acquire = vi.fn();
    const importConfiguration = vi.fn();
    const report = await runXeroE2e(["--manifest", input.path, "--preflight"], {
      acquire,
      browser,
      importConfiguration,
    });
    recordPaths(report);
    expect(report.exitCode).toBe(2);
    expect(importConfiguration).not.toHaveBeenCalled();
    expect(browser).not.toHaveBeenCalled();
  });
  it("configuration-import failure is reported without browser or platform action", async () => {
    const input = manifest();
    const dependencies: XeroRunnerDependencies = {
      acquire: vi.fn(),
      assertDurable: () => Promise.resolve(),
      assertSource: vi.fn(),
      browser: vi.fn(),
      importConfiguration: vi.fn(() =>
        Promise.reject(new Error("Bearer private-config-value"))
      ),
    };
    const report = await runXeroE2e(["--manifest", input.path], dependencies);
    recordPaths(report);
    expect(report.exitCode).toBe(2);
    expect(report.json.limitations).toContain("configuration-unavailable");
    expect(JSON.stringify(report.json)).not.toContain("private-config");
    expect(dependencies.browser).not.toHaveBeenCalled();
  });
  it("default full startup refuses absent actual worker fencing", async () => {
    const input = manifest();
    const report = await runXeroE2e(["--manifest", input.path]);
    recordPaths(report);
    expect(report.exitCode).toBe(2);
    expect(report.json.limitations).toContain("missing-prerequisite");
  });
  it("a nonzero child followed by failed evidence collection remains FAIL and attempts cleanup", async () => {
    const input = manifest();
    const reference = `sha256:${"b".repeat(64)}`;
    const drain = vi.fn(async () => reference);
    const dependencies: XeroRunnerDependencies = {
      acquire: async () => ({
        cleanup: {
          cleanupLocal: async () => reference,
          cleanupRemote: async () => ({ disposition: "reconciled", reference }),
          drainOwnedWorkers: drain,
          observe: async () => [],
          releaseFence: async () => reference,
          restoreWorkers: async () => reference,
          verifyOutsideOwned: async () => reference,
        },
        collect: () => Promise.reject(new Error("private collection payload")),
        context: {
          appUrl: "https://app.example",
          verifiedFenceReference: reference,
        },
        deployments: [],
        terminalCleanup: async () => ({
          fenceReleased: true,
          local: "PASS",
          outsideOwned: "PASS",
          provider: "PASS",
          retained: [],
          workers: "PASS",
        }),
        verifyFixtures: () => Promise.resolve(),
      }),
      assertDurable: () => Promise.resolve(),
      assertSource: vi.fn(),
      browser: async () => ({ closed: true, exitCode: 1 }),
      importConfiguration: async () => ({}),
    };
    const report = await runXeroE2e(
      ["--manifest", input.path, "--output", input.dir],
      dependencies
    );
    recordPaths(report);
    expect(report.exitCode).toBe(1);
    expect(drain).toHaveBeenCalledOnce();
    expect(report.json.scenarios).toHaveLength(26);
  });
  it("actual Bun CLI creates both complete reports on absent manifest with exit two", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "xero-cli-test-"));
    cleanupPaths.push(cwd);
    execFileSync("git", ["init", "-q"], { cwd });
    writeFileSync(
      resolve(cwd, ".gitignore"),
      "tooling/release/test-results/\n"
    );
    const reports = resolve(cwd, "reports/xero-e2e");
    mkdirSync(reports, { recursive: true });
    const before = new Set(readdirSync(reports));
    const child = spawnSync(
      "bun",
      [
        "--no-env-file",
        resolve("tooling/release/run-xero-e2e.ts"),
        "--manifest",
        "tooling/release/test-results/nonexistent.json",
        "--preflight",
      ],
      { cwd, encoding: "utf8", env: { ...process.env, TC_SOURCE_GATES: "1" } }
    );
    expect(child.status).toBe(2);
    const added = readdirSync(reports).filter((file) => !before.has(file));
    cleanupPaths.push(...added.map((file) => resolve(reports, file)));
    expect(added.some((file) => file.endsWith(".md"))).toBe(true);
    const json = added.find((file) => file.endsWith(".json"));
    if (!json) {
      throw new Error("CLI produced no JSON report");
    }
    const value = JSON.parse(readFileSync(resolve(reports, json), "utf8"));
    expect(value.scenarios).toHaveLength(26);
    expect(
      value.scenarios.flatMap(
        (entry: { subcases: unknown[] }) => entry.subcases
      )
    ).toHaveLength(92);
    expect(value.overall).toBe("NOT VERIFIED");
    cleanupPaths.push(
      resolve("tooling/release/test-results", value.diagnosticRunId)
    );
  });
  it.each(["source", "durable"])(
    "rejects invalid %s authority before lease acquisition",
    async (fault) => {
      const input = manifest();
      const acquire = vi.fn();
      const browser = vi.fn();
      const report = await runXeroE2e(["--manifest", input.path], {
        acquire,
        assertDurable: () =>
          Promise.reject(new Error("private durable detail")),
        assertSource: () => {
          if (fault === "source") {
            throw new Error("private source detail");
          }
        },
        browser,
        importConfiguration: () => Promise.resolve(),
      });
      recordPaths(report);
      expect(report.exitCode).toBe(2);
      expect(acquire).not.toHaveBeenCalled();
      expect(browser).not.toHaveBeenCalled();
      expect(JSON.stringify(report.json)).not.toContain("private");
    }
  );
  it("preflight validates source without acquiring a lease or persisting mutation authority", async () => {
    const input = manifest();
    const acquire = vi.fn();
    const durable = vi.fn();
    const report = await runXeroE2e(
      ["--manifest", input.path, "--preflight", "--output", input.dir],
      {
        acquire,
        assertDurable: durable,
        assertSource: vi.fn(),
        browser: vi.fn(),
        importConfiguration: () => Promise.resolve(),
      }
    );
    recordPaths(report);
    expect(report.exitCode).toBe(2);
    expect(report.json.verifiedRunId).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
    expect(durable).not.toHaveBeenCalled();
    expect(readdirSync(input.dir)).toEqual(["manifest.json"]);
  });
  it.each(["fixture", "writer", "malformed"])(
    "closes the acquired lease on %s fault and preserves both safe fallback formats",
    async (fault) => {
      const input = manifest();
      const reference = `sha256:${"b".repeat(64)}`;
      const drain = vi.fn(() => Promise.resolve(reference));
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      try {
        const report = await runXeroE2e(
          ["--manifest", input.path, "--output", input.dir],
          {
            acquire: () =>
              Promise.resolve({
                cleanup: {
                  cleanupLocal: () => Promise.resolve(reference),
                  cleanupRemote: () =>
                    Promise.resolve({ disposition: "reconciled", reference }),
                  drainOwnedWorkers: drain,
                  observe: () => Promise.resolve([]),
                  releaseFence: () => Promise.resolve(reference),
                  restoreWorkers: () => Promise.resolve(reference),
                  verifyOutsideOwned: () => Promise.resolve(reference),
                },
                collect: () =>
                  fault === "malformed"
                    ? Promise.resolve(JSON.parse("[{}]"))
                    : Promise.reject(new Error("private-collection")),
                context: {
                  appUrl: "https://app.example",
                  verifiedFenceReference: reference,
                },
                deployments: [],
                terminalCleanup: () =>
                  Promise.resolve({
                    fenceReleased: true,
                    local: "PASS",
                    outsideOwned: "PASS",
                    provider: "PASS",
                    retained: [],
                    workers: "PASS",
                  }),
                verifyFixtures: () =>
                  fault === "fixture"
                    ? Promise.reject(new Error("private-fixture"))
                    : Promise.resolve(),
              }),
            assertDurable: () => Promise.resolve(),
            assertSource: vi.fn(),
            browser: () => Promise.resolve({ closed: true, exitCode: 1 }),
            importConfiguration: () => Promise.resolve(),
            writeReport:
              fault === "writer"
                ? () => {
                    throw new Error("Bearer private-writer");
                  }
                : writeXeroReport,
          }
        );
        recordPaths(report);
        expect(drain).toHaveBeenCalledOnce();
        expect(report.exitCode).toBe(fault === "fixture" ? 2 : 1);
        if (fault === "writer") {
          const output = stderr.mock.calls.flat().join("");
          expect(output).toContain('"scenarios"');
          expect(output).toContain("# Xero");
          expect(output).not.toContain("private-");
          expect(report.json.lifecycle.cases).toHaveLength(40);
        }
      } finally {
        stderr.mockRestore();
      }
    }
  );
});

describe("browser writer closure", () => {
  it.each(["error", "abort", "nonzero"])(
    "waits for actual close after %s and preserves unknown detached writers",
    async (fault) => {
      const child = Object.assign(new EventEmitter(), { pid: 12_345 });
      const controller = new AbortController();
      const control = { exists: vi.fn(() => false), kill: vi.fn() };
      let settled = false;
      const result = superviseXeroBrowser(
        child,
        controller.signal,
        control,
        50
      ).then((value) => {
        settled = true;
        return value;
      });
      if (fault === "error") {
        child.emit("error", new Error("private"));
      }
      if (fault === "abort") {
        controller.abort();
      }
      child.emit("exit", fault === "nonzero" ? 1 : 0);
      await Promise.resolve();
      expect(settled).toBe(false);
      child.emit("close", fault === "nonzero" ? 1 : 0);
      expect(await result).toEqual({ closed: false, exitCode: 1 });
    }
  );
  it("awaits delayed group closure after graceful success", async () => {
    const child = Object.assign(new EventEmitter(), { pid: 12_345 });
    let alive = true;
    const result = superviseXeroBrowser(
      child,
      new AbortController().signal,
      { exists: () => alive, kill: vi.fn() },
      200
    );
    child.emit("close", 0);
    alive = false;
    expect(await result).toEqual({ closed: true, exitCode: 0 });
  });
  it("bounds failed shutdown, escalates and keeps closure unknown", async () => {
    const child = Object.assign(new EventEmitter(), { pid: 12_345 });
    const controller = new AbortController();
    const kill = vi.fn();
    const result = superviseXeroBrowser(
      child,
      controller.signal,
      { exists: () => true, kill },
      40
    );
    controller.abort();
    expect(await result).toEqual({ closed: false, exitCode: 1 });
    expect(kill.mock.calls.map(([signal]) => signal)).toEqual([
      "SIGTERM",
      "SIGKILL",
    ]);
  });
  it("failed spawn grants no closure until its close event", async () => {
    const child = new EventEmitter();
    const result = superviseXeroBrowser(
      child,
      new AbortController().signal,
      { exists: () => false, kill: vi.fn() },
      50
    );
    child.emit("error", new Error("spawn"));
    child.emit("close", -2);
    expect(await result).toEqual({ closed: true, exitCode: 1 });
  });
});
describe("separate durable browser ledger", () => {
  it.each([
    "success",
    "error",
    "interruption",
    "malformed",
    "missing",
    "mismatched",
    "unknown-close",
  ])("preserves child state and fence on %s", async (fault) => {
    const input = manifest();
    const authority = readXeroExecutionManifest(input.path);
    const path = resolve(input.dir, "xero-ledger.json");
    const reference = `sha256:${"b".repeat(64)}`;
    const cleanupLocal = vi.fn(async () => reference);
    const releaseFence = vi.fn(async () => reference);
    const observe = vi.fn(async () => []);
    const outside = vi.fn(async () => reference);
    const browser = vi.fn(async () => {
      const childLedger = readXeroLedger(path, authority);
      const entry: XeroLedgerEntry = {
        action: "create",
        bindingGeneration: 1,
        cleanup: "pending",
        cleanupReference: null,
        clerkOrgId: authority.owned[0]?.clerkOrgId ?? "",
        dateFrom: "2026-10-01",
        dateUntil: "2026-10-02",
        fingerprint: "a".repeat(64),
        id: randomUUID(),
        intendedAt: new Date().toISOString(),
        localId: null,
        organisationId: authority.owned[0]?.organisationId ?? "",
        outcome: "intended",
        remoteId: null,
        updatedAt: new Date().toISOString(),
      };
      recordXeroIntent(path, childLedger, entry, authority);
      await dispatchXeroIntent(
        path,
        childLedger,
        entry.id,
        async () => undefined,
        () => ({ localId: null, remoteId: null }),
        authority
      );
      if (fault === "malformed") {
        writeFileSync(path, "malformed", { mode: 0o600 });
      }
      if (fault === "missing") {
        rmSync(path);
      }
      if (fault === "mismatched") {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        raw.runId = randomUUID();
        writeFileSync(path, JSON.stringify(raw), { mode: 0o600 });
      }
      if (fault === "error") {
        throw new Error("child still unknown");
      }
      if (fault === "interruption") {
        process.emit("SIGINT");
      }
      return {
        closed: fault !== "unknown-close",
        exitCode: fault === "success" ? 0 : 1,
      };
    });
    const dependencies: XeroRunnerDependencies = {
      acquire: async () => ({
        cleanup: {
          cleanupLocal,
          cleanupRemote: vi.fn(),
          drainOwnedWorkers: async () => reference,
          observe,
          releaseFence,
          restoreWorkers: async () => reference,
          verifyOutsideOwned: outside,
        },
        collect: () => Promise.reject(new Error("missing proof")),
        context: {
          appUrl: "https://app.example",
          verifiedFenceReference: reference,
        },
        deployments: [],
        terminalCleanup: async () => ({
          fenceReleased: true,
          local: "PASS",
          outsideOwned: "PASS",
          provider: "PASS",
          retained: [],
          workers: "PASS",
        }),
        verifyFixtures: async () => undefined,
      }),
      assertDurable: async () => undefined,
      assertSource: vi.fn(),
      browser,
      importConfiguration: async () => undefined,
    };
    const report = await runXeroE2e(
      ["--manifest", input.path, "--output", input.dir],
      dependencies
    );
    recordPaths(report);
    expect(report.exitCode).not.toBe(0);
    expect(cleanupLocal).not.toHaveBeenCalled();
    expect(releaseFence).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalled();
    if (["success", "interruption"].includes(fault)) {
      expect(observe).toHaveBeenCalledOnce();
      const stored = readXeroLedger(path, authority);
      expect(stored.entries).toHaveLength(1);
      expect(stored.entries[0]?.outcome).toBe("uncertain");
      const recovered = await runXeroE2e(
        ["--manifest", input.path, "--output", input.dir, "--recover"],
        dependencies
      );
      expect(recovered.exitCode).not.toBe(0);
      expect(browser).toHaveBeenCalledOnce();
      expect(readXeroLedger(path, authority).entries).toHaveLength(1);
      expect(releaseFence).not.toHaveBeenCalled();
    }
  });
});

it("does not revive polling when close arrives after bounded unknown shutdown", async () => {
  vi.useFakeTimers();
  try {
    const child = Object.assign(new EventEmitter(), { pid: 12_345 });
    const controller = new AbortController();
    const result = superviseXeroBrowser(
      child,
      controller.signal,
      { exists: () => true, kill: vi.fn() },
      30
    );
    controller.abort();
    await vi.advanceTimersByTimeAsync(30);
    expect(await result).toMatchObject({ closed: false });
    child.emit("close", 0);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

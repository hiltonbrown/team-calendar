import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
import { runXeroE2e, type XeroRunnerDependencies } from "./run-xero-e2e.js";
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
      browser: async () => 1,
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
            browser: () => Promise.resolve(1),
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

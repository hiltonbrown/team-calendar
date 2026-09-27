import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runXeroE2e, type XeroRunnerDependencies } from "./run-xero-e2e.js";
import { collectXeroCampaign } from "./xero-campaign-collector.js";
import {
  XERO_EVIDENCE_CASES,
  type XeroEvidenceInput,
  type XeroEvidenceObservation,
} from "./xero-evidence.js";
import {
  ingestXeroLayerReceipt,
  persistXeroLayerReceipt,
} from "./xero-observations.js";
import {
  bootstrapXeroReport,
  buildXeroReport,
  emptyObservation,
  type XeroObservation,
} from "./xero-report.js";
import { XERO_SCENARIOS } from "./xero-scenarios.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});
function fixture(
  failCase = false,
  candidateSha = "a".repeat(40),
  fixedRunId?: string,
  fixedOrganisationId?: string
) {
  const root = resolve("tooling/release/test-results");
  mkdirSync(root, { mode: 0o700, recursive: true });
  chmodSync(root, 0o700);
  const output = mkdtempSync(`${root}/collector-`);
  roots.push(output);
  mkdirSync(resolve(output, "sanitised"), { mode: 0o700 });
  const endedAt = new Date().toISOString();
  const startedAt = new Date(Date.parse(endedAt) - 2000).toISOString();
  const actionEnd = new Date(Date.parse(endedAt) - 1000).toISOString();
  const terminalStartedAt = new Date(Date.parse(endedAt) - 800).toISOString();
  const terminalObservedAt = new Date(Date.parse(endedAt) - 400).toISOString();
  const runId = fixedRunId ?? randomUUID();
  const organisationId = fixedOrganisationId ?? randomUUID();
  const fingerprint = `sha256:${"b".repeat(64)}`;
  const target = {
    browser: fingerprint,
    controlled_integration: fingerprint,
    database: fingerprint,
    distributed_store: fingerprint,
    live_provider: fingerprint,
    source_audit: fingerprint,
    unit: fingerprint,
  };
  const owned = [
    {
      alias: "fixture-owned",
      bindingGeneration: 1,
      clerkOrgId: "org_owned",
      organisationId,
    },
  ];
  const options = {
    candidateSha,
    endedAt: actionEnd,
    expectedTargetFingerprints: target,
    fixtureAliases: ["fixture-owned"],
    output,
    owned,
    phase: "actions" as const,
    previous: null,
    runId,
    startedAt,
  };
  const save = (path: string, value: unknown) =>
    writeFileSync(resolve(output, path), JSON.stringify(value), {
      mode: 0o600,
    });
  const artifact = (value: unknown) => {
    const bytes = JSON.stringify(value);
    const hash = createHash("sha256").update(bytes).digest("hex");
    save(`sanitised/${hash}.json`, value);
    return `restricted:sha256:${hash}`;
  };
  const observations: XeroObservation[] = [];
  for (const definition of XERO_SCENARIOS) {
    for (const suffix of definition.subcases) {
      const id = `${definition.id}.${suffix}`;
      const terminal = definition.id === "X26";
      const entry: XeroObservation = {
        ...emptyObservation(id),
        actual: "assertion-passed",
        attempt: 1,
        correlation: {
          fixtureAlias: "fixture-owned",
          operationAlias: "operation-owned",
          runId,
        },
        durationMs: terminal
          ? Date.parse(endedAt) - Date.parse(terminalStartedAt)
          : 1000,
        endedAt: terminal ? endedAt : actionEnd,
        observedMode: definition.requiredMode,
        prerequisites: Object.fromEntries(
          definition.prerequisites.map((name) => [name, true])
        ),
        reason: "verified",
        startedAt: terminal ? terminalStartedAt : startedAt,
        status: "PASS",
      };
      for (const layer of definition.requiredLayers) {
        const path = resolve(output, `${id}-${layer}.json`);
        persistXeroLayerReceipt(
          path,
          {
            actualFingerprint: "c".repeat(64),
            assertionPassed: true,
            candidateSha,
            eventAlias: "event-owned",
            expectedFingerprint: "c".repeat(64),
            fixtureAlias: "fixture-owned",
            intercepted: false,
            layer,
            logicalRunAlias: "job-owned",
            mode: definition.requiredMode,
            observationId: id,
            observedAt: terminal ? terminalObservedAt : actionEnd,
            operationAlias: "operation-owned",
            origin: layer === "provider" ? "https://api.xero.com" : null,
            runId,
            schemaVersion: 1,
            terminal: "succeeded",
          },
          output
        );
        entry.evidence.push(
          ingestXeroLayerReceipt(path, {
            ...options,
            endedAt: entry.endedAt ?? "",
            fixtureAlias: "fixture-owned",
            layer,
            observationId: id,
            startedAt: entry.startedAt ?? "",
          })
        );
      }
      save(`${id}-observation.json`, entry);
      observations.push(entry);
    }
  }
  const lifecycle: XeroEvidenceInput = {
    assessedAt: actionEnd,
    candidateSha,
    deployedSha: candidateSha,
    expectedTargetFingerprints: target,
    prerequisites: {
      browser: true,
      configured_database: true,
      controlled_integration: true,
      distributed_store: true,
      live_provider: true,
      source_checks: true,
    },
    results: {},
  };
  const cleanup: {
    caseId: string;
    cleanupEvidenceReference: string;
    cleanupStatus: "PASS" | "FAIL";
    evidenceLevel: string;
    observedAt: string;
  }[] = [];
  for (const definition of XERO_EVIDENCE_CASES) {
    lifecycle.results[definition.caseId] =
      definition.requiredEvidenceLevels.map(
        (level): XeroEvidenceObservation => {
          const failing =
            failCase && definition.caseId === "161-01" && level === "database";
          const entry: XeroEvidenceObservation = {
            assertionPassed: !failing,
            candidateSha,
            cleanupEvidenceReference: null,
            cleanupStatus: "NOT_VERIFIED",
            commandOrRunnerScenario: `${definition.caseId}:${level}`,
            evidenceLevel: level,
            executed: true,
            executedAt: actionEnd,
            exitCodeOrObservedResult: failing ? 1 : 0,
            expectedAssertion: definition.requirement,
            fixtureOwnershipReference: null,
            nonSecretTargetFingerprint: fingerprint,
            observedAssertion: failing
              ? "assertion_failed"
              : "assertion_passed",
            remainingAction: null,
            restrictedEvidenceLocations: [],
            status: failing ? "FAIL" : "PASS",
          };
          const base = {
            bindingGeneration: 1,
            candidateSha,
            caseId: definition.caseId,
            cleanupStatus: null,
            clerkOrgId: "org_owned",
            evidenceLevel: level,
            fixtureAlias: "fixture-owned",
            nonSecretTargetFingerprint: fingerprint,
            observation: null,
            observedAt: actionEnd,
            organisationId,
            phase: "actions",
            runId,
            schemaVersion: 1,
          };
          entry.restrictedEvidenceLocations = [
            artifact({
              ...base,
              kind: "assertion",
              observation: structuredClone(entry),
            }),
          ];
          if (!["unit", "source_audit", "mock"].includes(level)) {
            const scoped = {
              ...base,
              bindingGeneration: 1,
              clerkOrgId: "org_owned",
              fixtureAlias: "fixture-owned",
              organisationId,
            };
            entry.fixtureOwnershipReference = artifact({
              ...scoped,
              kind: "ownership",
            });
            const cleanupEvidenceReference = artifact({
              ...scoped,
              cleanupStatus: "PASS",
              kind: "cleanup",
              observedAt: terminalObservedAt,
              phase: "terminal",
            });
            cleanup.push({
              caseId: definition.caseId,
              cleanupEvidenceReference,
              cleanupStatus: "PASS",
              evidenceLevel: level,
              observedAt: terminalObservedAt,
            });
          }
          return entry;
        }
      );
  }
  save("lifecycle-observations.json", {
    candidateSha,
    input: lifecycle,
    runId,
    schemaVersion: 1,
  });
  const terminalReceipts = (
    at = terminalObservedAt,
    terminalStart = terminalStartedAt
  ) => {
    if (at !== terminalObservedAt) {
      for (const receipt of cleanup) {
        const original = JSON.parse(
          readFileSync(
            resolve(
              output,
              `sanitised/${receipt.cleanupEvidenceReference.slice("restricted:sha256:".length)}.json`
            ),
            "utf8"
          )
        );
        original.observedAt = at;
        receipt.observedAt = at;
        receipt.cleanupEvidenceReference = artifact(original);
      }
      for (const entry of observations.filter((item) =>
        item.id.startsWith("X26.")
      )) {
        entry.startedAt = terminalStart;
        entry.endedAt = at;
        entry.durationMs = Date.parse(at) - Date.parse(terminalStart);
        entry.evidence = entry.evidence.map((link) => {
          const original = JSON.parse(
            readFileSync(resolve(output, link.path), "utf8")
          );
          original.observedAt = at;
          const receiptPath = resolve(
            output,
            `${entry.id}-${link.layer}-terminal.json`
          );
          save(`${entry.id}-${link.layer}-terminal.json`, original);
          return ingestXeroLayerReceipt(receiptPath, {
            ...options,
            endedAt: at,
            fixtureAlias: "fixture-owned",
            layer: link.layer,
            observationId: entry.id,
            startedAt: terminalStart,
          });
        });
        save(`${entry.id}-observation.json`, entry);
      }
    }
    save("lifecycle-cleanup.json", {
      candidateSha,
      observedAt: at,
      phase: "terminal",
      receipts: cleanup,
      runId,
      schemaVersion: 1,
    });
  };
  const report = (collection: ReturnType<typeof collectXeroCampaign>) => {
    const input = bootstrapXeroReport(startedAt, runId);
    Object.assign(input, {
      authorisedFixtures: [
        {
          alias: "fixture-owned",
          bindingGeneration: 1,
          cohort: "A",
          maximumMutations: 5,
        },
      ],
      candidateSha,
      cleanup: {
        fenceReleased: true,
        local: "PASS",
        outsideOwned: "PASS",
        provider: "PASS",
        retained: [],
        workers: "PASS",
      },
      contractDecision: "au-contract-v1",
      defects: collection.defects,
      deployments: ["app", "api", "web", "workers"].map((alias) => ({
        alias,
        observedAt: terminalObservedAt,
        reference: fingerprint,
        revision: candidateSha,
      })),
      endedAt,
      environment: "owned-candidate",
      harnessSha: candidateSha,
      lifecycleInput: collection.lifecycleInput,
      lifecycleRunId: collection.lifecycleRunId,
      limitations: collection.limitations,
      scenarios: collection.scenarios,
      toolVersions: { bun: "1.3.14", playwright: "1.63.0" },
      verifiedRunId: runId,
    });
    return buildXeroReport(input);
  };
  const terminalOptions = {
    ...options,
    endedAt,
    phase: "terminal" as const,
    terminalStartedAt,
  };
  return {
    cleanup,
    lifecycle,
    observations,
    options,
    report,
    save,
    terminalOptions,
    terminalReceipts,
  };
}
describe("strict campaign collection", () => {
  it("collects full synthetic 26/92/40/93 proof only after fresh terminal receipts", () => {
    const f = fixture();
    const actions = collectXeroCampaign(f.options);
    expect(f.report(actions).exitCode).toBe(2);
    expect(actions.scenarios.find((entry) => entry.id === "X26")?.status).toBe(
      "NOT VERIFIED"
    );
    f.terminalReceipts();
    const terminal = collectXeroCampaign({
      ...f.terminalOptions,
      previous: actions,
    });
    const report = f.report(terminal);
    expect(report.json.validationErrors).toEqual([]);
    expect(report.json.lifecycle.status).toBe("PASS");
    expect(
      report.json.scenarios
        .filter((entry) => entry.status !== "PASS")
        .map((entry) => [entry.id, entry.reason])
    ).toEqual([]);
    expect(report.exitCode).toBe(0);
    expect(report.json.counts.passed).toBe(26);
    expect(
      report.json.scenarios.flatMap((entry) => entry.subcases)
    ).toHaveLength(92);
    expect(report.json.lifecycle.cases).toHaveLength(40);
    expect(
      report.json.lifecycle.cases.flatMap((entry) => entry.evidence)
    ).toHaveLength(93);
  });
  it.each([
    "missing-terminal",
    "early-terminal",
    "wrong-run",
    "wrong-candidate",
    "wrong-target",
    "foreign-previous",
    "unknown-case",
    "hash-mismatch",
  ])("rejects %s without manufacturing proof", (fault) => {
    const f = fixture();
    const actions = collectXeroCampaign(f.options);
    f.terminalReceipts();
    if (fault === "missing-terminal") {
      rmSync(resolve(f.options.output, "lifecycle-cleanup.json"));
    }
    if (fault === "early-terminal") {
      const json = JSON.parse(
        readFileSync(
          resolve(f.options.output, "lifecycle-cleanup.json"),
          "utf8"
        )
      );
      json.observedAt = f.options.endedAt;
      f.save("lifecycle-cleanup.json", json);
    }
    if (fault === "unknown-case") {
      f.save("X99.primary-observation.json", f.observations[0]);
    }
    if (fault === "hash-mismatch") {
      const link = f.observations[0]?.evidence[0];
      if (!link) {
        throw new Error("fixture");
      }
      f.save(link.path, {});
    }
    const previous =
      fault === "foreign-previous"
        ? { ...actions, runId: randomUUID() }
        : actions;
    const options = {
      ...f.terminalOptions,
      previous,
      ...(fault === "wrong-run" ? { runId: randomUUID() } : {}),
      ...(fault === "wrong-candidate" ? { candidateSha: "d".repeat(40) } : {}),
      ...(fault === "wrong-target"
        ? {
            expectedTargetFingerprints: {
              ...f.options.expectedTargetFingerprints,
              database: `sha256:${"e".repeat(64)}`,
            },
          }
        : {}),
    };
    const terminal = collectXeroCampaign(options);
    if (fault === "hash-mismatch") {
      const refreshed = collectXeroCampaign({ ...f.options, previous: null });
      expect(f.report(refreshed).exitCode).toBe(2);
    } else {
      expect(f.report(terminal).exitCode).not.toBe(0);
    }
  });
  it("keeps a proven failed owned assertion while terminal and unrelated proof are unavailable", () => {
    const f = fixture(true);
    const cases = f.lifecycle.results["161-02"];
    const entry = Array.isArray(cases) ? cases[0] : cases;
    if (!entry) {
      throw new Error("fixture");
    }
    f.save(
      `sanitised/${entry.restrictedEvidenceLocations[0]?.slice("restricted:sha256:".length)}.json`,
      {}
    );
    const actions = collectXeroCampaign(f.options);
    const report = f.report(actions);
    expect(report.exitCode).toBe(1);
    expect(
      report.json.lifecycle.cases.find(
        (scenario) => scenario.caseId === "161-01"
      )?.status
    ).toBe("FAIL");
    expect(actions.limitations).toContain("invalid-evidence");
  });
  it("terminal cleanup failure overrides earlier passing action assertions", () => {
    const f = fixture();
    const actions = collectXeroCampaign(f.options);
    // A genuine failed terminal receipt is hashed independently, never an edited index label.
    const [receipt] = f.cleanup;
    if (!receipt) {
      throw new Error("fixture");
    }
    const original = JSON.parse(
      readFileSync(
        resolve(
          f.options.output,
          `sanitised/${receipt.cleanupEvidenceReference.slice("restricted:sha256:".length)}.json`
        ),
        "utf8"
      )
    );
    original.cleanupStatus = "FAIL";
    const bytes = JSON.stringify(original);
    const hash = createHash("sha256").update(bytes).digest("hex");
    f.save(`sanitised/${hash}.json`, original);
    receipt.cleanupStatus = "FAIL";
    receipt.cleanupEvidenceReference = `restricted:sha256:${hash}`;
    f.terminalReceipts();
    expect(
      f.report(collectXeroCampaign({ ...f.terminalOptions, previous: actions }))
        .exitCode
    ).toBe(1);
  });
  it("recovery collects original action evidence without rereading deleted action files", () => {
    const f = fixture();
    const actions = collectXeroCampaign(f.options);
    for (const entry of f.observations.filter(
      (observation) => !observation.id.startsWith("X26.")
    )) {
      rmSync(resolve(f.options.output, `${entry.id}-observation.json`));
    }
    f.terminalReceipts();
    expect(
      f.report(collectXeroCampaign({ ...f.terminalOptions, previous: actions }))
        .exitCode
    ).toBe(0);
  });
});

describe("runner and collector ordering", () => {
  it.each([false, true])(
    "merges late terminal proof and preserves cleanup failure=%s",
    async (failCleanup) => {
      const sha = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      const f = fixture(false, sha);
      const reference = `sha256:${"b".repeat(64)}`;
      const events: string[] = [];
      const { runId } = f.options;
      const { organisationId } = f.options.owned[0];
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
            organisationIds: [organisationId],
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
            ...f.options.owned[0],
            cohort: "A",
            employeeIds: [randomUUID()],
            independentRecoveryAlias: null,
            leaveTypeIds: [randomUUID()],
            maximumMutations: 2,
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
      f.save("manifest.json", value);
      let proof: ReturnType<typeof fixture> | null = null;
      let actionsReady = false;
      let terminalReady = false;
      const deps: XeroRunnerDependencies = {
        acquire: async () => ({
          cleanup: {
            cleanupLocal: () => {
              events.push("local");
              if (failCleanup) {
                return Promise.reject(new Error("owned failure"));
              }
              return Promise.resolve(reference);
            },
            cleanupRemote: async () => ({
              disposition: "reconciled",
              reference,
            }),
            drainOwnedWorkers: () => {
              events.push("drain");
              return Promise.resolve(reference);
            },
            observe: async () => [],
            releaseFence: () => {
              events.push("release");
              return Promise.resolve(reference);
            },
            restoreWorkers: () => {
              events.push("restore");
              return Promise.resolve(reference);
            },
            verifyOutsideOwned: () => {
              events.push("outside");
              return Promise.resolve(reference);
            },
          },
          collect: (phase, previous, terminalStart) => {
            events.push(phase);
            expect(actionsReady).toBe(true);
            if (!proof) {
              throw new Error("No action producer ran");
            }
            if (phase === "actions") {
              return Promise.resolve(
                collectXeroCampaign({
                  ...proof.options,
                  endedAt: new Date().toISOString(),
                })
              );
            }
            expect(terminalReady).toBe(true);
            return Promise.resolve(
              collectXeroCampaign({
                ...proof.terminalOptions,
                endedAt: new Date().toISOString(),
                previous,
                terminalStartedAt: terminalStart,
              })
            );
          },
          context: {
            appUrl: "https://app.example",
            verifiedFenceReference: reference,
          },
          deployments: ["app", "api", "web", "workers"].map((alias) => ({
            alias: alias as "app" | "api" | "web" | "workers",
            observedAt: new Date().toISOString(),
            reference,
            revision: sha,
          })), // Exact enum fixture names.
          terminalCleanup: () => {
            events.push("terminal-cleanup");
            if (!proof) {
              throw new Error("No action producer ran");
            }
            const terminalTime = new Date().toISOString();
            proof.terminalReceipts(terminalTime, terminalTime);
            terminalReady = true;
            return Promise.resolve({
              fenceReleased: true,
              local: "PASS",
              outsideOwned: "PASS",
              provider: "PASS",
              retained: [],
              workers: "PASS",
            });
          },
          verifyFixtures: async () => undefined,
        }),
        assertDurable: async () => undefined,
        assertSource: vi.fn(),
        browser: async () => {
          events.push("browser");
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 2100));
          proof = fixture(false, sha, runId, organisationId);
          actionsReady = true;
          return { closed: true, exitCode: 0 };
        },
        importConfiguration: async () => undefined,
        writeReport: vi.fn(() => ({
          jsonPath: "unused",
          markdownPath: "unused",
        })),
      };
      const result = await runXeroE2e(
        [
          "--manifest",
          resolve(f.options.output, "manifest.json"),
          "--output",
          f.options.output,
        ],
        deps
      );
      roots.push(
        resolve("tooling/release/test-results", result.json.diagnosticRunId)
      );
      expect(events.indexOf("actions")).toBeLessThan(events.indexOf("local"));
      expect(events.indexOf("terminal-cleanup")).toBeLessThan(
        events.indexOf("terminal")
      );
      expect(result.exitCode).toBe(failCleanup ? 1 : 0);
      expect(
        result.json.scenarios.find((entry) => entry.id === "X26")?.status
      ).toBe("PASS");
      expect(result.json.lifecycle.cases).toHaveLength(40);
    }
  );
});

it.each(["invalid", "reversed", "early-terminal"])(
  "rejects %s collection windows",
  (fault) => {
    const f = fixture();
    const options = {
      ...f.terminalOptions,
      ...(fault === "invalid" ? { terminalStartedAt: "invalid" } : {}),
      ...(fault === "reversed"
        ? {
            endedAt: new Date(
              Date.parse(f.options.startedAt) - 1
            ).toISOString(),
          }
        : {}),
      ...(fault === "early-terminal"
        ? {
            terminalStartedAt: new Date(
              Date.parse(f.options.startedAt) - 1
            ).toISOString(),
          }
        : {}),
    };
    expect(() => collectXeroCampaign(options)).toThrow();
  }
);
it("preserves valid FAIL when its own sibling evidence level is malformed", () => {
  const f = fixture(true);
  const result = f.lifecycle.results["161-01"];
  if (!Array.isArray(result)) {
    throw new Error("fixture");
  }
  const envelope = {
    candidateSha: f.options.candidateSha,
    input: {
      ...f.lifecycle,
      results: { ...f.lifecycle.results, "161-01": [{}, ...result.slice(1)] },
    },
    runId: f.options.runId,
    schemaVersion: 1,
  };
  f.save("lifecycle-observations.json", envelope);
  const collection = collectXeroCampaign(f.options);
  expect(collection.limitations).toContain("invalid-evidence");
  expect(f.report(collection).exitCode).toBe(1);
});
it("rejects ownership for another authorised alias instead of combining fixture proofs", () => {
  const f = fixture();
  const result = f.lifecycle.results["161-01"];
  const entry = Array.isArray(result)
    ? result.find((observation) => observation.evidenceLevel === "database")
    : undefined;
  if (!entry?.fixtureOwnershipReference) {
    throw new Error("fixture");
  }
  const other = {
    alias: "fixture-other",
    bindingGeneration: 2,
    clerkOrgId: "org_other",
    organisationId: randomUUID(),
  };
  const receipt = JSON.parse(
    readFileSync(
      resolve(
        f.options.output,
        `sanitised/${entry.fixtureOwnershipReference.slice("restricted:sha256:".length)}.json`
      ),
      "utf8"
    )
  );
  Object.assign(receipt, {
    bindingGeneration: other.bindingGeneration,
    clerkOrgId: other.clerkOrgId,
    fixtureAlias: other.alias,
    organisationId: other.organisationId,
  });
  const hash = createHash("sha256")
    .update(JSON.stringify(receipt))
    .digest("hex");
  f.save(`sanitised/${hash}.json`, receipt);
  entry.fixtureOwnershipReference = `restricted:sha256:${hash}`;
  f.save("lifecycle-observations.json", {
    candidateSha: f.options.candidateSha,
    input: f.lifecycle,
    runId: f.options.runId,
    schemaVersion: 1,
  });
  const collection = collectXeroCampaign({
    ...f.options,
    owned: [...f.options.owned, other],
  });
  expect(collection.limitations).toContain("invalid-evidence");
  expect(f.report(collection).exitCode).not.toBe(0);
});

it.each(["case", "catalogue"])(
  "retains an independently failed terminal cleanup when its action %s is missing",
  (missing) => {
    const f = fixture();
    const [receipt] = f.cleanup;
    if (!receipt) {
      throw new Error("fixture");
    }
    f.lifecycle.results["161-01"] = undefined;
    f.save("lifecycle-observations.json", {
      candidateSha: f.options.candidateSha,
      input: f.lifecycle,
      runId: f.options.runId,
      schemaVersion: 1,
    });
    if (missing === "catalogue") {
      rmSync(resolve(f.options.output, "lifecycle-observations.json"));
    }
    const actions = collectXeroCampaign(f.options);
    const proof = JSON.parse(
      readFileSync(
        resolve(
          f.options.output,
          `sanitised/${receipt.cleanupEvidenceReference.slice("restricted:sha256:".length)}.json`
        ),
        "utf8"
      )
    );
    proof.cleanupStatus = "FAIL";
    const hash = createHash("sha256")
      .update(JSON.stringify(proof))
      .digest("hex");
    f.save(`sanitised/${hash}.json`, proof);
    receipt.cleanupStatus = "FAIL";
    receipt.cleanupEvidenceReference = `restricted:sha256:${hash}`;
    f.terminalReceipts();
    const terminal = collectXeroCampaign({
      ...f.terminalOptions,
      previous: actions,
    });
    expect(
      terminal.defects.some((entry) => entry.reason === "cleanup-incomplete")
    ).toBe(true);
    expect(f.report(terminal).exitCode).toBe(1);
  }
);

it("keeps a valid terminal cleanup FAIL alongside a malformed cleanup sibling", () => {
  const f = fixture();
  const actions = collectXeroCampaign(f.options);
  const [receipt] = f.cleanup;
  if (!receipt) {
    throw new Error("fixture");
  }
  const proof = JSON.parse(
    readFileSync(
      resolve(
        f.options.output,
        `sanitised/${receipt.cleanupEvidenceReference.slice("restricted:sha256:".length)}.json`
      ),
      "utf8"
    )
  );
  proof.cleanupStatus = "FAIL";
  const hash = createHash("sha256").update(JSON.stringify(proof)).digest("hex");
  f.save(`sanitised/${hash}.json`, proof);
  receipt.cleanupStatus = "FAIL";
  receipt.cleanupEvidenceReference = `restricted:sha256:${hash}`;
  f.terminalReceipts();
  const envelope = JSON.parse(
    readFileSync(resolve(f.options.output, "lifecycle-cleanup.json"), "utf8")
  );
  envelope.receipts.push({});
  f.save("lifecycle-cleanup.json", envelope);
  const terminal = collectXeroCampaign({
    ...f.terminalOptions,
    previous: actions,
  });
  expect(terminal.limitations).toContain("invalid-evidence");
  expect(f.report(terminal).exitCode).toBe(1);
});
it.each(["bytes", "metadata"])(
  "retains a validated failed layer when sibling %s are corrupt",
  (fault) => {
    const f = fixture();
    const [entry] = f.observations;
    const [link, sibling] = entry?.evidence ?? [];
    if (!(entry && link && sibling)) {
      throw new Error("fixture");
    }
    const receipt = JSON.parse(
      readFileSync(resolve(f.options.output, link.path), "utf8")
    );
    receipt.assertionPassed = false;
    receipt.terminal = "failed";
    const path = resolve(f.options.output, "failed-layer.json");
    f.save("failed-layer.json", receipt);
    entry.evidence[0] = ingestXeroLayerReceipt(path, {
      ...f.options,
      endedAt: entry.endedAt ?? "",
      fixtureAlias: "fixture-owned",
      layer: link.layer,
      observationId: entry.id,
      startedAt: entry.startedAt ?? "",
    });
    if (fault === "bytes") {
      f.save(sibling.path, {});
    }
    const raw = {
      ...entry,
      evidence:
        fault === "metadata"
          ? [entry.evidence[0], {}, ...entry.evidence.slice(2)]
          : entry.evidence,
    };
    f.save(`${entry.id}-observation.json`, raw);
    const collection = collectXeroCampaign(f.options);
    expect(collection.limitations).toContain("invalid-evidence");
    expect(f.report(collection).exitCode).toBe(1);
  }
);

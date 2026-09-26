import { readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  XERO_EVIDENCE_CASES,
  type XeroEvidenceInput,
} from "./xero-evidence.js";
import {
  bootstrapXeroReport,
  buildXeroReport,
  reportCli,
  writeXeroReport,
  type XeroObservation,
  type XeroReportInput,
} from "./xero-report.js";
import { XERO_SCENARIOS } from "./xero-scenarios.js";

const sha = "a".repeat(40);
const hash = "b".repeat(64);
function completeInput(): XeroReportInput {
  const endedAt = new Date().toISOString();
  const startedAt = new Date(Date.parse(endedAt) - 2000).toISOString();
  const observedAt = new Date(Date.parse(endedAt) - 1000).toISOString();
  const input = bootstrapXeroReport(startedAt);
  input.endedAt = endedAt;
  input.candidateSha = sha;
  input.harnessSha = sha;
  input.toolVersions = { bun: "1.4.0", playwright: "1.56.1" };
  input.authorisedFixtures = [
    {
      alias: "fixture-owned",
      bindingGeneration: 1,
      cohort: "A",
      maximumMutations: 5,
    },
  ];
  input.environment = "owned-candidate";
  input.contractDecision = "au-contract-v1";
  input.verifiedRunId = input.runId;
  input.lifecycleRunId = input.runId;
  input.deployments = ["app", "api", "web", "workers"].map((alias) => ({
    alias: alias as "app" | "api" | "web" | "workers",
    observedAt,
    reference: `sha256:${hash}`,
    revision: sha,
  })); // Exact enum fixture values.
  input.cleanup = {
    fenceReleased: true,
    local: "PASS",
    outsideOwned: "PASS",
    provider: "PASS",
    retained: [],
    workers: "PASS",
  };
  input.scenarios = XERO_SCENARIOS.map((definition) => {
    const observation = (id: string): XeroObservation => ({
      actual: "assertion-passed",
      attempt: 1,
      correlation: {
        fixtureAlias: "fixture-owned",
        operationAlias: "operation-owned",
        runId: input.runId,
      },
      durationMs: 2000,
      endedAt,
      evidence: definition.requiredLayers.map((layer) => ({
        assertion: "passed",
        candidateSha: sha,
        eventAlias: "event-owned",
        fixtureAlias: "fixture-owned",
        intercepted: false,
        layer,
        logicalRunAlias: "job-owned",
        mode: definition.requiredMode,
        observationId: id,
        observedAt,
        operationAlias: "operation-owned",
        origin: layer === "provider" ? "https://api.xero.com" : null,
        path: `sanitised/${hash}.json`,
        runId: input.runId,
        sha256: hash,
        terminal: "succeeded",
      })),
      id,
      observedMode: definition.requiredMode,
      prerequisites: Object.fromEntries(
        definition.prerequisites.map((name) => [name, true])
      ),
      reason: "verified",
      startedAt,
      status: "PASS",
    });
    return {
      ...observation(definition.id),
      subcases: definition.subcases.map((suffix) =>
        observation(`${definition.id}.${suffix}`)
      ),
    };
  });
  const fingerprint = `sha256:${hash}`;
  const lifecycle: XeroEvidenceInput = {
    assessedAt: endedAt,
    candidateSha: sha,
    deployedSha: sha,
    expectedTargetFingerprints: {
      browser: fingerprint,
      controlled_integration: fingerprint,
      database: fingerprint,
      distributed_store: fingerprint,
      live_provider: fingerprint,
      source_audit: fingerprint,
      unit: fingerprint,
    },
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
  for (const scenario of XERO_EVIDENCE_CASES) {
    lifecycle.results[scenario.caseId] = scenario.requiredEvidenceLevels.map(
      (level) => ({
        assertionPassed: true,
        candidateSha: sha,
        cleanupEvidenceReference: `restricted:${fingerprint}`,
        cleanupStatus: "PASS",
        commandOrRunnerScenario: `${scenario.caseId}:${level}`,
        evidenceLevel: level,
        executed: true,
        executedAt: observedAt,
        exitCodeOrObservedResult: 0,
        expectedAssertion: scenario.requirement,
        fixtureOwnershipReference: `restricted:${fingerprint}`,
        nonSecretTargetFingerprint: fingerprint,
        observedAssertion: "assertion_passed",
        remainingAction: null,
        restrictedEvidenceLocations: [`restricted:${fingerprint}`],
        status: "PASS",
      })
    );
  }
  input.lifecycleInput = lifecycle;
  return input;
}
function first(input: XeroReportInput) {
  const [value] = input.scenarios;
  if (!value) {
    throw new Error("Missing test scenario");
  }
  return value;
}
describe("Xero report evidence", () => {
  it("passes only complete 26 and 40 case evidence with modes and four-layer proof", () => {
    const report = buildXeroReport(completeInput());
    expect(report.exitCode).toBe(0);
    expect(report.json.counts.passed).toBe(26);
    expect(report.json.lifecycle.cases).toHaveLength(40);
    expect(report.json.lifecycle.status).toBe("PASS");
  });
  it("keeps all bootstrap scenarios and subcases unexecuted with null timing", () => {
    const report = buildXeroReport(bootstrapXeroReport());
    expect(report.exitCode).toBe(2);
    expect(report.json.scenarios).toHaveLength(26);
    expect(
      report.json.scenarios.every(
        (entry) =>
          entry.startedAt === null &&
          entry.subcases.every((subcase) => subcase.startedAt === null)
      )
    ).toBe(true);
  });
  it("contradictory failed links dominate otherwise passing evidence", () => {
    const input = completeInput();
    const entry = first(input);
    const [link] = entry.evidence;
    if (link) {
      entry.evidence.push({ ...link, assertion: "failed" });
    }
    expect(buildXeroReport(input).exitCode).toBe(1);
  });
  it("links cannot be reused for another subcase", () => {
    const input = completeInput();
    const entry = first(input);
    const [subcase] = entry.subcases;
    if (subcase) {
      subcase.evidence = entry.evidence;
    }
    expect(buildXeroReport(input).exitCode).toBe(2);
  });
  it("arbitrary prerequisite keys are rejected without echoing them", () => {
    const input = completeInput();
    const malformed = {
      ...input,
      scenarios: [
        {
          ...first(input),
          prerequisites: {
            ...first(input).prerequisites,
            "Bearer synthetic-secret": true,
          },
        },
        ...input.scenarios.slice(1),
      ],
    };
    const report = buildXeroReport(malformed);
    expect(report.exitCode).toBe(2);
    expect(JSON.stringify(report.json) + report.markdown).not.toContain(
      "synthetic-secret"
    );
  });
  it("26 passing cases with 40 unverified cases cannot certify readiness", () => {
    const input = completeInput();
    input.lifecycleInput = undefined;
    expect(buildXeroReport(input).exitCode).toBe(2);
  });
  it("rejects lifecycle run or candidate mismatch", () => {
    const input = completeInput();
    input.lifecycleRunId = "00000000-0000-4000-8000-000000000001";
    expect(buildXeroReport(input).exitCode).toBe(2);
  });
  it("a recorded assertion failure exits one", () => {
    const input = completeInput();
    first(input).status = "FAIL";
    first(input).actual = "assertion-failed";
    first(input).reason = "assertion-failed";
    expect(buildXeroReport(input).exitCode).toBe(1);
  });
  it.each([
    "missing-layer",
    "queued-only",
    "wrong-mode",
    "wrong-scope",
    "wrong-candidate",
    "stale-evidence",
  ])("rejects %s as proof", (fault) => {
    const input = completeInput();
    const entry = first(input);
    const [evidence] = entry.evidence;
    if (!evidence) {
      throw new Error("Missing evidence");
    }
    if (fault === "missing-layer") {
      entry.evidence = [];
    }
    if (fault === "queued-only") {
      for (const item of entry.evidence) {
        item.terminal = "queued";
      }
    }
    if (fault === "wrong-mode") {
      entry.observedMode = "CONTROLLED";
    }
    if (fault === "wrong-scope") {
      evidence.fixtureAlias = "fixture-foreign";
    }
    if (fault === "wrong-candidate") {
      evidence.candidateSha = "c".repeat(40);
    }
    if (fault === "stale-evidence") {
      evidence.observedAt = "2020-01-01T00:00:00.000Z";
    }
    expect(buildXeroReport(input).exitCode).toBe(2);
  });
  it.each([
    "missing-scenario",
    "duplicate-scenario",
    "missing-subcase",
    "duplicate-subcase",
  ])("accounts for every ID after %s", (fault) => {
    const input = completeInput();
    if (fault === "missing-scenario") {
      input.scenarios.shift();
    }
    if (fault === "duplicate-scenario") {
      input.scenarios.push(first(input));
    }
    if (fault === "missing-subcase") {
      first(input).subcases = [];
    }
    if (fault === "duplicate-subcase") {
      const [entry] = first(input).subcases;
      if (entry) {
        first(input).subcases.push(entry);
      }
    }
    const report = buildXeroReport(input);
    expect(report.exitCode).toBe(2);
    expect(report.json.scenarios).toHaveLength(26);
    expect(report.json.validationErrors.length).toBeGreaterThan(0);
  });
  it("retained unsafe effects or failed cleanup fail the campaign", () => {
    const input = completeInput();
    input.cleanup.retained = [
      {
        alias: "fixture-unresolved",
        disposition: "unresolved-recovery",
        safe: false,
      },
    ];
    expect(buildXeroReport(input).exitCode).toBe(1);
    input.cleanup.retained = [];
    input.cleanup.local = "FAIL";
    expect(buildXeroReport(input).exitCode).toBe(1);
  });
  it("skipped and fabricated nonexecuted timings never pass", () => {
    const input = completeInput();
    first(input).status = "NOT VERIFIED";
    const report = buildXeroReport(input);
    expect(report.exitCode).toBe(2);
    expect(report.json.scenarios[0]?.startedAt).toBeNull();
  });
  it("malformed and secret-bearing input produces sanitised complete diagnostics", () => {
    const input = { ...completeInput(), secret: "sk_private-bearing-value" };
    const report = buildXeroReport(input);
    expect(report.exitCode).toBe(2);
    expect(report.json.scenarios).toHaveLength(26);
    expect(JSON.stringify(report.json)).not.toContain("sk_private");
  });
  it("stale deployed revision cannot pass", () => {
    const input = completeInput();
    if (input.deployments[0]) {
      input.deployments[0].revision = "c".repeat(40);
    }
    expect(buildXeroReport(input).exitCode).toBe(2);
  });
  it("rolls up all proven registered children without inventing parent executions", () => {
    const input = completeInput();
    const bootstrap = bootstrapXeroReport(input.startedAt, input.runId);
    input.scenarios = input.scenarios.map((entry, index) =>
      (() => {
        const base = bootstrap.scenarios[index];
        if (!base) {
          throw new Error("Missing catalogue entry");
        }
        return { ...base, subcases: entry.subcases };
      })()
    ); // Catalogue lengths are identical.
    const report = buildXeroReport(input);
    expect(report.json.counts.passed).toBe(26);
    expect(report.exitCode).toBe(0);
  });
  it("saved JSON rerenders offline with identity, provenance and verdict preserved", () => {
    const input = completeInput();
    const report = buildXeroReport(input);
    const paths = writeXeroReport("reports/xero-e2e", report);
    try {
      expect(
        reportCli(["--input", paths.jsonPath, "--output", "reports/xero-e2e"])
      ).toBe(0);
      const restored = JSON.parse(readFileSync(paths.jsonPath, "utf8"));
      expect(restored.runId).toBe(report.json.runId);
      expect(restored.startedAt).toBe(report.json.startedAt);
      expect(restored.lifecycleInput.expectedTargetFingerprints).toEqual(
        report.json.lifecycleInput?.expectedTargetFingerprints
      );
      expect(restored.lifecycle.status).toBe("PASS");
      expect(restored.counts.passed).toBe(26);
    } finally {
      rmSync(paths.jsonPath, { force: true });
      rmSync(paths.markdownPath, { force: true });
    }
  });
  it.each(["wrong-target", "missing-target"])(
    "offline rerender never promotes %s to readiness",
    (fault) => {
      const input = completeInput();
      const lifecycle = input.lifecycleInput as XeroEvidenceInput; // Known fixture input.
      if (fault === "wrong-target") {
        lifecycle.expectedTargetFingerprints.unit = `sha256:${"c".repeat(64)}`;
      } else {
        const { unit: _unit, ...expected } =
          lifecycle.expectedTargetFingerprints;
        lifecycle.expectedTargetFingerprints = expected;
      }
      const report = buildXeroReport(input);
      const paths = writeXeroReport("reports/xero-e2e", report);
      try {
        expect(report.exitCode).toBe(2);
        expect(
          reportCli(["--input", paths.jsonPath, "--output", "reports/xero-e2e"])
        ).toBe(2);
        const restored = JSON.parse(readFileSync(paths.jsonPath, "utf8"));
        expect(restored.lifecycle.status).toBe("NOT_VERIFIED");
        expect(restored.lifecycleInput.expectedTargetFingerprints.unit).toBe(
          lifecycle.expectedTargetFingerprints.unit
        );
      } finally {
        rmSync(paths.jsonPath, { force: true });
        rmSync(paths.markdownPath, { force: true });
      }
    }
  );

  it.each(["worker", "operation"])(
    "preserves authoritative failed %s receipts including a prior NV label",
    (layer) => {
      const input = completeInput();
      const scenario = input.scenarios.find((entry) => entry.id === "X04");
      const child = scenario?.subcases[0];
      const receipt = child?.evidence.find((entry) => entry.layer === layer);
      if (!(child && receipt)) {
        throw new Error("Missing fault fixture");
      }
      child.status = "NOT VERIFIED";
      receipt.assertion = "failed";
      receipt.terminal = "failed";
      expect(buildXeroReport(input).exitCode).toBe(1);
      receipt.candidateSha = "c".repeat(40);
      expect(buildXeroReport(input).exitCode).toBe(2);
    }
  );
  it("standalone renderer writer failure preserves an existing FAIL and its evidence", () => {
    const input = completeInput();
    input.cleanup.provider = "FAIL";
    const report = buildXeroReport(input);
    const paths = writeXeroReport("reports/xero-e2e", report);
    try {
      expect(
        reportCli([
          "--input",
          paths.jsonPath,
          "--output",
          "/tmp/forbidden-xero-report",
        ])
      ).toBe(1);
      const restored = JSON.parse(readFileSync(paths.jsonPath, "utf8"));
      expect(restored.runId).toBe(input.runId);
      expect(restored.cleanup.provider).toBe("FAIL");
      expect(restored.lifecycle.cases).toHaveLength(40);
    } finally {
      rmSync(paths.jsonPath, { force: true });
      rmSync(paths.markdownPath, { force: true });
    }
  });
  it("does not treat failed receipts outside the campaign time window as authoritative", () => {
    const input = completeInput();
    const child = input.scenarios.find((entry) => entry.id === "X04")
      ?.subcases[0];
    if (!child) {
      throw new Error("Missing fixture");
    }
    child.status = "NOT VERIFIED";
    child.startedAt = new Date(
      Date.parse(input.startedAt) - 60_000
    ).toISOString();
    child.endedAt = child.startedAt;
    for (const receipt of child.evidence) {
      receipt.observedAt = child.startedAt;
      receipt.assertion = "failed";
      receipt.terminal = "failed";
    }
    expect(buildXeroReport(input).exitCode).toBe(2);
  });
});

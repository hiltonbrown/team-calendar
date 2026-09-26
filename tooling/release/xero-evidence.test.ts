import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildXeroEvidence,
  writeXeroEvidence,
  XERO_EVIDENCE_CASES,
  type XeroEvidenceCaseId,
  type XeroEvidenceInput,
  type XeroEvidenceLevel,
  type XeroEvidenceObservation,
} from "./xero-evidence.js";

const candidateSha = "a".repeat(40);
const assessedAt = "2026-09-26T12:00:00.000Z";
const fingerprint = `sha256:${"b".repeat(64)}`;
function observation(
  caseId: XeroEvidenceCaseId,
  evidenceLevel: XeroEvidenceLevel,
  overrides: Partial<XeroEvidenceObservation> = {}
): XeroEvidenceObservation {
  const scenario = XERO_EVIDENCE_CASES.find((entry) => entry.caseId === caseId);
  if (!scenario) {
    throw new Error("Test requested an unknown case");
  }
  return {
    assertionPassed: true,
    candidateSha,
    cleanupEvidenceReference: `restricted:${fingerprint}`,
    cleanupStatus: "PASS",
    commandOrRunnerScenario: `${caseId}:${evidenceLevel}`,
    evidenceLevel,
    executed: true,
    executedAt: "2026-09-26T11:59:00.000Z",
    exitCodeOrObservedResult: 0,
    expectedAssertion: scenario.requirement,
    fixtureOwnershipReference: `restricted:${fingerprint}`,
    nonSecretTargetFingerprint: fingerprint,
    observedAssertion: "assertion_passed",
    remainingAction: null,
    restrictedEvidenceLocations: [`restricted:${fingerprint}`],
    status: "PASS",
    ...overrides,
  };
}
function input(results: XeroEvidenceInput["results"] = {}): XeroEvidenceInput {
  return {
    assessedAt,
    candidateSha,
    deployedSha: null,
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
    results,
  };
}
function completeInput(): XeroEvidenceInput {
  const value = input();
  value.deployedSha = candidateSha;
  for (const scenario of XERO_EVIDENCE_CASES) {
    value.results[scenario.caseId] = scenario.requiredEvidenceLevels.map(
      (level) => observation(scenario.caseId, level)
    );
  }
  return value;
}
function caseResult(value: unknown, caseId: XeroEvidenceCaseId) {
  const report = buildXeroEvidence(value);
  const scenario = report.json.cases.find((entry) => entry.caseId === caseId);
  if (!scenario) {
    throw new Error("Required case missing from report");
  }
  return scenario;
}

describe("Xero charter evidence", () => {
  it("requires all 40 charter cases and every listed minimum level independently", () => {
    expect(XERO_EVIDENCE_CASES).toHaveLength(40);
    expect(new Set(XERO_EVIDENCE_CASES.map((entry) => entry.caseId)).size).toBe(
      40
    );
    expect(XERO_EVIDENCE_CASES[0].requiredEvidenceLevels).toEqual([
      "unit",
      "database",
      "browser",
    ]);
    expect(XERO_EVIDENCE_CASES[29].requiredEvidenceLevels).toEqual([
      "unit",
      "controlled_integration",
    ]);
    expect(XERO_EVIDENCE_CASES[38].requiredEvidenceLevels).toEqual([
      "source_audit",
      "unit",
      "database",
    ]);
    expect(XERO_EVIDENCE_CASES[39].requiredEvidenceLevels).toEqual([
      "database",
      "distributed_store",
      "browser",
      "live_provider",
    ]);
  });
  it("passes only a complete fresh set of same-candidate asserted observations", () => {
    const report = buildXeroEvidence(completeInput());
    expect(report.exitCode).toBe(0);
    expect(report.json.status).toBe("PASS");
    expect(Object.values(report.json.statuses)).toEqual(
      new Array(5).fill("PASS")
    );
    expect(report.json.cases.every((entry) => entry.status === "PASS")).toBe(
      true
    );
    expect(report.json.deployedSha).toBe(candidateSha);
    expect(report.markdown).toContain(`Deployed SHA: ${candidateSha}`);
  });
  it("writes both reports and names a false mandatory prerequisite", () => {
    const value = completeInput();
    value.prerequisites.configured_database = false;
    const report = buildXeroEvidence(value);
    expect(report.exitCode).toBe(1);
    expect(report.json.status).toBe("NOT_VERIFIED");
    expect(report.json.missingPrerequisites).toContain("configured_database");
    expect(report.markdown).toContain("configured_database");
    expect(caseResult(value, "161-06").status).toBe("NOT_VERIFIED");
    const dir = mkdtempSync(join(tmpdir(), "xero-evidence-"));
    try {
      writeXeroEvidence(dir, report);
      expect(
        JSON.parse(readFileSync(join(dir, "xero-evidence.json"), "utf8"))
      ).toEqual(report.json);
      expect(readFileSync(join(dir, "xero-evidence.md"), "utf8")).toEqual(
        report.markdown
      );
      expect(statSync(join(dir, "xero-evidence.json")).mode % 0o1000).toBe(
        0o600
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
  it("records absent prerequisites and missing observations without inferring suite success", () => {
    const value = input();
    value.prerequisites = { ...value.prerequisites };
    Reflect.deleteProperty(value.prerequisites, "distributed_store");
    const report = buildXeroEvidence(value);
    expect(report.exitCode).toBe(1);
    expect(report.json.statuses.distributedStore).toBe("NOT_VERIFIED");
    expect(report.json.missingPrerequisites).toContain("distributed_store");
    expect(
      report.json.cases.every((entry) => entry.status === "NOT_VERIFIED")
    ).toBe(true);
  });
  it.each([
    { status: "SKIPPED" as const },
    { exitCodeOrObservedResult: "skipped" as const },
    { exitCodeOrObservedResult: "not_verified" as const },
    { observedAssertion: "assertion_not_executed" as const },
  ])(
    "keeps skipped or unverified required results NOT_VERIFIED: %j",
    (overrides) => {
      const value = input({
        "161-06": observation("161-06", "database", overrides),
      });
      expect(caseResult(value, "161-06").status).toBe("NOT_VERIFIED");
    }
  );
  it("never substitutes mocked transport for real provider or distributed-store evidence", () => {
    const provider = input({
      "161-18": [observation("161-18", "unit"), observation("161-18", "mock")],
    });
    expect(
      caseResult(provider, "161-18").evidence.find(
        (entry) => entry.evidenceLevel === "live_provider"
      )?.status
    ).toBe("NOT_VERIFIED");
    const store = input({
      "161-26": [observation("161-26", "unit"), observation("161-26", "mock")],
    });
    expect(caseResult(store, "161-26").status).toBe("NOT_VERIFIED");
  });
  it("does not let database evidence replace browser evidence", () => {
    const value = input({
      "161-01": [
        observation("161-01", "unit"),
        observation("161-01", "database"),
      ],
    });
    const scenario = caseResult(value, "161-01");
    expect(scenario.status).toBe("NOT_VERIFIED");
    expect(scenario.evidence.map((entry) => entry.status)).toEqual([
      "PASS",
      "PASS",
      "NOT_VERIFIED",
    ]);
  });
  it.each([
    { candidateSha: "c".repeat(40) },
    { executedAt: "2026-09-24T11:00:00.000Z" },
    { executedAt: "2026-09-26T12:01:00.000Z" },
    { executed: false },
    { nonSecretTargetFingerprint: `sha256:${"d".repeat(64)}` },
    { expectedAssertion: "Whole suite exited zero" },
    { fixtureOwnershipReference: null },
    { restrictedEvidenceLocations: [] },
    { cleanupStatus: "NOT_VERIFIED" as const },
    { cleanupStatus: "NOT_REQUIRED" as const },
    { cleanupEvidenceReference: null },
    { cleanupEvidenceReference: null, cleanupStatus: "FAIL" as const },
  ])(
    "rejects stale, cross-candidate, targetless or unproved evidence: %j",
    (overrides) => {
      const value = input({
        "161-06": observation("161-06", "database", overrides),
      });
      expect(caseResult(value, "161-06").status).toBe("NOT_VERIFIED");
    }
  );
  it.each([
    { assertionPassed: false },
    { status: "FAIL" as const },
    { exitCodeOrObservedResult: 1 },
    { cleanupStatus: "FAIL" as const },
    { observedAssertion: "assertion_failed" as const },
    { exitCodeOrObservedResult: "assertion_failed" as const },
  ])("records actual asserted failures: %j", (overrides) => {
    const value = completeInput();
    value.results["161-06"] = observation("161-06", "database", overrides);
    const report = buildXeroEvidence(value);
    expect(report.exitCode).toBe(1);
    expect(report.json.status).toBe("FAIL");
    expect(report.json.statuses.configuredDatabase).toBe("FAIL");
  });
  it("rejects conflicts without selecting the apparently successful observation", () => {
    const value = input({
      "161-06": [
        observation("161-06", "database"),
        observation("161-06", "database", {
          assertionPassed: false,
          status: "FAIL",
        }),
      ],
    });
    const scenario = caseResult(value, "161-06");
    expect(scenario.status).toBe("NOT_VERIFIED");
    expect(scenario.remainingAction).toContain("conflicting");
  });
  it("fails closed for malformed observations without echoing untrusted payload", () => {
    const value = input();
    const malformed = {
      ...value,
      results: {
        "161-06": {
          ...observation("161-06", "database"),
          executed: "true",
          privatePayload: "DO_NOT_PUBLISH",
        },
      },
    };
    const report = buildXeroEvidence(malformed);
    expect(report.exitCode).toBe(1);
    expect(caseResult(malformed, "161-06").status).toBe("NOT_VERIFIED");
    expect(JSON.stringify(report)).not.toContain("DO_NOT_PUBLISH");
  });
  it.each([
    null,
    {},
    { candidateSha: "bad" },
    { ...input(), prerequisites: { configured_database: "true" } },
    { ...input(), assessedAt: "not a date" },
    { ...input(), expectedTargetFingerprints: { database: "secret-url" } },
  ])("returns both nonempty reports for malformed input", (value) => {
    const report = buildXeroEvidence(value);
    expect(report.exitCode).toBe(1);
    expect(report.json.validationErrors).toContain("Malformed evidence input");
    expect(report.json.cases).toHaveLength(40);
    expect(report.markdown).toContain("NOT_VERIFIED");
  });
  it("requires explicitly established targets and rejects unknown cases", () => {
    const value = completeInput();
    value.expectedTargetFingerprints.database = undefined;
    expect(caseResult(value, "161-06").status).toBe("NOT_VERIFIED");
    const extraCase = {
      ...completeInput(),
      results: {
        ...completeInput().results,
        unknown: observation("161-06", "database"),
      },
    };
    expect(buildXeroEvidence(extraCase).exitCode).toBe(1);
  });

  it.each([
    { observedAssertion: "Bearer PRIVATE_CREDENTIAL" },
    { commandOrRunnerScenario: "bun test --token PRIVATE_CREDENTIAL" },
    {
      restrictedEvidenceLocations: [
        "https://example.com/?token=PRIVATE_CREDENTIAL",
      ],
    },
    { fixtureOwnershipReference: "<script>PRIVATE_CREDENTIAL</script>" },
    { remainingAction: '{"token":"PRIVATE_CREDENTIAL"}' },
  ])("rejects unsafe public metadata without reproducing it", (override) => {
    const value = {
      ...input(),
      results: {
        "161-06": { ...observation("161-06", "database"), ...override },
      },
    };
    const report = buildXeroEvidence(value);
    expect(report.exitCode).toBe(1);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_CREDENTIAL");
    expect(caseResult(value, "161-06").status).toBe("NOT_VERIFIED");
  });
  it("rejects arbitrary prerequisite names without rendering them", () => {
    const value = {
      ...completeInput(),
      prerequisites: {
        ...input().prerequisites,
        "<script>PRIVATE_CREDENTIAL</script>": false,
      },
    };
    const report = buildXeroEvidence(value);
    expect(report.exitCode).toBe(1);
    expect(report.json.validationErrors).toContain("Malformed evidence input");
    expect(JSON.stringify(report)).not.toContain("PRIVATE_CREDENTIAL");
  });
  it("keeps deployed and local candidate SHAs separate", () => {
    const value = completeInput();
    value.deployedSha = "e".repeat(40);
    const report = buildXeroEvidence(value);
    expect(report.json).toMatchObject({
      candidateSha,
      deployedSha: "e".repeat(40),
    });
    expect(report.json.status).toBe("NOT_VERIFIED");
    expect(report.exitCode).toBe(1);
    expect(report.json.validationErrors).toContain(
      "Deployed candidate does not match assessed source"
    );
    expect(
      report.json.cases.every((scenario) => scenario.status === "PASS")
    ).toBe(true);
  });
  it("requires actual deployment evidence without inventing a deployed SHA", () => {
    const value = completeInput();
    value.deployedSha = null;
    const report = buildXeroEvidence(value);
    expect(report.json.status).toBe("NOT_VERIFIED");
    expect(report.exitCode).toBe(1);
    expect(report.json.deployedSha).toBeNull();
    expect(report.markdown).toContain("Deployed SHA: NOT_VERIFIED");
    expect(report.json.validationErrors).toContain(
      "Deployed candidate evidence is missing"
    );
    expect(
      report.json.cases.every((scenario) => scenario.status === "PASS")
    ).toBe(true);
  });
  it("retains per-level assertion, target, ownership and cleanup evidence", () => {
    const value = completeInput();
    const scenario = caseResult(value, "161-02");
    expect(scenario.evidence).toHaveLength(3);
    expect(scenario.evidence[2].observation).toEqual(
      observation("161-02", "live_provider")
    );
    expect(
      scenario.evidence.every((entry) => entry.observation?.executed)
    ).toBe(true);
  });
  it("records bounded runner command outcome independently of programme readiness", () => {
    const value = {
      ...input(),
      runner: {
        cleanupStatus: "PASS",
        exitCode: 0,
        fenceState: "released",
        inventoryStatus: "PASS",
        outcome: "PASS",
        phase: "complete",
      },
    };
    const report = buildXeroEvidence(value);
    expect(report.json.runner).toEqual(value.runner);
    expect(report.exitCode).toBe(1);
    expect(report.json.status).toBe("NOT_VERIFIED");
    expect(
      report.json.cases.every((entry) => entry.status === "NOT_VERIFIED")
    ).toBe(true);
    expect(report.markdown).toContain("Runner inventoryStatus: PASS");
  });
  it("requires successful inventory, cleanup and fence release for runner-backed readiness", () => {
    const runner = {
      cleanupStatus: "PASS",
      exitCode: 0,
      fenceState: "released",
      inventoryStatus: "PASS",
      outcome: "PASS",
      phase: "complete",
    };
    const report = buildXeroEvidence({ ...completeInput(), runner });
    expect(report.json.runner).toEqual(runner);
    expect(report.json.status).toBe("PASS");
    expect(report.exitCode).toBe(0);
  });
  it.each([
    { phase: "authority" },
    { phase: "ownership" },
    { phase: "inventory" },
    { phase: "consumer_isolation" },
    { phase: "baseline" },
    { phase: "snapshot" },
    { phase: "tests" },
    { phase: "cleanup" },
    { phase: "release" },
    { inventoryStatus: "NOT_VERIFIED" },
    { cleanupStatus: "NOT_VERIFIED" },
    { fenceState: "held" },
    { fenceState: "not_acquired" },
    { fenceState: "unknown" },
    { failurePhase: "tests" },
    { failurePhase: "cleanup" },
    { outcome: "NOT_VERIFIED" },
  ])(
    "rejects incomplete or contradictory successful runner metadata: %j",
    (override) => {
      const runner = {
        cleanupStatus: "PASS",
        exitCode: 0,
        fenceState: "released",
        inventoryStatus: "PASS",
        outcome: "PASS",
        phase: "complete",
        ...override,
      };
      const report = buildXeroEvidence({ ...completeInput(), runner });
      expect(report.json.runner).toEqual(runner);
      expect(report.json.status).toBe("NOT_VERIFIED");
      expect(report.exitCode).toBe(1);
      expect(
        report.json.cases.every((scenario) => scenario.status === "PASS")
      ).toBe(true);
    }
  );
  it("retains failed cleanup and held fence without inventing case assertions", () => {
    const value = {
      ...input(),
      runner: {
        cleanupStatus: "FAIL",
        exitCode: 7,
        fenceState: "held",
        inventoryStatus: "PASS",
        outcome: "FAIL",
        phase: "cleanup",
      },
    };
    const report = buildXeroEvidence(value);
    expect(report.json.runner).toEqual(value.runner);
    expect(report.json.status).toBe("NOT_VERIFIED");
    expect(report.markdown).toContain("Runner fenceState: held");
  });
  it.each([
    { phase: "PRIVATE_PAYLOAD" },
    { outcome: "PRIVATE_PAYLOAD" },
    { exitCode: -1 },
    { exitCode: 256 },
    { inventoryStatus: "PRIVATE_PAYLOAD" },
    { cleanupStatus: "PRIVATE_PAYLOAD" },
    { fenceState: "PRIVATE_PAYLOAD" },
    { error: "PRIVATE_PAYLOAD" },
  ])(
    "rejects unbounded runner metadata without reflecting raw values: %j",
    (override) => {
      const runner = {
        cleanupStatus: "NOT_VERIFIED",
        exitCode: 1,
        fenceState: "not_acquired",
        inventoryStatus: "NOT_VERIFIED",
        outcome: "FAIL",
        phase: "authority",
        ...override,
      };
      const report = buildXeroEvidence({ ...input(), runner });
      expect(report.exitCode).toBe(1);
      expect(report.json.runner).toBeNull();
      expect(report.json.validationErrors).toContain(
        "Malformed evidence input"
      );
      expect(JSON.stringify(report)).not.toContain("PRIVATE_PAYLOAD");
    }
  );
  it.each([
    [
      {
        cleanupStatus: "PASS",
        exitCode: 0,
        fenceState: "released",
        inventoryStatus: "PASS",
        outcome: "FAIL",
        phase: "complete",
      },
      "FAIL",
    ],
    [
      {
        cleanupStatus: "FAIL",
        exitCode: 0,
        fenceState: "held",
        inventoryStatus: "PASS",
        outcome: "NOT_VERIFIED",
        phase: "cleanup",
      },
      "FAIL",
    ],
    [
      {
        cleanupStatus: "PASS",
        exitCode: 0,
        fenceState: "released",
        inventoryStatus: "FAIL",
        outcome: "NOT_VERIFIED",
        phase: "complete",
      },
      "FAIL",
    ],
    [
      {
        cleanupStatus: "PASS",
        exitCode: 2,
        fenceState: "released",
        inventoryStatus: "FAIL",
        outcome: "FAIL",
        phase: "complete",
      },
      "FAIL",
    ],
    [
      {
        cleanupStatus: "FAIL",
        exitCode: 7,
        fenceState: "held",
        inventoryStatus: "PASS",
        outcome: "FAIL",
        phase: "cleanup",
      },
      "FAIL",
    ],
    [
      {
        cleanupStatus: "PASS",
        exitCode: 7,
        fenceState: "released",
        inventoryStatus: "PASS",
        outcome: "PASS",
        phase: "complete",
      },
      "NOT_VERIFIED",
    ],
  ])(
    "does not declare programme PASS when asserted cases conflict with runner failure",
    (runner, expectedStatus) => {
      const report = buildXeroEvidence({ ...completeInput(), runner });
      expect(report.exitCode).toBe(1);
      expect(report.json.status).toBe(expectedStatus);
      expect(
        report.json.cases.every((scenario) => scenario.status === "PASS")
      ).toBe(true);
    }
  );
});

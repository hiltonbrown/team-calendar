import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { buildXeroEvidence, type XeroEvidenceInput } from "./xero-evidence.js";
import {
  XERO_SCENARIOS,
  type XeroScenarioDefinition,
} from "./xero-scenarios.js";

export const XERO_STATUSES = ["PASS", "FAIL", "NOT VERIFIED"] as const;
const lifecycleMetadataSchema = z.object({
  expectedTargetFingerprints: z.partialRecord(
    z.enum([
      "source_audit",
      "unit",
      "database",
      "distributed_store",
      "browser",
      "live_provider",
      "controlled_integration",
      "mock",
    ]),
    z.string().regex(/^sha256:[a-f0-9]{64}$/)
  ),
  prerequisites: z.partialRecord(
    z.enum([
      "source_checks",
      "configured_database",
      "distributed_store",
      "browser",
      "live_provider",
      "controlled_integration",
    ]),
    z.boolean()
  ),
});
const statusSchema = z.enum(XERO_STATUSES);
const nullableSha = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .nullable();
const reasonSchema = z.enum([
  "verified",
  "assertion-failed",
  "not-executed",
  "missing-prerequisite",
  "invalid-evidence",
  "invalid-cli",
  "manifest-unavailable",
  "manifest-invalid",
  "configuration-unavailable",
  "worker-isolation-unavailable",
  "deployment-unverified",
  "interrupted",
  "recovery-required",
  "cleanup-incomplete",
  "evidence-unavailable",
]);
export type XeroReason = z.infer<typeof reasonSchema>;
const aliasSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const evidenceSchema = z.strictObject({
  assertion: z.enum(["passed", "failed", "not-executed"]),
  candidateSha: nullableSha,
  eventAlias: aliasSchema.nullable(),
  fixtureAlias: aliasSchema,
  intercepted: z.literal(false),
  layer: z.enum([
    "provider",
    "operation",
    "database",
    "ui",
    "worker",
    "cleanup",
    "controlled",
  ]),
  logicalRunAlias: aliasSchema.nullable(),
  mode: z.enum(["LIVE", "CONTROLLED"]),
  observationId: z
    .string()
    .regex(/^X(?:0[1-9]|1[0-9]|2[0-6])(?:\.[a-z0-9-]+)?$/),
  observedAt: z.iso.datetime(),
  operationAlias: aliasSchema.nullable(),
  origin: z.literal("https://api.xero.com").nullable(),
  path: z.string().regex(/^sanitised\/[a-f0-9]{64}\.(json|txt|png)$/),
  runId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  terminal: z.enum([
    "succeeded",
    "failed",
    "not-required",
    "queued",
    "unknown",
  ]),
});
export type XeroScenarioEvidence = z.infer<typeof evidenceSchema>;
const observationSchema = z.strictObject({
  actual: z.enum(["assertion-passed", "assertion-failed", "not-executed"]),
  attempt: z.number().int().positive().nullable(),
  correlation: z.strictObject({
    fixtureAlias: aliasSchema.nullable(),
    operationAlias: aliasSchema.nullable(),
    runId: z.uuid().nullable(),
  }),
  durationMs: z.number().nonnegative().nullable(),
  endedAt: z.iso.datetime().nullable(),
  evidence: z.array(evidenceSchema).max(40),
  id: z.string().regex(/^X(?:0[1-9]|1[0-9]|2[0-6])(?:\.[a-z0-9-]+)?$/),
  observedMode: z.enum(["LIVE", "CONTROLLED"]).nullable(),
  prerequisites: z.partialRecord(
    z.enum([
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ]),
    z.boolean()
  ),
  reason: reasonSchema,
  startedAt: z.iso.datetime().nullable(),
  status: statusSchema,
});
export type XeroObservation = z.infer<typeof observationSchema>;
export function parseXeroObservations(value: unknown) {
  return z.array(scenarioSchema).max(100).parse(value);
}
const scenarioSchema = observationSchema
  .extend({
    derivedFromSubcases: z.literal(true).optional(),
    subcases: z.array(observationSchema).max(20),
  })
  .strict();
const cleanupSchema = z.strictObject({
  fenceReleased: z.boolean(),
  local: statusSchema,
  outsideOwned: statusSchema,
  provider: statusSchema,
  retained: z
    .array(
      z.strictObject({
        alias: aliasSchema,
        disposition: z.enum(["inactive-audit", "unresolved-recovery"]),
        safe: z.boolean(),
      })
    )
    .max(100),
  workers: statusSchema,
});
const deploymentSchema = z.strictObject({
  alias: z.enum(["app", "api", "web", "workers"]),
  observedAt: z.iso.datetime(),
  reference: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
});
const inputSchema = z.strictObject({
  authorisedFixtures: z
    .array(
      z.strictObject({
        alias: z.string().regex(/^fixture-[a-z0-9-]+$/),
        bindingGeneration: z.number().int().nonnegative(),
        cohort: z.enum(["A", "B", "C", "D"]),
        maximumMutations: z.number().int().nonnegative().max(20),
      })
    )
    .max(20)
    .nullable()
    .default(null),
  candidateSha: nullableSha,
  cleanup: cleanupSchema,
  contractDecision: z
    .string()
    .regex(/^au-contract-v[1-9][0-9]*$/)
    .nullable(),
  defects: z
    .array(
      z.strictObject({
        id: aliasSchema,
        owner: z.enum(["159", "161", "160", "infrastructure"]),
        reason: reasonSchema,
        severity: z.enum(["critical", "high", "medium", "low"]),
        status: z.enum(["open", "resolved"]),
      })
    )
    .max(100),
  deployments: z.array(deploymentSchema).max(4),
  diagnosticRunId: z.uuid(),
  endedAt: z.iso.datetime(),
  environment: aliasSchema.nullable(),
  harnessSha: nullableSha,
  lifecycleInput: z.unknown().optional(),
  lifecycleRunId: z.uuid().nullable(),
  limitations: z.array(reasonSchema).max(100),
  nextActions: z
    .array(
      z.enum([
        "provide-owned-fixtures",
        "approve-au-contract",
        "deploy-reviewed-candidate",
        "establish-worker-fencing",
        "provide-role-sessions",
        "reconcile-remote-effects",
        "rerun-required-cases",
        "repair-evidence",
      ])
    )
    .max(100),
  runId: z.uuid(),
  scenarios: z.array(scenarioSchema).max(100),
  schemaVersion: z.literal(1),
  startedAt: z.iso.datetime(),
  toolVersions: z
    .strictObject({
      bun: z.string().regex(/^[a-zA-Z0-9.+-]{1,60}$/),
      playwright: z.string().regex(/^[a-zA-Z0-9.+-]{1,60}$/),
    })
    .nullable()
    .default(null),
  verifiedRunId: z.uuid().nullable(),
});
export type XeroReportInput = z.infer<typeof inputSchema>;
export function emptyObservation(
  id: string,
  reason: XeroReason = "not-executed"
): XeroObservation {
  return {
    actual: "not-executed",
    attempt: null,
    correlation: { fixtureAlias: null, operationAlias: null, runId: null },
    durationMs: null,
    endedAt: null,
    evidence: [],
    id,
    observedMode: null,
    prerequisites: {},
    reason,
    startedAt: null,
    status: "NOT VERIFIED",
  };
}
export function bootstrapXeroReport(
  now = new Date().toISOString(),
  runId: string = randomUUID()
): XeroReportInput {
  return {
    authorisedFixtures: null,
    candidateSha: null,
    cleanup: {
      fenceReleased: false,
      local: "NOT VERIFIED",
      outsideOwned: "NOT VERIFIED",
      provider: "NOT VERIFIED",
      retained: [],
      workers: "NOT VERIFIED",
    },
    contractDecision: null,
    defects: [],
    deployments: [],
    diagnosticRunId: runId,
    endedAt: now,
    environment: null,
    harnessSha: null,
    lifecycleRunId: null,
    limitations: ["missing-prerequisite"],
    nextActions: [
      "provide-owned-fixtures",
      "approve-au-contract",
      "deploy-reviewed-candidate",
      "establish-worker-fencing",
      "provide-role-sessions",
    ],
    runId,
    scenarios: XERO_SCENARIOS.map((definition) => ({
      ...emptyObservation(definition.id),
      subcases: definition.subcases.map((suffix) =>
        emptyObservation(`${definition.id}.${suffix}`)
      ),
    })),
    schemaVersion: 1,
    startedAt: now,
    toolVersions: null,
    verifiedRunId: null,
  };
}
function aggregate(
  statuses: readonly (typeof XERO_STATUSES)[number][]
): (typeof XERO_STATUSES)[number] {
  if (statuses.includes("FAIL")) {
    return "FAIL";
  }
  return statuses.length && statuses.every((entry) => entry === "PASS")
    ? "PASS"
    : "NOT VERIFIED";
}
function validatedObservation(
  entry: XeroObservation,
  definition: XeroScenarioDefinition,
  input: XeroReportInput
): XeroObservation {
  const start = Date.parse(entry.startedAt ?? "");
  const end = Date.parse(entry.endedAt ?? "");
  const reportStart = Date.parse(input.startedAt);
  const reportEnd = Date.parse(input.endedAt);
  const linksValid = entry.evidence.every(
    (evidence) =>
      start >= reportStart &&
      end <= reportEnd &&
      end >= start &&
      evidence.observationId === entry.id &&
      evidence.operationAlias === entry.correlation.operationAlias &&
      (evidence.layer !== "worker" ||
        (evidence.eventAlias !== null && evidence.logicalRunAlias !== null)) &&
      evidence.mode === definition.requiredMode &&
      evidence.runId === input.runId &&
      evidence.candidateSha === input.candidateSha &&
      evidence.fixtureAlias === entry.correlation.fixtureAlias &&
      Date.parse(evidence.observedAt) >= start &&
      Date.parse(evidence.observedAt) <= end &&
      (evidence.layer !== "provider" ||
        definition.requiredMode !== "LIVE" ||
        evidence.origin === "https://api.xero.com")
  );
  if (
    linksValid &&
    entry.evidence.some(
      (evidence) =>
        evidence.assertion === "failed" || evidence.terminal === "failed"
    )
  ) {
    return {
      ...entry,
      actual: "assertion-failed",
      reason: "assertion-failed",
      status: "FAIL",
    };
  }
  if (entry.status === "NOT VERIFIED") {
    return {
      ...emptyObservation(entry.id, entry.reason),
      prerequisites: entry.prerequisites,
    };
  }
  const evidenceValid =
    linksValid &&
    definition.requiredLayers.every((layer) =>
      entry.evidence.some(
        (evidence) =>
          evidence.layer === layer &&
          evidence.observationId === entry.id &&
          evidence.assertion === "passed" &&
          evidence.mode === definition.requiredMode &&
          evidence.runId === input.runId &&
          evidence.candidateSha === input.candidateSha &&
          evidence.fixtureAlias === entry.correlation.fixtureAlias &&
          Date.parse(evidence.observedAt) >= start &&
          Date.parse(evidence.observedAt) <= end &&
          (layer !== "provider" ||
            definition.requiredMode !== "LIVE" ||
            evidence.origin === "https://api.xero.com") &&
          ((layer !== "operation" && layer !== "worker") ||
            evidence.terminal === "succeeded" ||
            (layer === "operation" &&
              evidence.terminal === "not-required" &&
              definition.requiredMode === "CONTROLLED"))
      )
    );
  const valid =
    (!(
      definition.requiredLayers.includes("operation") ||
      definition.requiredLayers.includes("worker")
    ) ||
      entry.correlation.operationAlias !== null) &&
    entry.observedMode === definition.requiredMode &&
    entry.attempt !== null &&
    entry.correlation.runId === input.runId &&
    entry.correlation.fixtureAlias !== null &&
    start >= reportStart &&
    end >= start &&
    end <= reportEnd &&
    entry.durationMs === end - start &&
    definition.prerequisites.every(
      (name) => entry.prerequisites[name] === true
    ) &&
    entry.actual ===
      (entry.status === "PASS" ? "assertion-passed" : "assertion-failed");
  if (entry.status === "PASS" && !(valid && evidenceValid)) {
    return emptyObservation(entry.id, "invalid-evidence");
  }
  if (entry.status === "FAIL" && !valid) {
    return emptyObservation(entry.id, "invalid-evidence");
  }
  return entry;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep exact catalogue accounting and independent lifecycle verdict aggregation together.
export function buildXeroReport(value: unknown) {
  const parsed = inputSchema.safeParse(value);
  const fallback = bootstrapXeroReport();
  const input = parsed.success ? parsed.data : fallback;
  const validationErrors: string[] = parsed.success
    ? []
    : ["Malformed or unsafe report input"];
  const knownIds = new Set(XERO_SCENARIOS.map((entry) => entry.id));
  if (input.scenarios.some((entry) => !knownIds.has(entry.id))) {
    validationErrors.push("Unknown scenario ID");
  }
  const scenarios = XERO_SCENARIOS.map((definition) => {
    const entries = input.scenarios.filter(
      (candidate) => candidate.id === definition.id
    );
    if (entries.length !== 1) {
      validationErrors.push("Missing or duplicated scenario ID");
    }
    const entry = entries.length === 1 ? entries[0] : undefined;
    const subcases = definition.subcases.map((suffix) => {
      const id = `${definition.id}.${suffix}`;
      const matches =
        entry?.subcases.filter((subcase) => subcase.id === id) ?? [];
      if (matches.length !== 1) {
        validationErrors.push("Missing or duplicated subcase ID");
      }
      const observation = matches.length === 1 ? matches[0] : undefined;
      return validatedObservation(
        observation ?? emptyObservation(id, "invalid-evidence"),
        definition,
        input
      );
    });
    if (
      entry?.subcases.some(
        (subcase) =>
          !definition.subcases.some(
            (suffix) => subcase.id === `${definition.id}.${suffix}`
          )
      )
    ) {
      validationErrors.push("Unknown subcase ID");
    }
    const derive =
      entry?.derivedFromSubcases === true ||
      (entry?.status === "NOT VERIFIED" && entry.reason === "not-executed");
    let parent = validatedObservation(
      entry ?? emptyObservation(definition.id, "invalid-evidence"),
      definition,
      input
    );
    const childrenStatus = aggregate(subcases.map((subcase) => subcase.status));
    if (derive && childrenStatus === "PASS") {
      const start = Math.min(
        ...subcases.map((subcase) => Date.parse(subcase.startedAt ?? ""))
      );
      const end = Math.max(
        ...subcases.map((subcase) => Date.parse(subcase.endedAt ?? ""))
      );
      parent = {
        ...emptyObservation(definition.id),
        actual: "assertion-passed",
        attempt: Math.max(...subcases.map((subcase) => subcase.attempt ?? 1)),
        correlation: {
          fixtureAlias: null,
          operationAlias: null,
          runId: input.runId,
        },
        durationMs: end - start,
        endedAt: new Date(end).toISOString(),
        evidence: subcases.flatMap((subcase) => subcase.evidence),
        observedMode: definition.requiredMode,
        prerequisites: Object.fromEntries(
          definition.prerequisites.map((key) => [key, true])
        ),
        reason: "verified",
        startedAt: new Date(start).toISOString(),
        status: "PASS",
      };
    }
    const status = aggregate([parent.status, childrenStatus]);
    return {
      ...(status === "NOT VERIFIED"
        ? emptyObservation(
            definition.id,
            parent.reason === "verified" ? "invalid-evidence" : parent.reason
          )
        : parent),
      status,
      ...(derive ? { derivedFromSubcases: true as const } : {}),
      expected: definition.expected,
      name: definition.name,
      requiredMode: definition.requiredMode,
      subcases,
    };
  });
  const deploymentAliases = new Set(
    input.deployments.map((entry) => entry.alias)
  );
  const deploymentValid =
    deploymentAliases.size === 4 &&
    input.deployments.length === 4 &&
    input.candidateSha !== null &&
    input.deployments.every(
      (entry) =>
        entry.revision === input.candidateSha &&
        Date.parse(entry.observedAt) >= Date.parse(input.startedAt) &&
        Date.parse(entry.observedAt) <= Date.parse(input.endedAt)
    );
  const identityValid =
    input.verifiedRunId === input.runId &&
    input.candidateSha !== null &&
    input.harnessSha !== null &&
    input.environment !== null &&
    input.contractDecision !== null &&
    Date.parse(input.endedAt) >= Date.parse(input.startedAt) &&
    Date.parse(input.endedAt) - Date.parse(input.startedAt) <=
      24 * 60 * 60 * 1000 &&
    Date.parse(input.endedAt) <= Date.now() + 30_000;
  const cleanupStatus = aggregate([
    input.cleanup.local,
    input.cleanup.provider,
    input.cleanup.workers,
    input.cleanup.outsideOwned,
    input.cleanup.fenceReleased ? "PASS" : "NOT VERIFIED",
    ...input.cleanup.retained.map((entry) =>
      entry.safe && entry.disposition === "inactive-audit"
        ? ("PASS" as const)
        : ("FAIL" as const)
    ),
  ]);
  let overall = aggregate([
    ...scenarios.map((entry) => entry.status),
    cleanupStatus,
    ...input.defects
      .filter(
        (entry) =>
          entry.status === "open" &&
          ["critical", "high"].includes(entry.severity)
      )
      .map(() => "FAIL" as const),
  ]);
  if (
    overall === "PASS" &&
    !(
      deploymentValid &&
      identityValid &&
      validationErrors.length === 0 &&
      input.toolVersions !== null &&
      input.authorisedFixtures !== null &&
      input.authorisedFixtures.length > 0
    )
  ) {
    overall = "NOT VERIFIED";
  }
  const counts = {
    controlledExecuted: scenarios.filter(
      (entry) => entry.startedAt !== null && entry.requiredMode === "CONTROLLED"
    ).length,
    failed: scenarios.filter((entry) => entry.status === "FAIL").length,
    liveExecuted: scenarios.filter(
      (entry) => entry.startedAt !== null && entry.requiredMode === "LIVE"
    ).length,
    notVerified: scenarios.filter((entry) => entry.status === "NOT VERIFIED")
      .length,
    passed: scenarios.filter((entry) => entry.status === "PASS").length,
  };
  const { lifecycleInput, ...safeInput } = input;
  const lifecycle = buildXeroEvidence(lifecycleInput).json;
  if (
    overall === "PASS" &&
    (lifecycle.status !== "PASS" ||
      lifecycle.candidateSha !== input.candidateSha ||
      input.lifecycleRunId !== input.runId ||
      lifecycle.assessedAt === null ||
      Date.parse(lifecycle.assessedAt) < Date.parse(input.startedAt) ||
      Date.parse(lifecycle.assessedAt) > Date.parse(input.endedAt))
  ) {
    overall = "NOT VERIFIED";
  }
  if (lifecycle.status === "FAIL") {
    overall = "FAIL";
  }
  let canonicalLifecycle: XeroEvidenceInput | null = null;
  const lifecycleMetadata = lifecycleMetadataSchema.safeParse(lifecycleInput);
  if (
    lifecycle.candidateSha &&
    lifecycle.assessedAt &&
    lifecycleMetadata.success
  ) {
    canonicalLifecycle = {
      assessedAt: lifecycle.assessedAt,
      candidateSha: lifecycle.candidateSha,
      deployedSha: lifecycle.deployedSha,
      expectedTargetFingerprints:
        lifecycleMetadata.data.expectedTargetFingerprints,
      prerequisites: lifecycleMetadata.data.prerequisites,
      results: {},
      ...(lifecycle.runner ? { runner: lifecycle.runner } : {}),
    };
    for (const scenario of lifecycle.cases) {
      const observations = scenario.evidence.flatMap((entry) =>
        entry.observation ? [entry.observation] : []
      );
      canonicalLifecycle.results[scenario.caseId] = observations;
    }
  }
  const json = {
    ...safeInput,
    cleanupStatus,
    counts,
    lifecycle,
    lifecycleInput: canonicalLifecycle,
    overall,
    scenarios,
    timeZone: "Australia/Brisbane",
    validationErrors: [...new Set(validationErrors)],
  };
  const lines = [
    "# Xero end-to-end test report",
    "",
    `Verdict: ${overall}`,
    `Tools: Bun ${input.toolVersions?.bun ?? "unknown"}; Playwright ${input.toolVersions?.playwright ?? "unknown"}`,
    `Authorised fixtures: ${input.authorisedFixtures?.map((fixture) => `${fixture.alias} (cohort ${fixture.cohort}, generation ${fixture.bindingGeneration}, mutation limit ${fixture.maximumMutations})`).join(", ") ?? "unknown"}`,
    `Candidate: ${input.candidateSha ?? "unknown"}; harness: ${input.harnessSha ?? "unknown"}`,
    `Environment: ${input.environment ?? "unknown"}; AU contract: ${input.contractDecision ?? "unresolved"}`,
    `UTC window: ${input.startedAt} to ${input.endedAt}`,
    `Brisbane window: ${new Date(input.startedAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })} to ${new Date(input.endedAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}`,
    `Executed: ${counts.liveExecuted} LIVE, ${counts.controlledExecuted} CONTROLLED; ${counts.passed} passed, ${counts.failed} failed, ${counts.notVerified} not verified.`,
    "",
    "## Scenario results",
    "",
    "| ID | Scenario | Mode | Result | Expected versus observed | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...scenarios.map(
      (entry) =>
        `| ${entry.id} | ${entry.name} | ${entry.requiredMode} | ${entry.status} | ${entry.actual}; ${entry.reason} | ${entry.evidence.length} validated links |`
    ),
    "",
    "## Defects",
    "",
    ...input.defects.map(
      (entry) =>
        `${entry.id}: ${entry.severity}, ${entry.status}, owner Plan ${entry.owner}, ${entry.reason}`
    ),
    "",
    "## Cleanup and retained records",
    "",
    `Cleanup: ${cleanupStatus}; provider ${input.cleanup.provider}; local ${input.cleanup.local}; workers ${input.cleanup.workers}; outside-owned ${input.cleanup.outsideOwned}; fence released ${input.cleanup.fenceReleased}.`,
    ...input.cleanup.retained.map(
      (entry) => `${entry.alias}: ${entry.disposition}, safe ${entry.safe}`
    ),
    "",
    "## Lifecycle coverage",
    "",
    `All ${lifecycle.cases.length} charter cases accounted for: ${lifecycle.status}.`,
    ...lifecycle.cases.map((entry) => `${entry.caseId}: ${entry.status}`),
    "",
    "## Coverage limits and next actions",
    "",
    `Limits: ${input.limitations.join(", ")}; validation: ${[...new Set(validationErrors)].join(", ") || "none"}.`,
    `Next actions: ${input.nextActions.join(", ")}.`,
    "Australian coverage only. This report does not certify product release readiness.",
    "",
  ];
  const exitCodes = { FAIL: 1, "NOT VERIFIED": 2, PASS: 0 } as const; // Closed verdict-to-exit contract.
  return {
    exitCode: exitCodes[overall],
    json,
    markdown: lines.join("\n"),
  };
}
export function writeXeroReport(
  directory: string,
  report: ReturnType<typeof buildXeroReport>
) {
  const output = resolve(directory);
  if (output !== resolve("reports/xero-e2e")) {
    throw new Error("Sanitised report destination is invalid");
  }
  for (const candidateDirectory of [resolve("reports"), output]) {
    if (
      existsSync(candidateDirectory) &&
      lstatSync(candidateDirectory).isSymbolicLink()
    ) {
      throw new Error("Sanitised report destination is unsafe");
    }
  }
  mkdirSync(output, { mode: 0o700, recursive: true });
  const basename = `${report.json.startedAt.slice(0, 10)}-${report.json.runId}`;
  const jsonPath = join(output, `${basename}.json`);
  const markdownPath = join(output, `${basename}.md`);
  for (const path of [jsonPath, markdownPath]) {
    if (
      existsSync(path) &&
      (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())
    ) {
      throw new Error("Sanitised report file is unsafe");
    }
  }
  writeFileSync(jsonPath, `${JSON.stringify(report.json, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(markdownPath, report.markdown, { mode: 0o600 });
  chmodSync(jsonPath, 0o600);
  chmodSync(markdownPath, 0o600);
  return { jsonPath, markdownPath };
}
export function reportCli(args: string[]) {
  let report = buildXeroReport(bootstrapXeroReport());
  let built = false;
  try {
    if (
      args.length !== 4 ||
      args[0] !== "--input" ||
      args[2] !== "--output" ||
      !args[1] ||
      !args[3]
    ) {
      throw new Error("Invalid report CLI");
    }
    const value: unknown = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
    // Derived fields are removed explicitly; unsafe unknown fields still fail closed.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const {
        counts: _counts,
        overall: _overall,
        validationErrors: _validation,
        cleanupStatus: _cleanup,
        lifecycle: _lifecycle,
        timeZone: _zone,
        ...input
      } = z.record(z.string(), z.unknown()).parse(value);
      if (Array.isArray(input.scenarios)) {
        input.scenarios = input.scenarios.map((scenarioValue) => {
          const row = z.record(z.string(), z.unknown()).parse(scenarioValue);
          const { name, expected, requiredMode, ...observation } = row;
          const definition = XERO_SCENARIOS.find(
            (entry) => entry.id === observation.id
          );
          if (
            name !== undefined &&
            (!definition ||
              name !== definition.name ||
              expected !== definition.expected ||
              requiredMode !== definition.requiredMode)
          ) {
            throw new Error("Derived scenario metadata is invalid");
          }
          return observation;
        });
      }
      report = buildXeroReport(input);
    } else {
      report = buildXeroReport(value);
    }
    built = true;
    writeXeroReport(args[3], report);
  } catch {
    if (!built) {
      const input = bootstrapXeroReport();
      input.limitations = ["invalid-evidence"];
      report = buildXeroReport(input);
    }
    try {
      writeXeroReport("reports/xero-e2e", report);
    } catch {
      process.stderr.write(
        `${JSON.stringify(report.json)}\n${report.markdown}`
      );
    }
  }
  return report.exitCode;
}
if (import.meta.main) {
  process.exitCode = reportCli(process.argv.slice(2));
}

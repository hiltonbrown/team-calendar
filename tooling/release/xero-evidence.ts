import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const evidenceLevels = [
  "source_audit",
  "unit",
  "database",
  "distributed_store",
  "browser",
  "live_provider",
  "controlled_integration",
  "mock",
] as const;
export type XeroEvidenceLevel = (typeof evidenceLevels)[number];
export type XeroEvidenceStatus = "PASS" | "FAIL" | "NOT_VERIFIED";
export type XeroEvidenceCaseId =
  `161-${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23" | "24" | "25" | "26" | "27" | "28" | "29" | "30" | "31" | "32" | "33" | "34" | "35" | "36" | "37" | "38" | "39" | "40"}`;
export interface XeroEvidenceCase {
  caseId: XeroEvidenceCaseId;
  requiredEvidenceLevels: readonly XeroEvidenceLevel[];
  requirement: string;
}

export const XERO_EVIDENCE_CASES: readonly XeroEvidenceCase[] = [
  {
    caseId: "161-01",
    requiredEvidenceLevels: ["unit", "database", "browser"],
    requirement:
      "Wrong-file reconnect rejects without changing the selection transaction or dispatching sync",
  },
  {
    caseId: "161-02",
    requiredEvidenceLevels: ["unit", "database", "live_provider"],
    requirement:
      "Same-file reconnect preserves internal payroll/person/feed identities and uses renewed credentials",
  },
  {
    caseId: "161-03",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Concurrent cross-account claims yield one reserved external binding and a non-disclosing conflict",
  },
  {
    caseId: "161-04",
    requiredEvidenceLevels: ["unit", "database", "browser"],
    requirement:
      "Two sessions for one entity, expiry, replay and tampered intended organisation cannot bypass intent",
  },
  {
    caseId: "161-05",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Callback initiated before disconnect cannot reactivate the old binding generation",
  },
  {
    caseId: "161-06",
    requiredEvidenceLevels: ["database"],
    requirement:
      "Reserved-slot CHECK, both uniqueness directions, scoped FKs and historical NULL rows behave correctly",
  },
  {
    caseId: "161-07",
    requiredEvidenceLevels: ["unit", "database", "live_provider"],
    requirement:
      "Same authoriser/two payroll files share coordinated usable credentials without sharing payroll access",
  },
  {
    caseId: "161-08",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Same verified authoriser across two Clerk accounts grants no cross-account access or new binding",
  },
  {
    caseId: "161-09",
    requiredEvidenceLevels: ["unit", "database", "live_provider"],
    requirement:
      "Repeated authorisation and reversed/same-second callback arrival cannot overwrite a known newer usable owner set",
  },
  {
    caseId: "161-10",
    requiredEvidenceLevels: ["unit", "database", "live_provider"],
    requirement:
      "Authorise B then abandon selection: A remains serviceable; B is not implicitly bound",
  },
  {
    caseId: "161-11",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Token exchange succeeds, inventory/body/persistence fails: candidate/attempt remains recoverable without blind code replay",
  },
  {
    caseId: "161-12",
    requiredEvidenceLevels: ["unit", "database", "live_provider"],
    requirement:
      "Second authoriser reconnects same file; retiring old link preserves the new link and unrelated old-authoriser files",
  },
  {
    caseId: "161-13",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Concurrent refresh, adoption, disconnect and key re-encryption do not lose the winning token or resurrect a binding",
  },
  {
    caseId: "161-14",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Lost refresh response/commit acknowledgement and grace-window expiry have controlled distinct recovery",
  },
  {
    caseId: "161-15",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Empty/scrubbed ciphertext or a changed inactive token is not reported as successful refresh",
  },
  {
    caseId: "161-16",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Unknown encryption version/corrupt envelope fail safely; old/new versions coexist and re-encryption is CAS-safe",
  },
  {
    caseId: "161-17",
    requiredEvidenceLevels: ["unit", "live_provider"],
    requirement:
      "Management token without refresh token parses correctly and cannot reach Payroll adapters",
  },
  {
    caseId: "161-18",
    requiredEvidenceLevels: ["unit", "live_provider"],
    requirement:
      "Management inventory coverage and exact-target DELETE/absence are evidenced, with no guessed pagination",
  },
  {
    caseId: "161-19",
    requiredEvidenceLevels: ["unit", "database", "browser"],
    requirement:
      "Local disable remains committed through provider outage; aggregate receipt stays pending/partial/unknown truthfully",
  },
  {
    caseId: "161-20",
    requiredEvidenceLevels: ["unit", "live_provider"],
    requirement:
      "DELETE success, valid absence, auth denial, rate limit, 5xx and timeout are distinct outcomes",
  },
  {
    caseId: "161-21",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Old unsent cleanup cancels without a provider call; issued unknown/late cleanup cannot permit unsafe reconnect",
  },
  {
    caseId: "161-22",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Lost/duplicate Inngest delivery and crash before/after dispatch recover without uncontrolled duplicate deletion",
  },
  {
    caseId: "161-23",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Session scrubbing preserves non-secret provenance; no duplicate independently rotating cleanup token survives",
  },
  {
    caseId: "161-24",
    requiredEvidenceLevels: ["unit", "database", "live_provider"],
    requirement:
      "Unselected prior/foreign connections are protected; abandoned new-link candidates require specific evidence",
  },
  {
    caseId: "161-25",
    requiredEvidenceLevels: ["unit", "database", "browser"],
    requirement:
      "Repeat soft disconnect, later destructive request and failed data action have idempotent truthful outcomes",
  },
  {
    caseId: "161-26",
    requiredEvidenceLevels: ["unit", "distributed_store"],
    requirement:
      "Two processes share aggregate tenant minute/day/concurrency and app-wide allowance across tenants",
  },
  {
    caseId: "161-27",
    requiredEvidenceLevels: ["unit", "distributed_store"],
    requirement:
      "Rolling boundaries, delayed headers, retry cooldown, request-ID replay, owner release and crash expiry do not over-admit",
  },
  {
    caseId: "161-28",
    requiredEvidenceLevels: ["unit", "distributed_store"],
    requirement:
      "Missing/lost store state, malformed result or outage prevents provider dispatch; no process-local fallback",
  },
  {
    caseId: "161-29",
    requiredEvidenceLevels: ["unit", "distributed_store"],
    requirement:
      "Payroll daily exhaustion does not masquerade as a token/connection-management tenant quota",
  },
  {
    caseId: "161-30",
    requiredEvidenceLevels: ["unit", "controlled_integration"],
    requirement:
      "Absolute deadline survives lock waits, retries and a slow body; permits/timers/listeners are cleaned up",
  },
  {
    caseId: "161-31",
    requiredEvidenceLevels: ["unit", "browser", "live_provider"],
    requirement:
      "Missing scope on first/retry response yields update-permissions and exact permitted refresh count",
  },
  {
    caseId: "161-32",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Tenant permission failure, owner invalid grant and app-credential failure have different impact scopes",
  },
  {
    caseId: "161-33",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Pre-dispatch rejection is a definite non-attempt; post-dispatch lost payroll response remains uncertain and is not replayed",
  },
  {
    caseId: "161-34",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Old-generation jobs/results are cancelled/fenced without misreporting successful sync",
  },
  {
    caseId: "161-35",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Active feed with no login, deliberately paused service and missing evidence never trigger inactivity deletion",
  },
  {
    caseId: "161-36",
    requiredEvidenceLevels: ["unit", "database"],
    requirement:
      "Legacy duplicates/unverified identity stop affected backfill safely; reruns preserve every payroll ID and owned cleanup",
  },
  {
    caseId: "161-37",
    requiredEvidenceLevels: ["unit", "database", "browser"],
    requirement:
      "Tokens/codes/state/payroll payloads and foreign identity do not appear in DTOs, logs, jobs or public evidence",
  },
  {
    caseId: "161-38",
    requiredEvidenceLevels: ["unit"],
    requirement:
      "Origin/redirect/JWKS checks reject credential exfiltration and identity substitution; test overrides cannot operate in production",
  },
  {
    caseId: "161-39",
    requiredEvidenceLevels: ["source_audit", "unit", "database"],
    requirement:
      "Final code has no independently rotating legacy credential consumers and no direct quota bypass",
  },
  {
    caseId: "161-40",
    requiredEvidenceLevels: [
      "database",
      "distributed_store",
      "browser",
      "live_provider",
    ],
    requirement:
      "Same candidate passes required gates, safe rollout controls and reduced-service/rollback procedures",
  },
];

// Fresh execution evidence is required even when the source candidate is unchanged.
export const XERO_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const fingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const prerequisiteCodes = [
  "source_checks",
  "configured_database",
  "distributed_store",
  "browser",
  "live_provider",
  "controlled_integration",
] as const;
const referenceSchema = z.string().regex(/^restricted:sha256:[a-f0-9]{64}$/);
const assertionSchema = z
  .string()
  .refine((value) =>
    XERO_EVIDENCE_CASES.some((entry) => entry.requirement === value)
  );
const scenarioSchema = z
  .string()
  .regex(
    /^161-(?:0[1-9]|[1-3][0-9]|40):(source_audit|unit|database|distributed_store|browser|live_provider|controlled_integration|mock)$/
  );
const observationSchema = z.strictObject({
  assertionPassed: z.boolean(),
  candidateSha: shaSchema,
  cleanupEvidenceReference: referenceSchema.nullable(),
  cleanupStatus: z.enum(["PASS", "FAIL", "NOT_VERIFIED", "NOT_REQUIRED"]),
  commandOrRunnerScenario: scenarioSchema,
  evidenceLevel: z.enum(evidenceLevels),
  executed: z.boolean(),
  executedAt: z.iso.datetime(),
  exitCodeOrObservedResult: z.union([
    z.number().int(),
    z.enum(["assertion_passed", "assertion_failed", "skipped", "not_verified"]),
  ]),
  expectedAssertion: assertionSchema,
  fixtureOwnershipReference: referenceSchema.nullable(),
  nonSecretTargetFingerprint: fingerprintSchema,
  observedAssertion: z.enum([
    "assertion_passed",
    "assertion_failed",
    "assertion_not_executed",
  ]),
  remainingAction: z
    .enum(["rerun_assertion", "verify_cleanup", "establish_prerequisite"])
    .nullable(),
  restrictedEvidenceLocations: z.array(referenceSchema).max(20),
  status: z.enum(["PASS", "FAIL", "NOT_VERIFIED", "SKIPPED"]),
});
export function parseXeroEvidenceObservation(value: unknown) {
  return observationSchema.parse(value);
}
export type XeroEvidenceObservation = z.infer<typeof observationSchema>;
const runnerPhaseSchema = z.enum([
  "authority",
  "ownership",
  "inventory",
  "consumer_isolation",
  "baseline",
  "snapshot",
  "tests",
  "cleanup",
  "release",
  "complete",
]);
const runnerSchema = z.strictObject({
  cleanupStatus: z.enum(["PASS", "FAIL", "NOT_VERIFIED"]),
  exitCode: z.number().int().min(0).max(255),
  failurePhase: runnerPhaseSchema.optional(),
  fenceState: z.enum(["not_acquired", "held", "released", "unknown"]),
  inventoryStatus: z.enum(["PASS", "FAIL", "NOT_VERIFIED"]),
  outcome: z.enum(["PASS", "FAIL", "NOT_VERIFIED"]),
  phase: runnerPhaseSchema,
});
export type XeroRunnerEvidence = z.infer<typeof runnerSchema>;
export type XeroEvidenceRunnerMetadata = XeroRunnerEvidence;

export interface XeroEvidenceInput {
  assessedAt: string;
  candidateSha: string;
  deployedSha: string | null;
  expectedTargetFingerprints: Partial<Record<XeroEvidenceLevel, string>>;
  prerequisites: Record<string, boolean>;
  results: Partial<
    Record<
      XeroEvidenceCaseId,
      XeroEvidenceObservation | readonly XeroEvidenceObservation[]
    >
  >;
  runner?: XeroEvidenceRunnerMetadata;
}
const inputSchema = z.strictObject({
  assessedAt: z.iso.datetime(),
  candidateSha: shaSchema,
  deployedSha: shaSchema.nullable(),
  expectedTargetFingerprints: z.partialRecord(
    z.enum(evidenceLevels),
    fingerprintSchema
  ),
  prerequisites: z.partialRecord(z.enum(prerequisiteCodes), z.boolean()),
  results: z.record(z.string(), z.unknown()),
  runner: runnerSchema.optional(),
});
function parseEvidenceCaseObservations(raw: unknown, onInvalid?: () => void) {
  const observations = Array.isArray(raw) ? raw : [raw];
  const accepted: XeroEvidenceObservation[] = [];
  for (const observation of observations) {
    try {
      accepted.push(observationSchema.parse(observation));
    } catch (error) {
      if (!onInvalid) {
        throw error;
      }
      onInvalid();
    }
  }
  return accepted;
}
export function parseXeroEvidenceInput(
  value: unknown,
  onInvalid?: () => void
): XeroEvidenceInput {
  const input = inputSchema.parse(value);
  const results: XeroEvidenceInput["results"] = {};
  for (const definition of XERO_EVIDENCE_CASES) {
    const raw = input.results[definition.caseId];
    if (raw !== undefined) {
      results[definition.caseId] = parseEvidenceCaseObservations(
        raw,
        onInvalid
      );
    }
  }
  if (
    Object.keys(input.results).some(
      (id) => !XERO_EVIDENCE_CASES.some((entry) => entry.caseId === id)
    )
  ) {
    if (!onInvalid) {
      throw new Error("Unrecognised lifecycle case");
    }
    onInvalid();
  }
  return { ...input, results };
}
type ParsedInput = z.infer<typeof inputSchema>;
const prerequisiteByLevel: Record<
  XeroEvidenceLevel,
  (typeof prerequisiteCodes)[number]
> = {
  browser: "browser",
  controlled_integration: "controlled_integration",
  database: "configured_database",
  distributed_store: "distributed_store",
  live_provider: "live_provider",
  mock: "source_checks",
  source_audit: "source_checks",
  unit: "source_checks",
};
export interface XeroEvidenceLevelReport {
  evidenceLevel: XeroEvidenceLevel;
  observation: XeroEvidenceObservation | null;
  remainingAction: string | null;
  status: XeroEvidenceStatus;
}
export interface XeroEvidenceCaseReport extends XeroEvidenceCase {
  candidateSha: string | null;
  cleanupStatus: XeroEvidenceObservation["cleanupStatus"];
  commandOrRunnerScenario: string | null;
  evidence: XeroEvidenceLevelReport[];
  executedAt: string | null;
  exitCodeOrObservedResult: number | string | null;
  expectedAssertion: string;
  fixtureOwnershipReference: string | null;
  nonSecretTargetFingerprint: string | null;
  observedAssertion: string | null;
  remainingAction: string | null;
  restrictedEvidenceLocations: string[];
  status: XeroEvidenceStatus;
}
export interface XeroEvidenceReport {
  assessedAt: string | null;
  candidateSha: string | null;
  cases: XeroEvidenceCaseReport[];
  deployedSha: string | null;
  missingPrerequisites: string[];
  runner: XeroEvidenceRunnerMetadata | null;
  status: XeroEvidenceStatus;
  statuses: {
    sourceChecks: XeroEvidenceStatus;
    configuredDatabase: XeroEvidenceStatus;
    distributedStore: XeroEvidenceStatus;
    browser: XeroEvidenceStatus;
    liveProvider: XeroEvidenceStatus;
  };
  validationErrors: string[];
  version: 1;
}

function aggregate(
  statuses: readonly XeroEvidenceStatus[]
): XeroEvidenceStatus {
  if (statuses.includes("FAIL")) {
    return "FAIL";
  }
  return statuses.length > 0 && statuses.every((status) => status === "PASS")
    ? "PASS"
    : "NOT_VERIFIED";
}
function needsOwnership(level: XeroEvidenceLevel): boolean {
  return level !== "unit" && level !== "source_audit" && level !== "mock";
}
export function assessXeroEvidenceAssertion(
  observation: XeroEvidenceObservation,
  scenario: XeroEvidenceCase,
  input: Pick<
    XeroEvidenceInput,
    "candidateSha" | "assessedAt" | "expectedTargetFingerprints"
  >
): string | null {
  if (observation.candidateSha !== input.candidateSha) {
    return "Execute the assertion on this candidate; cross-candidate evidence rejected";
  }
  const age = Date.parse(input.assessedAt) - Date.parse(observation.executedAt);
  if (age < 0 || age > XERO_EVIDENCE_MAX_AGE_MS) {
    return "Execute a fresh assertion; stale or future-dated evidence rejected";
  }
  if (
    !observation.executed ||
    observation.status === "SKIPPED" ||
    observation.status === "NOT_VERIFIED" ||
    observation.exitCodeOrObservedResult === "skipped" ||
    observation.exitCodeOrObservedResult === "not_verified" ||
    observation.observedAssertion === "assertion_not_executed"
  ) {
    return "Execute the required assertion; skipped or unexecuted evidence rejected";
  }
  if (
    observation.expectedAssertion !== scenario.requirement ||
    observation.commandOrRunnerScenario !==
      `${scenario.caseId}:${observation.evidenceLevel}`
  ) {
    return "Record an executed assertion for the exact charter requirement";
  }
  if (
    observation.nonSecretTargetFingerprint !==
    input.expectedTargetFingerprints[observation.evidenceLevel]
  ) {
    return "Establish the expected target fingerprint and execute against that target";
  }
  if (
    needsOwnership(observation.evidenceLevel) &&
    !(
      observation.fixtureOwnershipReference &&
      observation.restrictedEvidenceLocations.length
    )
  ) {
    return "Record protected fixture ownership and restricted assertion evidence";
  }
  return null;
}
function assessObservation(
  observation: XeroEvidenceObservation,
  scenario: XeroEvidenceCase,
  input: ParsedInput
): string | null {
  const issue = assessXeroEvidenceAssertion(observation, scenario, input);
  if (issue) {
    return issue;
  }
  if (
    needsOwnership(observation.evidenceLevel) &&
    observation.status !== "FAIL" &&
    observation.assertionPassed &&
    observation.observedAssertion === "assertion_passed" &&
    ((observation.cleanupStatus !== "FAIL" &&
      observation.cleanupStatus !== "PASS") ||
      !observation.cleanupEvidenceReference)
  ) {
    return "Verify owned fixture cleanup and record its restricted evidence reference";
  }
  return null;
}
function levelReport(
  level: XeroEvidenceLevel,
  scenario: XeroEvidenceCase,
  input: ParsedInput | null,
  invalid: boolean,
  observations: XeroEvidenceObservation[],
  absentInput: boolean
): XeroEvidenceLevelReport {
  const pending = (
    remainingAction: string,
    pendingObservation: XeroEvidenceObservation | null = null
  ): XeroEvidenceLevelReport => ({
    evidenceLevel: level,
    observation: pendingObservation,
    remainingAction,
    status: "NOT_VERIFIED",
  });
  if (!input) {
    return pending(
      absentInput
        ? "Provide and execute the required evidence input"
        : "Correct malformed evidence input before verification"
    );
  }
  const prerequisite = prerequisiteByLevel[level];
  if (input.prerequisites[prerequisite] !== true) {
    return pending(`Establish mandatory prerequisite: ${prerequisite}`);
  }
  if (invalid) {
    return pending(
      "Correct malformed observations; no observations for this case can establish PASS"
    );
  }
  const matches = observations.filter((entry) => entry.evidenceLevel === level);
  if (matches.length !== 1) {
    return pending(
      matches.length
        ? "Resolve conflicting or duplicate observations at this evidence level"
        : `Execute and record ${level} evidence; another evidence level cannot substitute`
    );
  }
  const [observation] = matches;
  const issue = assessObservation(observation, scenario, input);
  if (issue) {
    return pending(issue, observation);
  }
  if (
    observation.status === "FAIL" ||
    observation.observedAssertion !== "assertion_passed" ||
    observation.exitCodeOrObservedResult === "assertion_failed" ||
    !observation.assertionPassed ||
    (typeof observation.exitCodeOrObservedResult === "number" &&
      observation.exitCodeOrObservedResult !== 0) ||
    observation.cleanupStatus === "FAIL"
  ) {
    return {
      evidenceLevel: level,
      observation,
      remainingAction:
        "Resolve the failed assertion or cleanup and execute it again",
      status: "FAIL",
    };
  }
  return {
    evidenceLevel: level,
    observation,
    remainingAction: null,
    status: "PASS",
  };
}
function caseReport(
  scenario: XeroEvidenceCase,
  input: ParsedInput | null,
  absentInput: boolean
): XeroEvidenceCaseReport {
  const raw = input?.results[scenario.caseId];
  const entries = Array.isArray(raw) ? raw : [raw];
  if (raw === undefined) {
    entries.length = 0;
  }
  const parsed = entries.map((entry) => observationSchema.safeParse(entry));
  const invalid = parsed.some((entry) => !entry.success);
  const observations = parsed.flatMap((entry) =>
    entry.success ? [entry.data] : []
  );
  const evidence = scenario.requiredEvidenceLevels.map((level) =>
    levelReport(level, scenario, input, invalid, observations, absentInput)
  );
  const observation = evidence.find((entry) => entry.observation)?.observation;
  return {
    ...scenario,
    candidateSha: input?.candidateSha ?? null,
    cleanupStatus: observation?.cleanupStatus ?? "NOT_VERIFIED",
    commandOrRunnerScenario: observation?.commandOrRunnerScenario ?? null,
    evidence,
    executedAt: observation?.executedAt ?? null,
    exitCodeOrObservedResult: observation?.exitCodeOrObservedResult ?? null,
    expectedAssertion: scenario.requirement,
    fixtureOwnershipReference: observation?.fixtureOwnershipReference ?? null,
    nonSecretTargetFingerprint: observation?.nonSecretTargetFingerprint ?? null,
    observedAssertion: observation?.observedAssertion ?? null,
    remainingAction:
      evidence
        .filter((entry) => entry.remainingAction)
        .map((entry) => `${entry.evidenceLevel}: ${entry.remainingAction}`)
        .join("; ") || null,
    restrictedEvidenceLocations: observations.flatMap(
      (entry) => entry.restrictedEvidenceLocations
    ),
    status: aggregate(evidence.map((entry) => entry.status)),
  };
}
function categoryStatus(
  cases: XeroEvidenceCaseReport[],
  levels: readonly XeroEvidenceLevel[]
): XeroEvidenceStatus {
  return aggregate(
    cases.flatMap((entry) =>
      entry.evidence
        .filter((evidence) => levels.includes(evidence.evidenceLevel))
        .map((evidence) => evidence.status)
    )
  );
}
function escapeMarkdown(value: string): string {
  return value
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}
function renderMarkdown(report: XeroEvidenceReport): string {
  const lines = [
    "# Xero lifecycle evidence",
    "",
    `Programme readiness: ${report.status}`,
    `Candidate SHA: ${report.candidateSha ?? "NOT_VERIFIED"}`,
    `Deployed SHA: ${report.deployedSha ?? "NOT_VERIFIED"}`,
    `Assessed at: ${report.assessedAt ?? "NOT_VERIFIED"}`,
    "",
    "| Evidence category | Status |",
    "| --- | --- |",
  ];
  if (report.runner) {
    lines.splice(
      6,
      0,
      ...Object.entries(report.runner).map(
        ([name, value]) => `Runner ${name}: ${value}`
      )
    );
  }
  for (const [category, status] of Object.entries(report.statuses)) {
    lines.push(`| ${category} | ${status} |`);
  }
  lines.push(
    "",
    `Missing prerequisites: ${report.missingPrerequisites.join(", ") || "none"}`,
    `Validation errors: ${report.validationErrors.join(", ") || "none"}`,
    "",
    "| Case | Requirement | Level | Status | Remaining action |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const scenario of report.cases) {
    for (const evidence of scenario.evidence) {
      lines.push(
        `| ${scenario.caseId} | ${escapeMarkdown(scenario.requirement)} | ${evidence.evidenceLevel} | ${evidence.status} | ${escapeMarkdown(evidence.remainingAction ?? "none")} |`
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function programmeStatus(
  assertionStatus: XeroEvidenceStatus,
  command: XeroRunnerEvidence | undefined
): XeroEvidenceStatus {
  if (assertionStatus !== "PASS" || !command) {
    return assertionStatus;
  }
  const commandFailed =
    command.exitCode !== 0 ||
    command.cleanupStatus === "FAIL" ||
    command.inventoryStatus === "FAIL";
  if (command.outcome === "PASS" && commandFailed) {
    return "NOT_VERIFIED";
  }
  if (command.outcome === "FAIL" || commandFailed) {
    return "FAIL";
  }
  if (
    command.outcome !== "PASS" ||
    command.phase !== "complete" ||
    command.inventoryStatus !== "PASS" ||
    command.cleanupStatus !== "PASS" ||
    command.fenceState !== "released" ||
    command.failurePhase !== undefined
  ) {
    return "NOT_VERIFIED";
  }
  return command.outcome;
}

// Unknown is deliberate: the report must fail closed for malformed deserialised evidence too.
export function buildXeroEvidence(value: unknown): {
  json: XeroEvidenceReport;
  markdown: string;
  exitCode: 0 | 1;
} {
  const absentInput = value === null || value === undefined;
  const parsed = inputSchema.safeParse(value);
  const input = parsed.success ? parsed.data : null;
  const knownCases = new Set<string>(
    XERO_EVIDENCE_CASES.map((entry) => entry.caseId)
  );
  const validationErrors: string[] = [];
  if (input) {
    validationErrors.push(
      ...Object.keys(input.results)
        .filter((id) => !knownCases.has(id))
        .map(() => "Unrecognised evidence case")
    );
  } else if (!absentInput) {
    validationErrors.push("Malformed evidence input");
  }
  if (input?.deployedSha === null) {
    validationErrors.push("Deployed candidate evidence is missing");
  } else if (input && input.deployedSha !== input.candidateSha) {
    validationErrors.push("Deployed candidate does not match assessed source");
  }
  const requiredPrerequisites = new Set(
    XERO_EVIDENCE_CASES.flatMap((entry) =>
      entry.requiredEvidenceLevels.map((level) => prerequisiteByLevel[level])
    )
  );
  const missingPrerequisites = [...requiredPrerequisites].filter(
    (name) => input?.prerequisites[name] !== true
  );
  const cases = XERO_EVIDENCE_CASES.map((scenario) =>
    caseReport(scenario, input, absentInput)
  );
  const caseStatus = aggregate(cases.map((entry) => entry.status));
  const assertionStatus: XeroEvidenceStatus =
    caseStatus === "PASS" &&
    (missingPrerequisites.length || validationErrors.length)
      ? "NOT_VERIFIED"
      : caseStatus;
  const status = programmeStatus(assertionStatus, input?.runner);
  const json: XeroEvidenceReport = {
    assessedAt: input?.assessedAt ?? null,
    candidateSha: input?.candidateSha ?? null,
    cases,
    deployedSha: input?.deployedSha ?? null,
    missingPrerequisites,
    runner: input?.runner ?? null,
    status,
    statuses: {
      browser: categoryStatus(cases, ["browser"]),
      configuredDatabase: categoryStatus(cases, ["database"]),
      distributedStore: categoryStatus(cases, ["distributed_store"]),
      liveProvider: categoryStatus(cases, ["live_provider"]),
      sourceChecks: categoryStatus(cases, [
        "source_audit",
        "unit",
        "controlled_integration",
      ]),
    },
    validationErrors,
    version: 1,
  };
  return {
    exitCode: status === "PASS" ? 0 : 1,
    json,
    markdown: renderMarkdown(json),
  };
}

export function writeXeroEvidence(
  dir: string,
  report: ReturnType<typeof buildXeroEvidence>
): void {
  mkdirSync(dir, { mode: 0o700, recursive: true });
  writeFileSync(
    join(dir, "xero-evidence.json"),
    `${JSON.stringify(report.json, null, 2)}\n`,
    { mode: 0o600 }
  );
  writeFileSync(join(dir, "xero-evidence.md"), report.markdown, {
    mode: 0o600,
  });
}

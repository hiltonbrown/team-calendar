import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  buildXeroEvidence,
  parseXeroEvidenceInput,
  parseXeroEvidenceObservation,
  XERO_EVIDENCE_CASES,
  type XeroEvidenceInput,
  type XeroEvidenceObservation,
} from "./xero-evidence.js";
import {
  ingestXeroLayerReceipt,
  privateXeroArtefact,
  validateXeroCollectedObservations,
} from "./xero-observations.js";
import {
  emptyObservation,
  parseXeroObservationShell,
  parseXeroScenarioEvidence,
  type XeroObservation,
  type XeroReason,
  type XeroReportInput,
  type XeroScenarioEvidence,
} from "./xero-report.js";
import { XERO_SUBCASE_IDS } from "./xero-scenarios.js";

export interface XeroCampaignCollection {
  actionCollectedAt: string;
  candidateSha: string;
  defects: XeroReportInput["defects"];
  lifecycleInput: XeroEvidenceInput | null;
  lifecycleRunId: string | null;
  limitations: XeroReason[];
  runId: string;
  scenarios: XeroReportInput["scenarios"];
}
interface CollectionInput {
  candidateSha: string;
  endedAt: string;
  expectedTargetFingerprints: XeroEvidenceInput["expectedTargetFingerprints"];
  fixtureAliases: readonly string[];
  output: string;
  owned: readonly {
    alias: string;
    clerkOrgId: string;
    organisationId: string;
    bindingGeneration: number;
  }[];
  phase: "actions" | "terminal";
  previous: XeroCampaignCollection | null;
  runId: string;
  startedAt: string;
  terminalStartedAt?: string;
}
const lifecycleEnvelope = z.strictObject({
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  input: z.unknown(),
  runId: z.uuid(),
  schemaVersion: z.literal(1),
});
const cleanupReceiptSchema = z.strictObject({
  caseId: z.string(),
  cleanupEvidenceReference: z
    .string()
    .regex(/^restricted:sha256:[a-f0-9]{64}$/),
  cleanupStatus: z.enum(["PASS", "FAIL"]),
  evidenceLevel: z.string(),
  observedAt: z.iso.datetime(),
});
const cleanupEnvelope = lifecycleEnvelope
  .omit({ input: true })
  .extend({
    observedAt: z.iso.datetime(),
    phase: z.literal("terminal"),
    receipts: z.array(z.unknown()).max(93),
  })
  .strict();
function assertEnvelope(
  value: { candidateSha: string; runId: string },
  input: CollectionInput
) {
  if (
    value.candidateSha !== input.candidateSha ||
    value.runId !== input.runId
  ) {
    throw new Error("Campaign receipt identity disagrees");
  }
}
const restrictedReferenceSchema = z
  .string()
  .regex(/^restricted:sha256:[a-f0-9]{64}$/);
function readRestrictedReference(
  reference: string,
  input: CollectionInput
): unknown {
  const hash = restrictedReferenceSchema
    .parse(reference)
    .slice("restricted:sha256:".length);
  const bytes = readFileSync(
    privateXeroArtefact(
      resolve(input.output, "sanitised", `${hash}.json`),
      input.output
    )
  );
  if (createHash("sha256").update(bytes).digest("hex") !== hash) {
    throw new Error("Lifecycle artefact hash disagrees");
  }
  return JSON.parse(bytes.toString("utf8"));
}
const lifecycleArtefactSchema = z.strictObject({
  bindingGeneration: z.number().int().nonnegative().nullable(),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  caseId: z.string(),
  cleanupStatus: z.enum(["PASS", "FAIL"]).nullable(),
  clerkOrgId: z.string().nullable(),
  evidenceLevel: z.string(),
  fixtureAlias: z.string().nullable(),
  kind: z.enum(["assertion", "ownership", "cleanup"]),
  nonSecretTargetFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  observation: z.unknown().nullable(),
  observedAt: z.iso.datetime(),
  organisationId: z.uuid().nullable(),
  phase: z.enum(["actions", "terminal"]),
  runId: z.uuid(),
  schemaVersion: z.literal(1),
});
function lifecycleArtefact(
  reference: string,
  input: CollectionInput,
  caseId: string,
  evidenceLevel: string,
  kind: "assertion" | "ownership" | "cleanup"
) {
  const receipt = lifecycleArtefactSchema.parse(
    readRestrictedReference(reference, input)
  );
  assertEnvelope(receipt, input);
  const expectedTarget = Object.entries(input.expectedTargetFingerprints).find(
    ([level]) => level === evidenceLevel
  )?.[1];
  if (
    receipt.caseId !== caseId ||
    receipt.evidenceLevel !== evidenceLevel ||
    receipt.kind !== kind ||
    receipt.nonSecretTargetFingerprint !== expectedTarget ||
    Date.parse(receipt.observedAt) < Date.parse(input.startedAt) ||
    Date.parse(receipt.observedAt) > Date.parse(input.endedAt)
  ) {
    throw new Error("Lifecycle artefact assertion identity disagrees");
  }
  if (
    kind !== "assertion" ||
    !["unit", "source_audit", "mock"].includes(evidenceLevel)
  ) {
    const owned = input.owned.find(
      (entry) => entry.alias === receipt.fixtureAlias
    );
    if (
      !owned ||
      receipt.clerkOrgId !== owned.clerkOrgId ||
      receipt.organisationId !== owned.organisationId ||
      receipt.bindingGeneration !== owned.bindingGeneration
    ) {
      throw new Error("Lifecycle artefact ownership disagrees");
    }
  }
  if (
    kind === "cleanup" &&
    (receipt.phase !== "terminal" ||
      !input.terminalStartedAt ||
      Date.parse(receipt.observedAt) < Date.parse(input.terminalStartedAt))
  ) {
    throw new Error("Lifecycle cleanup predates terminal teardown");
  }
  return receipt;
}
function assertionFields(
  value: ReturnType<typeof parseXeroEvidenceObservation>
) {
  const {
    cleanupStatus,
    cleanupEvidenceReference,
    fixtureOwnershipReference,
    restrictedEvidenceLocations,
    ...assertion
  } = value;
  return assertion;
}
function collectObservation(
  path: string,
  input: CollectionInput,
  onInvalid: () => void
): XeroObservation {
  const entry = parseXeroObservationShell(
    JSON.parse(readFileSync(privateXeroArtefact(path, input.output), "utf8"))
  );
  if (
    !(
      XERO_SUBCASE_IDS.includes(entry.id) &&
      input.fixtureAliases.includes(entry.correlation.fixtureAlias ?? "")
    ) ||
    entry.correlation.runId !== input.runId ||
    !entry.startedAt ||
    !entry.endedAt ||
    Date.parse(entry.startedAt) < Date.parse(input.startedAt) ||
    Date.parse(entry.endedAt) > Date.parse(input.endedAt)
  ) {
    throw new Error("Campaign observation scope or freshness disagrees");
  }
  const layers = new Set<string>();
  const evidence: XeroScenarioEvidence[] = [];
  for (const value of entry.evidence) {
    try {
      const link = parseXeroScenarioEvidence(value);
      if (layers.has(link.layer)) {
        throw new Error("Duplicate independent layer");
      }
      layers.add(link.layer);
      const receipt = ingestXeroLayerReceipt(resolve(input.output, link.path), {
        candidateSha: input.candidateSha,
        endedAt: entry.endedAt ?? "",
        fixtureAlias: entry.correlation.fixtureAlias ?? "",
        layer: link.layer,
        observationId: entry.id,
        output: input.output,
        runId: input.runId,
        startedAt: entry.startedAt ?? "",
      });
      if (
        ["queued", "unknown"].includes(receipt.terminal) &&
        receipt.assertion !== "failed"
      ) {
        throw new Error(
          "Queued-only or unknown receipt cannot prove an assertion"
        );
      }
      if (
        receipt.sha256 !== link.sha256 ||
        JSON.stringify(receipt) !== JSON.stringify(link)
      ) {
        throw new Error(
          "Observation reference disagrees with actual receipt bytes"
        );
      }
      evidence.push(receipt);
    } catch {
      onInvalid();
    }
  }
  return { ...entry, evidence };
}
function sameLifecycleScope(
  left: ReturnType<typeof lifecycleArtefact>,
  right: ReturnType<typeof lifecycleArtefact>
) {
  return (
    left.fixtureAlias === right.fixtureAlias &&
    left.clerkOrgId === right.clerkOrgId &&
    left.organisationId === right.organisationId &&
    left.bindingGeneration === right.bindingGeneration
  );
}
function verifyLifecycleAssertion(
  observation: XeroEvidenceObservation,
  caseId: string,
  input: CollectionInput
) {
  if (observation.restrictedEvidenceLocations.length !== 1) {
    throw new Error("Exact lifecycle assertion artefact is required");
  }
  const [reference] = observation.restrictedEvidenceLocations;
  const proof = lifecycleArtefact(
    reference,
    input,
    caseId,
    observation.evidenceLevel,
    "assertion"
  );
  const recorded = parseXeroEvidenceObservation(proof.observation);
  if (
    JSON.stringify(assertionFields(recorded)) !==
      JSON.stringify(assertionFields(observation)) ||
    proof.observedAt !== observation.executedAt
  ) {
    throw new Error("Lifecycle assertion disagrees with observed bytes");
  }
  if (!["unit", "source_audit", "mock"].includes(observation.evidenceLevel)) {
    if (!observation.fixtureOwnershipReference) {
      throw new Error("Lifecycle ownership is missing");
    }
    const ownership = lifecycleArtefact(
      observation.fixtureOwnershipReference,
      input,
      caseId,
      observation.evidenceLevel,
      "ownership"
    );
    if (!sameLifecycleScope(proof, ownership)) {
      throw new Error("Lifecycle assertion and ownership scopes disagree");
    }
    observation.cleanupStatus = "NOT_VERIFIED";
    observation.cleanupEvidenceReference = null;
  }
}
function evidenceObservations(
  raw: XeroEvidenceInput["results"][keyof XeroEvidenceInput["results"]]
): readonly XeroEvidenceObservation[] {
  if (!raw) {
    return [];
  }
  if ("evidenceLevel" in raw) {
    return [raw];
  }
  return raw;
}
function verifyLifecycleObservations(
  lifecycle: XeroEvidenceInput,
  input: CollectionInput,
  onInvalid: () => void
) {
  for (const definition of XERO_EVIDENCE_CASES) {
    const raw = lifecycle.results[definition.caseId];
    const observations = evidenceObservations(raw);
    const levels = new Set<string>();
    const accepted: XeroEvidenceObservation[] = [];
    for (const observation of observations) {
      try {
        if (levels.has(observation.evidenceLevel)) {
          throw new Error("Duplicate lifecycle assertion level");
        }
        levels.add(observation.evidenceLevel);
        verifyLifecycleAssertion(observation, definition.caseId, input);
        accepted.push(observation);
      } catch {
        onInvalid();
      }
    }
    lifecycle.results[definition.caseId] = accepted;
  }
}
function applyLifecycleCleanupReceipt(
  lifecycle: XeroEvidenceInput | null,
  receipt: z.infer<typeof cleanupReceiptSchema>,
  input: CollectionInput,
  onCleanupFailure: (caseId: string, level: string) => void
) {
  const definition = XERO_EVIDENCE_CASES.find(
    (entry) => entry.caseId === receipt.caseId
  );
  if (
    !definition?.requiredEvidenceLevels.some(
      (level) => level === receipt.evidenceLevel
    )
  ) {
    throw new Error("Unknown cleanup assertion pair");
  }
  const proof = lifecycleArtefact(
    receipt.cleanupEvidenceReference,
    input,
    receipt.caseId,
    receipt.evidenceLevel,
    "cleanup"
  );
  if (
    proof.cleanupStatus !== receipt.cleanupStatus ||
    proof.observedAt !== receipt.observedAt
  ) {
    throw new Error("Lifecycle cleanup index disagrees with actual receipt");
  }
  if (proof.cleanupStatus === "FAIL") {
    onCleanupFailure(receipt.caseId, receipt.evidenceLevel);
  }
  if (!lifecycle) {
    throw new Error("Cleanup receipt has no action catalogue");
  }
  const raw = lifecycle.results[definition.caseId];
  const matches = evidenceObservations(raw).filter(
    (entry) => entry.evidenceLevel === receipt.evidenceLevel
  );
  const [observation] = matches;
  if (matches.length !== 1 || !observation) {
    throw new Error("Cleanup receipt has no matching action observation");
  }
  const assertion = lifecycleArtefact(
    observation.restrictedEvidenceLocations[0],
    input,
    receipt.caseId,
    receipt.evidenceLevel,
    "assertion"
  );
  if (!sameLifecycleScope(proof, assertion)) {
    throw new Error("Lifecycle cleanup belongs to another owned fixture");
  }
  observation.cleanupStatus = receipt.cleanupStatus;
  observation.cleanupEvidenceReference = receipt.cleanupEvidenceReference;
}
function collectLifecycleCleanup(
  lifecycle: XeroEvidenceInput | null,
  input: CollectionInput,
  onInvalid: () => void,
  onCleanupFailure: (caseId: string, level: string) => void
) {
  const path = resolve(input.output, "lifecycle-cleanup.json");
  if (input.phase !== "terminal" || !existsSync(path)) {
    return;
  }
  try {
    const envelope = cleanupEnvelope.parse(
      JSON.parse(readFileSync(privateXeroArtefact(path, input.output), "utf8"))
    );
    assertEnvelope(envelope, input);
    if (
      !input.terminalStartedAt ||
      Date.parse(envelope.observedAt) < Date.parse(input.terminalStartedAt) ||
      Date.parse(envelope.observedAt) > Date.parse(input.endedAt)
    ) {
      throw new Error("Lifecycle terminal envelope is stale");
    }
    const seen = new Set<string>();
    for (const value of envelope.receipts) {
      try {
        const receipt = cleanupReceiptSchema.parse(value);
        const key = `${receipt.caseId}:${receipt.evidenceLevel}`;
        if (seen.has(key)) {
          throw new Error("Duplicate lifecycle cleanup receipt");
        }
        seen.add(key);
        applyLifecycleCleanupReceipt(
          lifecycle,
          receipt,
          input,
          onCleanupFailure
        );
      } catch {
        onInvalid();
      }
    }
  } catch {
    onInvalid();
  }
}
function collectLifecycle(
  input: CollectionInput,
  onInvalid: () => void
): XeroEvidenceInput | null {
  let lifecycle = input.previous?.lifecycleInput ?? null;
  const path = resolve(input.output, "lifecycle-observations.json");
  if (!lifecycle && existsSync(path)) {
    const envelope = lifecycleEnvelope.parse(
      JSON.parse(readFileSync(privateXeroArtefact(path, input.output), "utf8"))
    );
    assertEnvelope(envelope, input);
    lifecycle = parseXeroEvidenceInput(envelope.input, onInvalid);
  }
  if (!lifecycle) {
    return null;
  }
  lifecycle = structuredClone(lifecycle);
  if (
    lifecycle.candidateSha !== input.candidateSha ||
    Date.parse(lifecycle.assessedAt) < Date.parse(input.startedAt) ||
    Date.parse(lifecycle.assessedAt) > Date.parse(input.endedAt) ||
    JSON.stringify(
      Object.entries(lifecycle.expectedTargetFingerprints).sort()
    ) !==
      JSON.stringify(Object.entries(input.expectedTargetFingerprints).sort())
  ) {
    throw new Error("Lifecycle candidate, target or time disagrees");
  }
  verifyLifecycleObservations(lifecycle, input, onInvalid);
  buildXeroEvidence(lifecycle);
  return lifecycle;
}
function collectScenarioObservations(
  input: CollectionInput,
  onInvalid: () => void
) {
  const entries = new Map<string, XeroObservation>(
    input.previous?.scenarios
      .flatMap((entry) => entry.subcases)
      .map((entry) => [entry.id, entry]) ?? []
  );
  const seen = new Set<string>();
  for (const file of readdirSync(input.output).filter((entry) =>
    entry.endsWith("-observation.json")
  )) {
    const id = file.slice(0, -"-observation.json".length);
    if (!XERO_SUBCASE_IDS.includes(id)) {
      onInvalid();
      continue;
    }
    if (id.startsWith("X26.") !== (input.phase === "terminal")) {
      continue;
    }
    try {
      const entry = collectObservation(
        resolve(input.output, file),
        input,
        onInvalid
      );
      if (
        entry.id.startsWith("X26.") &&
        (!input.terminalStartedAt ||
          Date.parse(entry.startedAt ?? "") <
            Date.parse(input.terminalStartedAt))
      ) {
        throw new Error("Cleanup observation predates terminal teardown");
      }
      if (entry.id !== id || seen.has(entry.id)) {
        throw new Error("Duplicated or misnamed campaign observation");
      }
      seen.add(entry.id);
      entries.set(entry.id, entry);
    } catch {
      onInvalid();
      if (entries.get(id)?.status !== "FAIL") {
        entries.set(id, emptyObservation(id, "invalid-evidence"));
      }
    }
  }
  return [...entries.values()];
}
function validPreviousCollection(input: CollectionInput) {
  const prior = input.previous;
  return (
    !prior ||
    (prior.runId === input.runId &&
      prior.candidateSha === input.candidateSha &&
      (prior.lifecycleRunId === null || prior.lifecycleRunId === input.runId))
  );
}
function validateCollectionWindow(input: CollectionInput) {
  const start = Date.parse(z.iso.datetime().parse(input.startedAt));
  const end = Date.parse(z.iso.datetime().parse(input.endedAt));
  if (end < start) {
    throw new Error("Campaign collection window is reversed");
  }
  if (input.phase === "terminal") {
    const terminal = Date.parse(
      z.iso.datetime().parse(input.terminalStartedAt)
    );
    if (
      terminal < start ||
      terminal > end ||
      (input.previous &&
        terminal <
          Date.parse(z.iso.datetime().parse(input.previous.actionCollectedAt)))
    ) {
      throw new Error("Terminal collection predates action collection");
    }
  }
}
// Collection reads persisted proof only. It never replays a scenario or queries a deleted fixture.
export function collectXeroCampaign(
  value: CollectionInput
): XeroCampaignCollection {
  const limitations: XeroReason[] = [];
  const defects: XeroReportInput["defects"] = [];
  const onCleanupFailure = (caseId: string, level: string) => {
    const id = `lifecycle-cleanup-${caseId}-${level.replaceAll("_", "-")}`;
    if (!defects.some((entry) => entry.id === id)) {
      defects.push({
        id,
        owner: "160",
        reason: "cleanup-incomplete",
        severity: "high",
        status: "open",
      });
    }
  };
  const invalid = () => limitations.push("invalid-evidence");
  const input = validPreviousCollection(value)
    ? value
    : { ...value, previous: null };
  if (input !== value) {
    invalid();
  }
  defects.push(...(input.previous?.defects ?? []));
  validateCollectionWindow(input);
  const entries = collectScenarioObservations(input, invalid);
  let lifecycleInput: XeroEvidenceInput | null = null;
  try {
    lifecycleInput = collectLifecycle(input, invalid);
  } catch {
    invalid();
  }
  collectLifecycleCleanup(lifecycleInput, input, invalid, onCleanupFailure);
  return {
    actionCollectedAt: input.previous?.actionCollectedAt ?? input.endedAt,
    candidateSha: input.candidateSha,
    defects,
    lifecycleInput,
    lifecycleRunId: lifecycleInput ? input.runId : null,
    limitations: [...new Set(limitations)],
    runId: input.runId,
    scenarios: validateXeroCollectedObservations(
      entries,
      input.runId,
      input.candidateSha,
      input.startedAt,
      input.endedAt
    ),
  };
}

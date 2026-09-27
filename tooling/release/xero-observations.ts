import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  bootstrapXeroReport,
  buildXeroReport,
  type XeroObservation,
  type XeroScenarioEvidence,
} from "./xero-report.js";
import {
  scenarioDefinition,
  XERO_SUBCASE_IDS,
  type XeroLayer,
} from "./xero-scenarios.js";

const receiptSchema = z.strictObject({
  actualFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  assertionPassed: z.boolean(),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  eventAlias: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .nullable(),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  fixtureAlias: z.string().regex(/^fixture-[a-z0-9-]+$/),
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
  logicalRunAlias: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .nullable(),
  mode: z.enum(["LIVE", "CONTROLLED"]),
  observationId: z.string().refine((id) => XERO_SUBCASE_IDS.includes(id)),
  observedAt: z.iso.datetime(),
  operationAlias: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .nullable(),
  origin: z.literal("https://api.xero.com").nullable(),
  runId: z.uuid(),
  schemaVersion: z.literal(1),
  terminal: z.enum([
    "succeeded",
    "failed",
    "not-required",
    "queued",
    "unknown",
  ]),
});
export type XeroLayerReceipt = z.infer<typeof receiptSchema>;
export function privateXeroArtefact(path: string, output: string) {
  const root = realpathSync(output);
  const file = resolve(path);
  if (
    !(
      root.startsWith(`${realpathSync("tooling/release/test-results")}/`) &&
      file.startsWith(`${root}/`)
    ) ||
    lstatSync(file).isSymbolicLink() ||
    statSync(file).mode % 0o100 !== 0 ||
    !realpathSync(file).startsWith(`${root}/`)
  ) {
    throw new Error("Observation artefact is outside private storage");
  }
  return file;
}
export function ingestXeroLayerReceipt(
  path: string,
  input: {
    output: string;
    observationId: string;
    layer: XeroLayer;
    runId: string;
    candidateSha: string;
    fixtureAlias: string;
    startedAt: string;
    endedAt: string;
  }
): XeroScenarioEvidence {
  const bytes = readFileSync(privateXeroArtefact(path, input.output));
  const receipt = receiptSchema.parse(JSON.parse(bytes.toString("utf8")));
  const definition = scenarioDefinition(
    input.observationId.split(".")[0] ?? ""
  );
  if (
    receipt.observationId !== input.observationId ||
    receipt.layer !== input.layer ||
    receipt.runId !== input.runId ||
    receipt.candidateSha !== input.candidateSha ||
    receipt.fixtureAlias !== input.fixtureAlias ||
    receipt.mode !== definition.requiredMode ||
    Date.parse(receipt.observedAt) < Date.parse(input.startedAt) ||
    Date.parse(receipt.observedAt) > Date.parse(input.endedAt)
  ) {
    throw new Error("Observation receipt identity or freshness mismatch");
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const directory = resolve(input.output, "sanitised");
  if (!existsSync(directory)) {
    mkdirSync(directory, { mode: 0o700 });
  }
  if (
    lstatSync(directory).isSymbolicLink() ||
    statSync(directory).mode % 0o100 !== 0 ||
    !realpathSync(directory).startsWith(`${realpathSync(input.output)}/`)
  ) {
    throw new Error("Sanitised receipt index is unsafe");
  }
  const indexedPath = resolve(directory, `${hash}.json`);
  if (!existsSync(indexedPath)) {
    writeFileSync(indexedPath, bytes, { flag: "wx", mode: 0o600 });
  }
  const indexedBytes = readFileSync(
    privateXeroArtefact(indexedPath, input.output)
  );
  if (createHash("sha256").update(indexedBytes).digest("hex") !== hash) {
    throw new Error("Sanitised receipt index disagrees");
  }
  return {
    assertion:
      receipt.assertionPassed &&
      receipt.actualFingerprint === receipt.expectedFingerprint
        ? "passed"
        : "failed",
    candidateSha: receipt.candidateSha,
    eventAlias: receipt.eventAlias,
    fixtureAlias: receipt.fixtureAlias,
    intercepted: receipt.intercepted,
    layer: receipt.layer,
    logicalRunAlias: receipt.logicalRunAlias,
    mode: receipt.mode,
    observationId: receipt.observationId,
    observedAt: receipt.observedAt,
    operationAlias: receipt.operationAlias,
    origin: receipt.origin,
    path: `sanitised/${hash}.json`,
    runId: receipt.runId,
    sha256: hash,
    terminal: receipt.terminal,
  };
}
export function persistXeroLayerReceipt(
  path: string,
  value: XeroLayerReceipt,
  output: string
) {
  const root = resolve(output);
  const ignored = resolve("tooling/release/test-results");
  if (
    !root.startsWith(`${ignored}/`) ||
    lstatSync(root).isSymbolicLink() ||
    statSync(root).mode % 0o100 !== 0 ||
    !realpathSync(root).startsWith(`${realpathSync(ignored)}/`)
  ) {
    throw new Error("Receipt destination is not private storage");
  }
  const file = resolve(path);
  if (!file.startsWith(`${root}/`) || resolve(file, "..") !== root) {
    throw new Error("Receipt destination is invalid");
  }
  writeFileSync(file, `${JSON.stringify(receiptSchema.parse(value))}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}
export function ingestXeroSubcase(input: {
  observation: XeroObservation;
  receipts: readonly { path: string; layer: XeroLayer }[];
  output: string;
  runId: string;
  candidateSha: string;
}) {
  const entry = input.observation;
  if (
    !(
      entry.correlation.fixtureAlias &&
      entry.startedAt &&
      entry.endedAt &&
      XERO_SUBCASE_IDS.includes(entry.id)
    )
  ) {
    throw new Error("Subcase observation is unexecuted or unregistered");
  }
  const evidence = input.receipts.map((receipt) =>
    ingestXeroLayerReceipt(receipt.path, {
      ...input,
      endedAt: entry.endedAt ?? "",
      fixtureAlias: entry.correlation.fixtureAlias ?? "",
      layer: receipt.layer,
      observationId: entry.id,
      startedAt: entry.startedAt ?? "",
    })
  );
  const definition = scenarioDefinition(entry.id.split(".")[0] ?? "");
  if (
    evidence.some(
      (link) => link.operationAlias !== entry.correlation.operationAlias
    )
  ) {
    throw new Error("Subcase operation correlation disagrees");
  }
  if (
    !definition.requiredLayers.every(
      (layer) => evidence.filter((link) => link.layer === layer).length === 1
    )
  ) {
    throw new Error("Subcase is missing independent layer proof");
  }
  return { ...entry, evidence };
}
// Discovery and aggregate process results are never observations. This helper
// accepts only independently ingested per-case receipts and uses the same strict
// renderer validation as the final report.
export function validateXeroCollectedObservations(
  entries: XeroObservation[],
  runId: string,
  candidateSha: string,
  startedAt: string,
  endedAt: string
) {
  if (
    entries.some((entry) => !XERO_SUBCASE_IDS.includes(entry.id)) ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  ) {
    throw new Error("Unknown or duplicate collected subcase");
  }
  const input = bootstrapXeroReport(startedAt, runId);
  input.candidateSha = candidateSha;
  input.endedAt = endedAt;
  input.scenarios = input.scenarios.map((scenario) => ({
    ...scenario,
    subcases: scenario.subcases.map(
      (subcase) => entries.find((entry) => entry.id === subcase.id) ?? subcase
    ),
  }));
  return buildXeroReport(input).json.scenarios.map(
    ({ name, expected, requiredMode, ...observation }) => observation
  );
}

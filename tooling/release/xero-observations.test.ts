import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  ingestXeroLayerReceipt,
  persistXeroLayerReceipt,
  type XeroLayerReceipt,
} from "./xero-observations.js";

const directories: string[] = [];
function fixture() {
  const root = resolve("tooling/release/test-results");
  mkdirSync(root, { mode: 0o700, recursive: true });
  chmodSync(root, 0o700);
  const output = mkdtempSync(`${root}/receipt-`);
  directories.push(output);
  const observedAt = new Date().toISOString();
  const runId = randomUUID();
  const candidateSha = "a".repeat(40);
  const receipt: XeroLayerReceipt = {
    actualFingerprint: "b".repeat(64),
    assertionPassed: true,
    candidateSha,
    eventAlias: null,
    expectedFingerprint: "b".repeat(64),
    fixtureAlias: "fixture-owned",
    intercepted: false,
    layer: "provider",
    logicalRunAlias: null,
    mode: "LIVE",
    observationId: "X01.primary",
    observedAt,
    operationAlias: "operation-owned",
    origin: "https://api.xero.com",
    runId,
    schemaVersion: 1,
    terminal: "succeeded",
  };
  const input = {
    candidateSha,
    endedAt: observedAt,
    fixtureAlias: receipt.fixtureAlias,
    layer: receipt.layer,
    observationId: receipt.observationId,
    output,
    runId,
    startedAt: observedAt,
  };
  const path = resolve(output, "source.json");
  return { input, output, path, receipt };
}
afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});
it("indexes the actual strict safe receipt bytes and its verified hash", () => {
  const { path, receipt, input, output } = fixture();
  persistXeroLayerReceipt(path, receipt, output);
  const evidence = ingestXeroLayerReceipt(path, input);
  const indexed = resolve(output, evidence.path);
  expect(existsSync(indexed)).toBe(true);
  expect(createHash("sha256").update(readFileSync(indexed)).digest("hex")).toBe(
    evidence.sha256
  );
  expect(evidence.assertion).toBe("passed");
});
it.each(["case", "run", "candidate", "fixture", "time", "mode"])(
  "rejects mismatched %s proof",
  (fault) => {
    const { path, receipt, input, output } = fixture();
    if (fault === "case") {
      receipt.observationId = "X02.primary";
    }
    if (fault === "run") {
      receipt.runId = randomUUID();
    }
    if (fault === "candidate") {
      receipt.candidateSha = "c".repeat(40);
    }
    if (fault === "fixture") {
      receipt.fixtureAlias = "fixture-foreign";
    }
    if (fault === "time") {
      receipt.observedAt = new Date(
        Date.parse(receipt.observedAt) - 60_000
      ).toISOString();
    }
    if (fault === "mode") {
      receipt.mode = "CONTROLLED";
    }
    persistXeroLayerReceipt(path, receipt, output);
    expect(() => ingestXeroLayerReceipt(path, input)).toThrow();
  }
);
it("rejects a symlink index without writing its target", () => {
  const { path, receipt, input, output } = fixture();
  persistXeroLayerReceipt(path, receipt, output);
  const foreign = mkdtempSync(resolve("/tmp", "receipt-outside-"));
  directories.push(foreign);
  symlinkSync(foreign, resolve(output, "sanitised"));
  expect(() => ingestXeroLayerReceipt(path, input)).toThrow();
  expect(existsSync(resolve(foreign, "source.json"))).toBe(false);
});

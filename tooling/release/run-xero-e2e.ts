import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { z } from "zod";
import {
  currentXeroWorkerCapability,
  readXeroExecutionManifest,
  writeXeroRunnerContext,
  type XeroExecutionManifest,
} from "./xero-execution-guard.js";
import { assertDurableXeroExecutionManifestReadBack } from "./xero-execution-manifest-store.js";
import {
  makeXeroLedger,
  persistXeroLedger,
  readXeroLedger,
  reconcileXeroLedger,
  type XeroCleanupHooks,
  type XeroLedger,
} from "./xero-ledger.js";
import {
  bootstrapXeroReport,
  buildXeroReport,
  emptyObservation,
  parseXeroObservations,
  writeXeroReport,
  type XeroReason,
  type XeroReportInput,
} from "./xero-report.js";
import { assertReviewedXeroSource } from "./xero-source-integrity.js";

interface Options {
  manifest: string;
  output: string | null;
  preflight: boolean;
  recover: boolean;
}
export function parseXeroCli(args: readonly string[]): Options {
  const result: Options = {
    manifest: "",
    output: null,
    preflight: false,
    recover: false,
  };
  const seen = new Set<string>();
  const iterator = args[Symbol.iterator]();
  for (const argument of iterator) {
    if (seen.has(argument)) {
      throw new Error("Invalid CLI");
    }
    seen.add(argument);
    if (argument === "--manifest" || argument === "--output") {
      const { value } = iterator.next();
      if (!value || value.startsWith("--")) {
        throw new Error("Invalid CLI");
      }
      if (argument === "--manifest") {
        result.manifest = value;
      } else {
        result.output = value;
      }
    } else if (argument === "--preflight") {
      result.preflight = true;
    } else if (argument === "--recover") {
      result.recover = true;
    } else {
      throw new Error("Invalid CLI");
    }
  }
  if (!result.manifest || (result.preflight && result.recover)) {
    throw new Error("Invalid CLI");
  }
  return result;
}
export interface XeroExecutionLease {
  cleanup: XeroCleanupHooks;
  // Fresh per-subcase evidence, never an aggregate child exit result.
  collect: () => Promise<XeroReportInput["scenarios"]>;
  context: { appUrl: string; verifiedFenceReference: string };
  deployments: XeroReportInput["deployments"];
  terminalCleanup: () => Promise<XeroReportInput["cleanup"]>;
  verifyFixtures: () => Promise<void>;
}
export interface XeroRunnerDependencies {
  acquire: (manifest: XeroExecutionManifest) => Promise<XeroExecutionLease>;
  assertDurable?: (manifest: XeroExecutionManifest) => Promise<void>;
  assertSource?: (candidateSha: string) => void;
  browser: (
    environment: NodeJS.ProcessEnv,
    signal: AbortSignal
  ) => Promise<number>;
  importConfiguration: () => Promise<unknown>;
  writeReport?: typeof writeXeroReport;
}
const defaultDependencies: XeroRunnerDependencies = {
  acquire: () =>
    Promise.reject(new Error(currentXeroWorkerCapability().reason)),
  browser: (environment, signal) =>
    new Promise((resolveExit, reject) => {
      const child = spawn(
        "bunx",
        [
          "playwright",
          "test",
          "--config",
          "tooling/release/xero-e2e.config.ts",
        ],
        { env: environment, signal, stdio: "ignore" }
      );
      child.once("error", reject);
      child.once("exit", (code) => resolveExit(code ?? 1));
    }),
  importConfiguration: () => import("@playwright/test"),
};
function markUnavailable(input: XeroReportInput, reason: XeroReason) {
  input.limitations = [...new Set([...input.limitations, reason])];
  input.scenarios = input.scenarios.map((entry) => ({
    ...emptyObservation(entry.id, reason),
    subcases: entry.subcases.map((subcase) =>
      emptyObservation(subcase.id, reason)
    ),
  }));
}
function privateOutput(path: string) {
  const output = resolve(path);
  const root = resolve("tooling/release/test-results");
  if (!output.startsWith(`${root}/`)) {
    throw new Error("Invalid output");
  }
  mkdirSync(output, { mode: 0o700, recursive: true });
  if (
    !realpathSync(output).startsWith(`${realpathSync(root)}/`) ||
    statSync(output).mode % 0o100 !== 0
  ) {
    throw new Error("Unsafe output");
  }
  execFileSync("git", ["check-ignore", "-q", output]);
  return output;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep bootstrap, admission and finally cleanup in their audited execution order.
export async function runXeroE2e(
  args: readonly string[],
  dependencies: XeroRunnerDependencies = defaultDependencies
) {
  // No manifest, application environment or config imports occur before bootstrap.
  const input = bootstrapXeroReport();
  const controller = new AbortController();
  let output = resolve(`tooling/release/test-results/${input.diagnosticRunId}`);
  let lease: XeroExecutionLease | null = null;
  let ledger: XeroLedger | null = null;
  let ledgerPath: string | null = null;
  let authority: XeroExecutionManifest | null = null;
  let failureReason: XeroReason = "invalid-cli";
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    output = privateOutput(output);
    const options = parseXeroCli(args);
    failureReason = "manifest-unavailable";
    const raw = readFileSync(resolve(options.manifest), "utf8");
    failureReason = "manifest-invalid";
    const manifest = readXeroExecutionManifest(resolve(options.manifest));
    authority = manifest;
    input.runId = manifest.runId;
    input.verifiedRunId = manifest.runId;
    input.candidateSha = manifest.candidateSha;
    input.environment = manifest.environment;
    input.contractDecision = manifest.contractDecision;
    input.authorisedFixtures = manifest.owned.map(
      ({ alias, cohort, bindingGeneration, maximumMutations }) => ({
        alias,
        bindingGeneration,
        cohort,
        maximumMutations,
      })
    );
    const packageVersion: unknown = createRequire(import.meta.url)(
      "@playwright/test/package.json"
    );
    const { version } = z.object({ version: z.string() }).parse(packageVersion);
    input.toolVersions = {
      bun: execFileSync("bun", ["--version"], { encoding: "utf8" }).trim(),
      playwright: version,
    };
    input.harnessSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (input.harnessSha !== manifest.candidateSha) {
      throw new Error("Candidate mismatch");
    }
    output = privateOutput(
      options.output ?? `tooling/release/test-results/${manifest.runId}`
    );
    ledgerPath = resolve(output, "xero-ledger.json");
    failureReason = "configuration-unavailable";
    await dependencies.importConfiguration();
    if (controller.signal.aborted) {
      throw new Error("Interrupted");
    }
    failureReason = "missing-prerequisite";
    (dependencies.assertSource ?? assertReviewedXeroSource)(
      manifest.candidateSha
    );
    if (options.preflight) {
      markUnavailable(input, "not-executed");
      return finishReport(input, dependencies);
    }
    await (
      dependencies.assertDurable ??
      ((value) =>
        assertDurableXeroExecutionManifestReadBack(value, {
          token: process.env.KV_REST_API_TOKEN ?? "",
          url: process.env.KV_REST_API_URL ?? "",
        }))
    )(manifest);
    failureReason = "recovery-required";
    if (!options.recover && existsSync(ledgerPath)) {
      throw new Error("Existing ledger requires recovery");
    }
    ledger = options.recover
      ? readXeroLedger(ledgerPath, manifest)
      : makeXeroLedger(manifest);
    failureReason = "worker-isolation-unavailable";
    lease = await dependencies.acquire(manifest);
    if (!options.recover) {
      persistXeroLedger(ledgerPath, ledger);
    }
    input.deployments = lease.deployments;
    failureReason = "missing-prerequisite";
    await lease.verifyFixtures();
    if (options.recover) {
      markUnavailable(input, "recovery-required");
    } else {
      const contextPath = resolve(output, "runner-context.json");
      const context = writeXeroRunnerContext(contextPath, {
        appUrl: lease.context.appUrl,
        candidateSha: manifest.candidateSha,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        manifestHash: createHash("sha256").update(raw).digest("hex"),
        output,
        runId: manifest.runId,
        verifiedFenceReference: lease.context.verifiedFenceReference,
      });
      const exit = await dependencies.browser(
        {
          ...process.env,
          TC_XERO_MANIFEST: resolve(options.manifest),
          TC_XERO_RUNNER_CONTEXT: contextPath,
          TC_XERO_RUNNER_NONCE: context.nonce,
        },
        controller.signal
      );
      if (exit !== 0) {
        input.defects.push({
          id: "browser-campaign",
          owner: "160",
          reason: "assertion-failed",
          severity: "high",
          status: "open",
        });
      }
      input.scenarios = parseXeroObservations(await lease.collect());
    }
  } catch {
    markUnavailable(
      input,
      controller.signal.aborted ? "interrupted" : failureReason
    );
  } finally {
    if (lease && ledger && ledgerPath && authority) {
      try {
        const cleanup = await reconcileXeroLedger(
          ledgerPath,
          ledger,
          lease.cleanup,
          authority
        );
        input.cleanup = await lease.terminalCleanup();
        if (cleanup.unresolved || cleanup.failures.length) {
          input.cleanup.local = "NOT VERIFIED";
          input.cleanup.provider = "FAIL";
          input.cleanup.fenceReleased = false;
          input.limitations.push("cleanup-incomplete");
        }
        input.cleanup.fenceReleased =
          input.cleanup.fenceReleased && cleanup.fenceReleased;
      } catch {
        input.cleanup.provider = "FAIL";
        input.cleanup.fenceReleased = false;
        input.limitations.push("cleanup-incomplete");
      }
    }
    input.endedAt = new Date().toISOString();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  return finishReport(input, dependencies);
}
function finishReport(
  input: XeroReportInput,
  dependencies: XeroRunnerDependencies
) {
  input.endedAt = new Date().toISOString();
  const report = buildXeroReport(input);
  try {
    (dependencies.writeReport ?? writeXeroReport)("reports/xero-e2e", report);
  } catch {
    process.stderr.write(`${JSON.stringify(report.json)}\n${report.markdown}`);
    return {
      ...report,
      exitCode: report.exitCode === 1 ? (1 as const) : (2 as const),
    };
  }
  return report;
}
if (import.meta.main) {
  process.exitCode = (await runXeroE2e(process.argv.slice(2))).exitCode;
}

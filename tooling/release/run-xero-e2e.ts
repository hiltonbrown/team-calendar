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
import type { XeroCampaignCollection } from "./xero-campaign-collector.js";
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
  collect: (
    phase: "actions" | "terminal",
    previous: XeroCampaignCollection | null,
    terminalStartedAt?: string
  ) => Promise<XeroCampaignCollection>;
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
  ) => Promise<XeroBrowserResult>;
  importConfiguration: () => Promise<unknown>;
  writeReport?: typeof writeXeroReport;
}
export interface XeroBrowserResult {
  closed: boolean;
  exitCode: number;
}
interface BrowserProcess {
  once: {
    (event: "error", listener: (error: Error) => void): unknown;
    (
      event: "close",
      listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): unknown;
  };
  pid?: number;
}
// close does not prove detached browsers have closed after an error or forced termination.
export function superviseXeroBrowser(
  child: BrowserProcess,
  signal: AbortSignal,
  processControl: {
    exists: () => boolean;
    kill: (signal: NodeJS.Signals) => void;
  },
  shutdownMs = 15_000
): Promise<XeroBrowserResult> {
  return new Promise((resolveResult) => {
    let failed = false;
    let closed = false;
    let exitCode = 1;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = (confirmed: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      clearTimeout(poll);
      signal.removeEventListener("abort", stop);
      resolveResult({
        closed: confirmed,
        exitCode: failed || signal.aborted ? 1 : exitCode,
      });
    };
    const boundShutdown = () => {
      deadline ??= setTimeout(() => finish(false), shutdownMs);
    };
    const stop = () => {
      if (finished) {
        return;
      }
      failed = true;
      processControl.kill("SIGTERM");
      escalation ??= setTimeout(
        () => processControl.kill("SIGKILL"),
        Math.floor((shutdownMs * 2) / 3)
      );
      boundShutdown();
    };
    const confirm = () => {
      if (finished) {
        return;
      }
      if (closed && !processControl.exists()) {
        // An unspawned process has no writers. Otherwise only graceful success certifies Playwright teardown.
        finish(
          child.pid === undefined ||
            (!(failed || signal.aborted) && exitCode === 0)
        );
        return;
      }
      poll = setTimeout(confirm, 25);
    };
    child.once("error", () => {
      stop();
    });
    child.once("close", (code: number | null) => {
      if (finished) {
        return;
      }
      closed = true;
      exitCode = code ?? 1;
      boundShutdown();
      confirm();
    });
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) {
      stop();
    }
  });
}
export function spawnXeroBrowser(
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal
): Promise<XeroBrowserResult> {
  const child = spawn(
    "bun",
    [
      "--no-env-file",
      "./node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "tooling/release/xero-e2e.config.ts",
    ],
    {
      detached: true,
      env: environment,
      stdio: "ignore",
    }
  );
  return superviseXeroBrowser(child, signal, {
    exists: () => {
      if (!child.pid) {
        return false;
      }
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        return !(
          error instanceof Error &&
          "code" in error &&
          error.code === "ESRCH"
        );
      }
    },
    kill: (killSignal) => {
      try {
        if (child.pid) {
          process.kill(-child.pid, killSignal);
        }
      } catch {
        /* Keep unknown writer closure fenced. */
      }
    },
  });
}
const defaultDependencies: XeroRunnerDependencies = {
  acquire: () =>
    Promise.reject(new Error(currentXeroWorkerCapability().reason)),
  browser: spawnXeroBrowser,
  importConfiguration: () => import("@playwright/test"),
};
function markUnavailable(input: XeroReportInput, reason: XeroReason) {
  input.limitations = [...new Set([...input.limitations, reason])];
  input.scenarios = input.scenarios.map((entry) => ({
    ...(entry.status === "FAIL" ? entry : emptyObservation(entry.id, reason)),
    subcases: entry.subcases.map((subcase) =>
      subcase.status === "FAIL" || subcase.status === "PASS"
        ? subcase
        : emptyObservation(subcase.id, reason)
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
  let browserClosed = true;
  let collected: XeroCampaignCollection | null = null;
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
    input.verifiedRunId = manifest.runId;
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
      browserClosed = false;
      const browserResult = await dependencies.browser(
        {
          ...process.env,
          TC_XERO_MANIFEST: resolve(options.manifest),
          TC_XERO_RUNNER_CONTEXT: contextPath,
          TC_XERO_RUNNER_NONCE: context.nonce,
        },
        controller.signal
      );
      browserClosed = browserResult.closed;
      if (!browserClosed) {
        throw new Error("Browser writer closure is unresolved");
      }
      if (browserResult.exitCode !== 0) {
        input.defects.push({
          id: "browser-campaign",
          owner: "160",
          reason: "assertion-failed",
          severity: "high",
          status: "open",
        });
      }
      collected = await lease.collect("actions", null);
      assignCollection(input, collected);
    }
  } catch {
    markUnavailable(
      input,
      controller.signal.aborted ? "interrupted" : failureReason
    );
  } finally {
    if (lease && ledger && ledgerPath && authority) {
      if (!collected) {
        try {
          collected = await lease.collect("actions", null);
          assignCollection(input, collected);
        } catch {
          input.limitations.push("evidence-unavailable");
        }
      }
      const terminalStartedAt = new Date().toISOString();
      try {
        await requireBrowserWriterClosure(lease, browserClosed);
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
        try {
          await lease.cleanup.verifyOutsideOwned();
        } catch {
          /* Preserve recovery data. */
        }
        input.cleanup.provider = "FAIL";
        input.cleanup.fenceReleased = false;
        input.limitations.push("cleanup-incomplete");
      }
      try {
        const terminal = await lease.collect(
          "terminal",
          collected,
          terminalStartedAt
        );
        assignCollection(input, terminal);
      } catch {
        input.limitations.push("evidence-unavailable");
      }
    }
    input.endedAt = new Date().toISOString();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  return finishReport(input, dependencies);
}
async function requireBrowserWriterClosure(
  lease: XeroExecutionLease,
  closed: boolean
) {
  if (closed) {
    return;
  }
  // Safe observation continues, but deletion and ownership release cannot begin.
  try {
    await lease.cleanup.drainOwnedWorkers();
  } catch {
    /* Keep the fence. */
  }
  try {
    await lease.cleanup.verifyOutsideOwned();
  } catch {
    /* Keep recovery evidence. */
  }
  throw new Error("Browser writer closure is unresolved");
}
function assignCollection(
  input: XeroReportInput,
  collected: XeroCampaignCollection
) {
  input.scenarios = parseXeroObservations(collected.scenarios);
  input.lifecycleInput = collected.lifecycleInput;
  input.lifecycleRunId = collected.lifecycleRunId;
  input.limitations.push(...collected.limitations);
  input.defects.push(
    ...collected.defects.filter(
      (defect) => !input.defects.some((existing) => existing.id === defect.id)
    )
  );
  if (collected.limitations.includes("invalid-evidence")) {
    input.verifiedRunId = null;
  }
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

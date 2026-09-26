import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { XeroExecutionManifest } from "./xero-execution-guard.js";

export type XeroLedgerAuthority = Pick<
  XeroExecutionManifest,
  "runId" | "candidateSha" | "owned" | "dateWindow"
>;
const referenceSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const entrySchema = z.strictObject({
  action: z.enum([
    "create",
    "approve",
    "decline",
    "withdraw",
    "connect",
    "disconnect",
  ]),
  bindingGeneration: z.number().int().nonnegative(),
  cleanup: z.enum(["pending", "reconciled", "retained", "failed"]),
  cleanupReference: referenceSchema.nullable(),
  clerkOrgId: z.string().min(1),
  dateFrom: z.iso.date(),
  dateUntil: z.iso.date(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  id: z.uuid(),
  intendedAt: z.iso.datetime(),
  localId: z.uuid().nullable(),
  organisationId: z.uuid(),
  outcome: z.enum([
    "intended",
    "dispatched",
    "uncertain",
    "observed",
    "definite-non-attempt",
  ]),
  remoteId: z.string().min(1).max(128).nullable(),
  updatedAt: z.iso.datetime(),
});
const closureSchema = z.strictObject({
  drain: referenceSchema.nullable(),
  fence: referenceSchema.nullable(),
  local: referenceSchema.nullable(),
  outsideOwned: referenceSchema.nullable(),
  restoredWorkers: referenceSchema.nullable(),
  state: z.enum(["pending", "releasing", "released"]),
});
const ledgerSchema = z.strictObject({
  authorityHash: z.string().regex(/^[a-f0-9]{64}$/),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  closure: closureSchema,
  entries: z.array(entrySchema).max(100),
  fenceReleased: z.boolean(),
  runId: z.uuid(),
  version: z.literal(1),
});
export type XeroLedger = z.infer<typeof ledgerSchema>;
export type XeroLedgerEntry = z.infer<typeof entrySchema>;
function authorityHash(authority: XeroLedgerAuthority) {
  return createHash("sha256").update(JSON.stringify(authority)).digest("hex");
}
export function makeXeroLedger(authority: XeroLedgerAuthority): XeroLedger {
  return {
    authorityHash: authorityHash(authority),
    candidateSha: authority.candidateSha,
    closure: {
      drain: null,
      fence: null,
      local: null,
      outsideOwned: null,
      restoredWorkers: null,
      state: "pending",
    },
    entries: [],
    fenceReleased: false,
    runId: authority.runId,
    version: 1,
  };
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep the independent ancestor and destination checks together for review.
function privatePath(path: string) {
  const destination = resolve(path);
  const root = resolve("tooling/release/test-results");
  if (!destination.startsWith(`${root}${sep}`)) {
    throw new Error("Private ledger destination is invalid");
  }
  mkdirSync(root, { mode: 0o700, recursive: true });
  if (lstatSync(root).isSymbolicLink() || statSync(root).mode % 0o100 !== 0) {
    throw new Error("Private ledger directory is unsafe");
  }
  let parent = root;
  for (const part of relative(root, dirname(destination))
    .split(sep)
    .filter(Boolean)) {
    parent = resolve(parent, part);
    try {
      if (
        lstatSync(parent).isSymbolicLink() ||
        !statSync(parent).isDirectory() ||
        statSync(parent).mode % 0o100 !== 0
      ) {
        throw new Error("Private ledger directory is unsafe");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        mkdirSync(parent, { mode: 0o700 });
      } else {
        throw error;
      }
    }
  }
  if (
    !realpathSync(dirname(destination)).startsWith(
      `${realpathSync(root)}${sep}`
    )
  ) {
    throw new Error("Private ledger path escapes protected storage");
  }
  try {
    if (
      lstatSync(destination).isSymbolicLink() ||
      statSync(destination).mode % 0o100 !== 0
    ) {
      throw new Error("Private ledger file is unsafe");
    }
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }
  return destination;
}
export function persistXeroLedger(path: string, value: XeroLedger) {
  const ledger = ledgerSchema.parse(value);
  const destination = privatePath(path);
  const temporary = `${destination}.${process.pid}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(ledger)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, destination);
  const directory = openSync(dirname(destination), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
function assertAuthority(ledger: XeroLedger, authority: XeroLedgerAuthority) {
  if (
    ledger.runId !== authority.runId ||
    ledger.candidateSha !== authority.candidateSha ||
    ledger.authorityHash !== authorityHash(authority)
  ) {
    throw new Error("Recovery ledger authority mismatch");
  }
}
function assertEntryAuthority(
  ledger: XeroLedger,
  entry: XeroLedgerEntry,
  authority: XeroLedgerAuthority
) {
  assertAuthority(ledger, authority);
  entrySchema.parse(entry);
  const resource = authority.owned.find(
    (owned) =>
      owned.clerkOrgId === entry.clerkOrgId &&
      owned.organisationId === entry.organisationId &&
      owned.bindingGeneration === entry.bindingGeneration
  );
  if (
    !resource?.permittedOperations.includes(entry.action) ||
    entry.dateFrom < authority.dateWindow.from ||
    entry.dateUntil > authority.dateWindow.until ||
    entry.dateUntil < entry.dateFrom
  ) {
    throw new Error("Mutation intent is outside protected authority");
  }
  const count = ledger.entries.filter(
    (existing) =>
      existing.clerkOrgId === entry.clerkOrgId &&
      existing.organisationId === entry.organisationId &&
      existing.id !== entry.id &&
      existing.outcome !== "definite-non-attempt"
  ).length;
  if (
    count + (entry.outcome === "definite-non-attempt" ? 0 : 1) >
    resource.maximumMutations
  ) {
    throw new Error("Fixture mutation budget is exhausted");
  }
}
export function readXeroLedger(path: string, authority: XeroLedgerAuthority) {
  const ledger = ledgerSchema.parse(
    JSON.parse(readFileSync(privatePath(path), "utf8"))
  );
  assertAuthority(ledger, authority);
  for (const entry of ledger.entries) {
    assertEntryAuthority(ledger, entry, authority);
  }
  return ledger;
}
export function recordXeroIntent(
  path: string,
  ledger: XeroLedger,
  entry: XeroLedgerEntry,
  authority: XeroLedgerAuthority
) {
  assertEntryAuthority(ledger, entry, authority);
  if (
    ledger.fenceReleased ||
    ledger.closure.state !== "pending" ||
    ledger.entries.some(
      (existing) =>
        existing.id === entry.id ||
        (existing.fingerprint === entry.fingerprint &&
          existing.organisationId === entry.organisationId &&
          existing.clerkOrgId === entry.clerkOrgId &&
          existing.action === entry.action &&
          existing.outcome !== "definite-non-attempt")
    )
  ) {
    throw new Error("Duplicate or unfenced mutation intent");
  }
  if (
    entry.outcome !== "intended" ||
    entry.cleanup !== "pending" ||
    entry.remoteId !== null
  ) {
    throw new Error("New mutation intent is invalid");
  }
  ledger.entries.push(entry);
  persistXeroLedger(path, ledger);
}
export async function dispatchXeroIntent<T>(
  path: string,
  ledger: XeroLedger,
  id: string,
  dispatch: () => Promise<T>,
  returned: (value: T) => { localId: string | null; remoteId: string | null },
  authority: XeroLedgerAuthority
) {
  const persisted = readXeroLedger(path, authority);
  const entry = ledger.entries.find((item) => item.id === id);
  const stored = persisted.entries.find((item) => item.id === id);
  if (
    !(entry && stored) ||
    JSON.stringify(stored) !== JSON.stringify(entrySchema.parse(entry)) ||
    entry.outcome !== "intended" ||
    ledger.fenceReleased ||
    ledger.closure.state !== "pending"
  ) {
    throw new Error("Mutation cannot be replayed");
  }
  assertEntryAuthority(ledger, entry, authority);
  entry.outcome = "dispatched";
  entry.updatedAt = new Date().toISOString();
  persistXeroLedger(path, ledger);
  try {
    const value = await dispatch();
    const ids = returned(value);
    entry.localId = ids.localId;
    entry.remoteId = ids.remoteId;
    entry.outcome = ids.remoteId ? "observed" : "uncertain";
    entry.updatedAt = new Date().toISOString();
    persistXeroLedger(path, ledger);
    return value;
  } catch {
    entry.outcome = "uncertain";
    entry.updatedAt = new Date().toISOString();
    persistXeroLedger(path, ledger);
    // biome-ignore lint/style/useErrorCause: Raw provider errors remain private and must never enter diagnostic reports.
    throw new Error("Mutation outcome requires independent reconciliation");
  }
}
export interface XeroObservedEffect {
  bindingGeneration: number;
  clerkOrgId: string;
  fingerprint: string;
  organisationId: string;
  remoteId: string;
}
export interface XeroCleanupHooks {
  cleanupLocal: (entries: readonly XeroLedgerEntry[]) => Promise<string>;
  cleanupRemote: (
    entry: Readonly<XeroLedgerEntry>
  ) => Promise<{ disposition: "reconciled" | "retained"; reference: string }>;
  drainOwnedWorkers: () => Promise<string>;
  observe: (
    entry: Readonly<XeroLedgerEntry>
  ) => Promise<readonly XeroObservedEffect[]>;
  releaseFence: () => Promise<string>;
  restoreWorkers: () => Promise<string>;
  verifyOutsideOwned: () => Promise<string>;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep worker drain, independent remote observation and durable fence closure in their audited order.
export async function reconcileXeroLedger(
  path: string,
  ledger: XeroLedger,
  hooks: XeroCleanupHooks,
  authority: XeroLedgerAuthority
) {
  assertAuthority(ledger, authority);
  for (const entry of ledger.entries) {
    assertEntryAuthority(ledger, entry, authority);
  }
  const failures: string[] = [];
  try {
    ledger.closure.drain = referenceSchema.parse(
      await hooks.drainOwnedWorkers()
    );
    persistXeroLedger(path, ledger);
  } catch {
    failures.push("worker-drain");
  }
  for (const entry of ledger.entries) {
    if (entry.cleanup === "reconciled" || entry.cleanup === "retained") {
      continue;
    }
    try {
      if (entry.outcome === "definite-non-attempt") {
        entry.cleanup = "reconciled";
      } else {
        const matches = await hooks.observe(entry);
        const [match] = matches;
        if (
          matches.length !== 1 ||
          !match ||
          (entry.remoteId !== null && match.remoteId !== entry.remoteId) ||
          match.clerkOrgId !== entry.clerkOrgId ||
          match.organisationId !== entry.organisationId ||
          match.bindingGeneration !== entry.bindingGeneration ||
          match.fingerprint !== entry.fingerprint
        ) {
          throw new Error("Remote observation is ambiguous or foreign");
        }
        entry.remoteId = match.remoteId;
        entry.outcome = "observed";
        persistXeroLedger(path, ledger);
        if (failures.includes("worker-drain")) {
          failures.push("remote-cleanup-fenced");
        } else {
          const outcome = await hooks.cleanupRemote(entry);
          entry.cleanupReference = referenceSchema.parse(outcome.reference);
          entry.cleanup = outcome.disposition;
        }
      }
    } catch {
      entry.cleanup = "failed";
      failures.push("remote-reconciliation");
    }
    entry.updatedAt = new Date().toISOString();
    persistXeroLedger(path, ledger);
  }
  const unresolved = ledger.entries.some(
    (entry) =>
      entry.cleanup === "failed" ||
      entry.cleanup === "pending" ||
      entry.outcome === "uncertain" ||
      entry.outcome === "dispatched"
  );
  if (!unresolved && failures.length === 0) {
    try {
      ledger.closure.local = referenceSchema.parse(
        await hooks.cleanupLocal(ledger.entries)
      );
      persistXeroLedger(path, ledger);
    } catch {
      failures.push("local-cleanup");
    }
  }
  try {
    ledger.closure.outsideOwned = referenceSchema.parse(
      await hooks.verifyOutsideOwned()
    );
    persistXeroLedger(path, ledger);
  } catch {
    failures.push("outside-owned");
  }
  if (!unresolved && failures.length === 0) {
    try {
      ledger.closure.restoredWorkers = referenceSchema.parse(
        await hooks.restoreWorkers()
      );
      ledger.closure.state = "releasing";
      persistXeroLedger(path, ledger);
      ledger.closure.fence = referenceSchema.parse(await hooks.releaseFence());
      ledger.closure.state = "released";
      ledger.fenceReleased = true;
      persistXeroLedger(path, ledger);
    } catch {
      failures.push("fence-restoration");
    }
  }
  return { failures, fenceReleased: ledger.fenceReleased, unresolved };
}

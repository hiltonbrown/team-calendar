import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchXeroIntent,
  ingestXeroNoEffectProof,
  makeXeroLedger,
  observeXeroNoEffect,
  persistXeroLedger,
  readXeroLedger,
  reconcileXeroLedger,
  recordXeroIntent,
  type XeroCleanupHooks,
  type XeroLedgerAuthority,
  type XeroLedgerEntry,
} from "./xero-ledger.js";

const directories: string[] = [];
const reference = `sha256:${"d".repeat(64)}`;
function fixture() {
  const root = resolve("tooling/release/test-results");
  mkdirSync(root, { mode: 0o700, recursive: true });
  chmodSync(root, 0o700);
  const directory = mkdtempSync(`${root}/ledger-`);
  directories.push(directory);
  const path = resolve(directory, "ledger.json");
  const organisationId = randomUUID();
  const authority: XeroLedgerAuthority = {
    candidateSha: "a".repeat(40),
    dateWindow: { from: "2026-09-01", until: "2026-12-01" },
    owned: [
      {
        alias: "fixture-owned",
        bindingGeneration: 1,
        clerkOrgId: "org_owned",
        cohort: "A",
        employeeIds: [randomUUID()],
        independentRecoveryAlias: null,
        leaveTypeIds: [randomUUID()],
        maximumMutations: 5,
        organisationId,
        permittedOperations: ["create", "withdraw"],
        xeroTenantId: randomUUID(),
      },
    ],
    runId: randomUUID(),
  };
  const ledger = makeXeroLedger(authority);
  const entry: XeroLedgerEntry = {
    action: "create",
    bindingGeneration: 1,
    cleanup: "pending",
    cleanupReference: null,
    clerkOrgId: "org_owned",
    dateFrom: "2026-10-01",
    dateUntil: "2026-10-02",
    fingerprint: "b".repeat(64),
    id: randomUUID(),
    intendedAt: new Date().toISOString(),
    localId: null,
    organisationId,
    outcome: "intended",
    remoteId: null,
    updatedAt: new Date().toISOString(),
  };
  recordXeroIntent(path, ledger, entry, authority);
  return { authority, entry, ledger, path };
}
function hooks(): XeroCleanupHooks {
  return {
    cleanupLocal: vi.fn(async () => reference),
    cleanupRemote: vi.fn(async () => ({
      disposition: "reconciled" as const,
      reference,
    })),
    drainOwnedWorkers: vi.fn(async () => reference),
    observe: vi.fn(async (entry) => [
      {
        bindingGeneration: entry.bindingGeneration,
        clerkOrgId: entry.clerkOrgId,
        fingerprint: entry.fingerprint,
        organisationId: entry.organisationId,
        remoteId: "remote-owned",
      },
    ]),
    releaseFence: vi.fn(async () => reference),
    restoreWorkers: vi.fn(async () => reference),
    verifyOutsideOwned: vi.fn(async () => reference),
  };
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});
describe("durable Xero mutation recovery", () => {
  it("records durable dispatch and uncertain acknowledgement without replay", async () => {
    const { path, ledger, entry, authority } = fixture();
    const dispatch = vi.fn(() => {
      expect(readXeroLedger(path, authority).entries[0]?.outcome).toBe(
        "dispatched"
      );
      return Promise.reject(new Error("private provider body"));
    });
    await expect(
      dispatchXeroIntent(
        path,
        ledger,
        entry.id,
        dispatch,
        () => ({ localId: null, remoteId: null }),
        authority
      )
    ).rejects.toThrow("independent reconciliation");
    expect(readXeroLedger(path, authority).entries[0]?.outcome).toBe(
      "uncertain"
    );
    await expect(
      dispatchXeroIntent(
        path,
        ledger,
        entry.id,
        dispatch,
        () => ({ localId: null, remoteId: null }),
        authority
      )
    ).rejects.toThrow("cannot be replayed");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("blocks duplicate scoped fingerprints", () => {
    const { path, ledger, entry, authority } = fixture();
    expect(() =>
      recordXeroIntent(path, ledger, { ...entry, id: randomUUID() }, authority)
    ).toThrow("Duplicate");
  });
  it.each([
    "foreign-clerk",
    "foreign-organisation",
    "stale-generation",
    "operation",
    "dates",
    "count",
  ])("denies %s at intent and before dispatch", async (fault) => {
    const { path, ledger, entry, authority } = fixture();
    const altered = { ...entry, fingerprint: "c".repeat(64), id: randomUUID() };
    if (fault === "foreign-clerk") {
      altered.clerkOrgId = "org_foreign";
    }
    if (fault === "foreign-organisation") {
      altered.organisationId = randomUUID();
    }
    if (fault === "stale-generation") {
      altered.bindingGeneration = 2;
    }
    if (fault === "operation") {
      altered.action = "disconnect";
    }
    if (fault === "dates") {
      altered.dateUntil = "2027-01-01";
    }
    if (fault === "count" && authority.owned[0]) {
      for (
        let index = ledger.entries.length;
        index < authority.owned[0].maximumMutations;
        index += 1
      ) {
        recordXeroIntent(
          path,
          ledger,
          {
            ...entry,
            fingerprint: index.toString(16).padStart(64, "0"),
            id: randomUUID(),
          },
          authority
        );
      }
    }
    expect(() => recordXeroIntent(path, ledger, altered, authority)).toThrow();
    const dispatch = vi.fn(async () => "created");
    await expect(
      dispatchXeroIntent(
        path,
        ledger,
        entry.id,
        dispatch,
        () => ({ localId: null, remoteId: "remote-owned" }),
        {
          ...authority,
          dateWindow: { from: "2026-11-01", until: "2026-12-01" },
        }
      )
    ).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("recovers without a create callback and durably records closure receipts", async () => {
    const { path, ledger, entry, authority } = fixture();
    entry.outcome = "uncertain";
    persistXeroLedger(path, ledger);
    const recovered = readXeroLedger(path, authority);
    const cleanup = hooks();
    const result = await reconcileXeroLedger(
      path,
      recovered,
      cleanup,
      authority
    );
    expect(result.fenceReleased).toBe(true);
    expect(readXeroLedger(path, authority).closure).toEqual({
      drain: reference,
      fence: reference,
      local: reference,
      outsideOwned: reference,
      restoredWorkers: reference,
      state: "released",
    });
  });
  it("continues independent safe cleanup while retaining unresolved credentials and fence", async () => {
    const { path, ledger, entry, authority } = fixture();
    ledger.entries.push({
      ...entry,
      fingerprint: "c".repeat(64),
      id: randomUUID(),
    });
    persistXeroLedger(path, ledger);
    const cleanup = hooks();
    vi.mocked(cleanup.observe).mockResolvedValueOnce([]);
    const result = await reconcileXeroLedger(path, ledger, cleanup, authority);
    expect(result.unresolved).toBe(true);
    expect(cleanup.observe).toHaveBeenCalledTimes(2);
    expect(cleanup.cleanupRemote).toHaveBeenCalledTimes(1);
    expect(cleanup.cleanupLocal).not.toHaveBeenCalled();
    expect(cleanup.releaseFence).not.toHaveBeenCalled();
  });
  it("failed worker drain permits observation and fences remote cleanup", async () => {
    const { path, ledger, authority } = fixture();
    const cleanup = hooks();
    vi.mocked(cleanup.drainOwnedWorkers).mockRejectedValue(
      new Error("unavailable")
    );
    const result = await reconcileXeroLedger(path, ledger, cleanup, authority);
    expect(cleanup.observe).toHaveBeenCalledOnce();
    expect(cleanup.cleanupRemote).not.toHaveBeenCalled();
    expect(cleanup.cleanupLocal).not.toHaveBeenCalled();
    expect(cleanup.releaseFence).not.toHaveBeenCalled();
    expect(result.failures).toContain("worker-drain");
  });
  it("a wrong-scope observation cannot authorise remote cleanup", async () => {
    const { path, ledger, entry, authority } = fixture();
    const cleanup = hooks();
    vi.mocked(cleanup.observe).mockResolvedValue([
      {
        bindingGeneration: 1,
        clerkOrgId: "org_foreign",
        fingerprint: entry.fingerprint,
        organisationId: entry.organisationId,
        remoteId: "remote-foreign",
      },
    ]);
    const result = await reconcileXeroLedger(path, ledger, cleanup, authority);
    expect(result.unresolved).toBe(true);
    expect(cleanup.cleanupRemote).not.toHaveBeenCalled();
  });
  it("rejects foreign authority and insecure permissions", () => {
    const { path, authority } = fixture();
    expect(() =>
      readXeroLedger(path, { ...authority, runId: randomUUID() })
    ).toThrow("authority mismatch");
    chmodSync(path, 0o644);
    expect(() => readXeroLedger(path, authority)).toThrow("unsafe");
  });
  it("rejects symlink parents and never writes private data outside ignored storage", () => {
    const { path, ledger } = fixture();
    const outside = mkdtempSync(resolve(tmpdir(), "tc-outside-"));
    directories.push(outside);
    const link = resolve(path, "..", "escape");
    symlinkSync(outside, link);
    expect(() =>
      persistXeroLedger(resolve(link, "ledger.json"), ledger)
    ).toThrow("unsafe");
    expect(existsSync(resolve(outside, "ledger.json"))).toBe(false);
  });
  it("recovers definite non-attempt entries when the original mutation quota is full", async () => {
    const { path, ledger, entry, authority } = fixture();
    await observeXeroNoEffect(
      path,
      entry.id,
      async (intent) => ({
        action: intent.action,
        bindingGeneration: intent.bindingGeneration,
        candidateSha: authority.candidateSha,
        causalEvidence: reference,
        cause: "cancelled-before-dispatch",
        clerkOrgId: intent.clerkOrgId,
        fingerprint: intent.fingerprint,
        intentId: intent.id,
        observedAt: new Date().toISOString(),
        organisationId: intent.organisationId,
        providerDispatched: false,
        runId: authority.runId,
      }),
      authority
    );
    Object.assign(entry, readXeroLedger(path, authority).entries[0]);
    const maximum = authority.owned[0]?.maximumMutations;
    if (maximum === undefined) {
      throw new Error("Missing fixture quota");
    }
    for (let index = 0; index < maximum; index += 1) {
      recordXeroIntent(
        path,
        ledger,
        {
          ...entry,
          fingerprint: index.toString(16).padStart(64, "0"),
          id: randomUUID(),
          noEffectProof: null,
          outcome: "intended",
        },
        authority
      );
    }
    expect(() => readXeroLedger(path, authority)).not.toThrow();
    expect(() =>
      recordXeroIntent(
        path,
        ledger,
        {
          ...entry,
          fingerprint: "c".repeat(64),
          id: randomUUID(),
          noEffectProof: null,
          outcome: "intended",
        },
        authority
      )
    ).toThrow("budget");
    await expect(
      reconcileXeroLedger(
        path,
        readXeroLedger(path, authority),
        hooks(),
        authority
      )
    ).resolves.toHaveProperty("fenceReleased", true);
  });
  it("dispatches an admitted intent once at the original quota and denies an over-budget ledger before callback", async () => {
    const { path, ledger, entry, authority } = fixture();
    const maximum = authority.owned[0]?.maximumMutations;
    if (maximum === undefined) {
      throw new Error("Missing quota");
    }
    for (let index = ledger.entries.length; index < maximum; index += 1) {
      recordXeroIntent(
        path,
        ledger,
        {
          ...entry,
          fingerprint: index.toString(16).padStart(64, "0"),
          id: randomUUID(),
        },
        authority
      );
    }
    const dispatch = vi.fn(() => Promise.resolve("actual-result"));
    await dispatchXeroIntent(
      path,
      ledger,
      entry.id,
      dispatch,
      () => ({ localId: null, remoteId: "remote-owned" }),
      authority
    );
    expect(dispatch).toHaveBeenCalledOnce();
    ledger.entries.push({
      ...entry,
      fingerprint: "c".repeat(64),
      id: randomUUID(),
      outcome: "intended",
    });
    persistXeroLedger(path, ledger);
    await expect(
      dispatchXeroIntent(
        path,
        ledger,
        ledger.entries.at(-1)?.id ?? "",
        dispatch,
        () => ({ localId: null, remoteId: "remote-owned" }),
        authority
      )
    ).rejects.toThrow("budget");
    expect(dispatch).toHaveBeenCalledOnce();
  });
});

describe("causal independent no-effect receipts", () => {
  it.each(["rejected-before-provider", "approved-local-only"] as const)(
    "reconciles dispatched %s without a remote effect and preserves its mutation charge",
    async (cause) => {
      const { authority, entry, ledger, path } = fixture();
      await dispatchXeroIntent(
        path,
        ledger,
        entry.id,
        async () => undefined,
        () => ({ localId: null, remoteId: null }),
        authority
      );
      const receiptPath = resolve(path, "..", "no-effect.json");
      writeFileSync(
        receiptPath,
        JSON.stringify({
          action: entry.action,
          bindingGeneration: entry.bindingGeneration,
          candidateSha: authority.candidateSha,
          cause,
          clerkOrgId: entry.clerkOrgId,
          fingerprint: entry.fingerprint,
          intentId: entry.id,
          observedAt: new Date().toISOString(),
          organisationId: entry.organisationId,
          providerDispatchCount: 0,
          providerDispatched: false,
          runId: authority.runId,
          schemaVersion: 1,
          source:
            cause === "approved-local-only"
              ? "approved-transition-local-only"
              : "application-provider-rejection",
        }),
        { mode: 0o600 }
      );
      await observeXeroNoEffect(
        path,
        entry.id,
        async () => ingestXeroNoEffectProof(receiptPath, resolve(path, "..")),
        authority
      );
      expect(readXeroLedger(path, authority).entries[0]?.outcome).toBe(
        "verified-no-effect"
      );
      const cleanup = hooks();
      expect(
        await reconcileXeroLedger(path, ledger, cleanup, authority)
      ).toMatchObject({ fenceReleased: true, unresolved: false });
      expect(cleanup.observe).not.toHaveBeenCalled();
      expect(cleanup.cleanupRemote).not.toHaveBeenCalled();
    }
  );
  it.each([
    "accepted-create",
    "wrong-action",
    "wrong-run",
    "wrong-scope",
    "empty-query",
    "timeout",
  ])("rejects %s as absence proof", async (fault) => {
    const { authority, entry, ledger, path } = fixture();
    await dispatchXeroIntent(
      path,
      ledger,
      entry.id,
      async () => undefined,
      () => ({ localId: null, remoteId: null }),
      authority
    );
    const proof = {
      action: entry.action,
      bindingGeneration: entry.bindingGeneration,
      candidateSha: authority.candidateSha,
      causalEvidence: reference,
      cause: "rejected-before-provider" as const,
      clerkOrgId: entry.clerkOrgId,
      fingerprint: entry.fingerprint,
      intentId: entry.id,
      observedAt: new Date().toISOString(),
      organisationId: entry.organisationId,
      providerDispatched: false as const,
      runId: authority.runId,
    };
    if (fault === "wrong-action") {
      proof.action = "withdraw";
    }
    if (fault === "wrong-run") {
      proof.runId = randomUUID();
    }
    if (fault === "wrong-scope") {
      proof.clerkOrgId = "org_foreign";
    }
    const observer = () => {
      if (["accepted-create", "empty-query", "timeout"].includes(fault)) {
        return Promise.reject(
          new Error("No causal non-dispatch receipt exists")
        );
      }
      return Promise.resolve(proof);
    };
    await expect(
      observeXeroNoEffect(path, entry.id, observer, authority)
    ).rejects.toThrow();
    expect(readXeroLedger(path, authority).entries[0]?.outcome).toBe(
      "uncertain"
    );
  });
  it("refuses legacy manually labelled non-attempts without proof", () => {
    const { authority, entry, ledger, path } = fixture();
    entry.outcome = "definite-non-attempt";
    persistXeroLedger(path, ledger);
    expect(() => readXeroLedger(path, authority)).toThrow();
  });
});

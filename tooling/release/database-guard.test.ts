import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
  LIVE_DATABASE_ACKNOWLEDGEMENT,
} from "./database-guard.js";

const runId = "018f47d8-3c0a-7f95-8c77-44f4be5c3210";
const writeManifest = (overrides: Record<string, unknown> = {}) => {
  const path = join(mkdtempSync(join(tmpdir(), "tc-release-")), "manifest.json");
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      runId,
      candidateSha: "80ac9f7",
      target: {
        projectId: "project-id",
        branchId: "branch-id",
        endpointId: "endpoint-id",
        hostname: "endpoint-id.example.neon.tech",
        database: "teamcalendar",
        role: "release_role",
      },
      restoreEvidence: {
        observedAt: "2026-09-19T00:00:00.000Z",
        reference: "restore-reference",
      },
      namespace: `release:run:${runId}`,
      durableManifestConfirmed: true,
      active: true,
      owned: { clerkOrgIds: [], organisationIds: [], globalKeys: [] },
      pausedConsumers: {
        "rebuild-feed-cache": false,
        "reconcile-feed-publications": false,
        "reconcile-xero-approval-state": false,
        "recount-usage": false,
        "schedule-xero-syncs": false,
        "send-notification-emails": false,
        "sync-xero-leave-balances": false,
        "sync-xero-leave-records": false,
        "sync-xero-people": false,
      },
      pauseWindow: {
        currentlyPaused: [
          "rebuild-feed-cache",
          "reconcile-feed-publications",
          "reconcile-xero-approval-state",
          "recount-usage",
          "schedule-xero-syncs",
          "send-notification-emails",
          "sync-xero-leave-balances",
          "sync-xero-leave-records",
          "sync-xero-people",
        ],
        drainedAt: "2026-09-19T00:02:00.000Z",
        establishedAt: "2026-09-19T00:01:00.000Z",
      },
      ...overrides,
    })
  );
  return path;
};

const validInput = () => ({
  acknowledgement: LIVE_DATABASE_ACKNOWLEDGEMENT,
  databaseUrl:
    "postgresql://release_role:unused@endpoint-id.example.neon.tech/teamcalendar",
  manifestPath: writeManifest(),
  runId,
});

describe("live database guard", () => {
  it("rejects missing acknowledgement before authority is granted", () => {
    expect(() =>
      assertLiveDatabaseAuthority({ ...validInput(), acknowledgement: undefined })
    ).toThrow("acknowledgement");
  });

  it("rejects a reused or mismatched run namespace", () => {
    expect(() =>
      assertLiveDatabaseAuthority({
        ...validInput(),
        manifestPath: writeManifest({ namespace: "release:run:another" }),
      })
    ).toThrow("namespace");
  });

  it("rejects a manifest that omits the production consumer inventory", () => {
    expect(() =>
      assertLiveDatabaseAuthority({
        ...validInput(),
        manifestPath: writeManifest({ pausedConsumers: {} }),
      })
    ).toThrow("every registered consumer");
  });

  it("rejects a manifest without a fully paused and drained consumer window", () => {
    expect(() =>
      assertLiveDatabaseAuthority({
        ...validInput(),
        manifestPath: writeManifest({
          pauseWindow: {
            currentlyPaused: ["sync-xero-people"],
            drainedAt: "2026-09-19T00:02:00.000Z",
            establishedAt: "2026-09-19T00:01:00.000Z",
          },
        }),
      })
    ).toThrow("every consumer is paused");
  });

  it("rejects a target identity mismatch without opening a connection", () => {
    expect(() =>
      assertLiveDatabaseAuthority({
        ...validInput(),
        databaseUrl:
          "postgresql://release_role:unused@foreign.example.neon.tech/teamcalendar",
      })
    ).toThrow("protected target");
  });

  it("rejects a hostname that only contains the protected endpoint name", () => {
    expect(() =>
      assertLiveDatabaseAuthority({
        ...validInput(),
        databaseUrl:
          "postgresql://release_role:unused@endpoint-id.example.neon.tech.attacker.invalid/teamcalendar",
      })
    ).toThrow("protected target");
  });

  it("accepts a complete protected manifest for the exact target", () => {
    expect(assertLiveDatabaseAuthority(validInput()).runId).toBe(runId);
  });

  it("requires the durable KV copy to match the protected local manifest", async () => {
    const manifest = assertLiveDatabaseAuthority(validInput());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ result: JSON.stringify(manifest) }));
    try {
      await expect(
        assertDurableManifestReadBack(manifest, {
          url: "https://kv.example.test",
          token: "test-token",
        })
      ).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

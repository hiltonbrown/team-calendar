import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const candidateSha = "80ac9f7123456789012345678901234567890123";
const manifest = {
  active: true,
  candidateSha,
  durableManifestConfirmed: true,
  namespace: "release:run:018f47d8-3c0a-7f95-8c77-44f4be5c3210",
  owned: { clerkOrgIds: [], globalKeys: [], organisationIds: [] },
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
  restoreEvidence: {
    observedAt: "2026-09-19T00:00:00.000Z",
    reference: "restore-reference",
  },
  runId: "018f47d8-3c0a-7f95-8c77-44f4be5c3210",
  target: {
    branchId: "branch-id",
    database: "teamcalendar",
    endpointId: "endpoint-id",
    hostname: "endpoint-id.example.neon.tech",
    projectId: "project-id",
    role: "release_role",
  },
  version: 1,
};

describe("protected manifest writer", () => {
  it("writes a validated candidate-bound manifest with private permissions", () => {
    const output = join(
      mkdtempSync(join(tmpdir(), "tc-manifest-")),
      "run.json"
    );
    const result = spawnSync(
      "bun",
      [
        "run",
        "tooling/release/write-protected-manifest.ts",
        "--output",
        output,
        "--candidate-sha",
        candidateSha,
      ],
      {
        env: {
          ...process.env,
          TC_PROTECTED_MANIFEST_BASE64: Buffer.from(
            JSON.stringify(manifest)
          ).toString("base64"),
        },
      }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(manifest);
    expect(statSync(output).mode.toString(8).slice(-3)).toBe("600");
  });

  it("accepts the Xero lifecycle global-key kinds", () => {
    const output = join(
      mkdtempSync(join(tmpdir(), "tc-manifest-")),
      "run.json"
    );
    const lifecycleKinds = [
      "credential_owner",
      "provider_app",
      "provider_connection",
      "tenant_binding",
      "oauth_attempt",
      "cleanup_request",
      "cleanup_attempt",
      "shared_store_namespace",
    ];
    const result = spawnSync(
      "bun",
      [
        "run",
        "tooling/release/write-protected-manifest.ts",
        "--output",
        output,
        "--candidate-sha",
        candidateSha,
      ],
      {
        env: {
          ...process.env,
          TC_PROTECTED_MANIFEST_BASE64: Buffer.from(
            JSON.stringify({
              ...manifest,
              owned: {
                ...manifest.owned,
                globalKeys: lifecycleKinds.map((kind) => `${kind}:fixture`),
              },
            })
          ).toString("base64"),
        },
      }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8")).owned.globalKeys).toEqual(
      lifecycleKinds.map((kind) => `${kind}:fixture`)
    );
  });

  it("rejects unsupported or duplicate global ownership keys", () => {
    for (const globalKeys of [
      ["unsupported:fixture"],
      ["provider_app:"],
      ["provider_app:fixture", "provider_app:fixture"],
    ]) {
      const output = join(
        mkdtempSync(join(tmpdir(), "tc-manifest-")),
        "run.json"
      );
      const result = spawnSync(
        "bun",
        [
          "run",
          "tooling/release/write-protected-manifest.ts",
          "--output",
          output,
          "--candidate-sha",
          candidateSha,
        ],
        {
          env: {
            ...process.env,
            TC_PROTECTED_MANIFEST_BASE64: Buffer.from(
              JSON.stringify({
                ...manifest,
                owned: { ...manifest.owned, globalKeys },
              })
            ).toString("base64"),
          },
        }
      );
      expect(result.status).not.toBe(0);
    }
  });
});

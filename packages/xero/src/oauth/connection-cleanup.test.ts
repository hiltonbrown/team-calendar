import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({ database: {} }));

import {
  aggregateXeroDisconnectReceipt,
  freezeCleanupTargets,
  mapDeleteOutcomeToState,
} from "./connection-cleanup";

describe("disconnect receipts", () => {
  it.each([
    [[], "not_applicable"],
    [[{ outcome_reason: "report_only", state: "cancelled" }], "left_in_place"],
    [
      [{ outcome_reason: null, state: "confirmed_deleted" }],
      "confirmed_deleted",
    ],
    [[{ outcome_reason: null, state: "confirmed_absent" }], "confirmed_absent"],
    [
      [
        { outcome_reason: null, state: "confirmed_deleted" },
        { outcome_reason: null, state: "unknown" },
      ],
      "unknown",
    ],
    [
      [
        { outcome_reason: null, state: "confirmed_deleted" },
        { outcome_reason: null, state: "pending" },
      ],
      "partially_confirmed",
    ],
    [[{ outcome_reason: "superseded", state: "cancelled" }], "unknown"],
    [
      [
        { outcome_reason: null, state: "confirmed_absent" },
        { outcome_reason: "superseded", state: "cancelled" },
      ],
      "partially_confirmed",
    ],
    [
      [{ outcome_reason: null, state: "blocked_authorisation" }],
      "blocked_authorisation",
    ],
    [[{ outcome_reason: null, state: "claimed" }], "pending"],
  ] as const)("aggregates %j truthfully", (attempts, expected) =>
    expect(aggregateXeroDisconnectReceipt(attempts)).toBe(expected)
  );
  it("never widens frozen authority to another tenant or null owner", () => {
    const row = {
      provider_app_id: "app",
      remote_connection_id: "remote1",
      xero_credential_owner_id: "owner",
      xero_tenant_id: "file",
    };
    expect(
      freezeCleanupTargets({
        externalTenantId: "file",
        legacyRemoteConnectionId: "legacy",
        ownerId: "owner",
        providerAppId: "app",
        providerConnections: [
          row,
          { ...row, remote_connection_id: "other", xero_tenant_id: "other" },
          {
            ...row,
            remote_connection_id: "null",
            xero_credential_owner_id: null,
          },
        ],
      })
    ).toEqual(["remote1", "legacy"]);
    expect(
      freezeCleanupTargets({
        externalTenantId: "file",
        legacyRemoteConnectionId: "legacy",
        ownerId: null,
        providerAppId: "app",
        providerConnections: [row],
      })
    ).toEqual(["legacy"]);
  });
  it("never automatically retries an ambiguous dispatched response", () => {
    expect(mapDeleteOutcomeToState({ kind: "server_error" }).state).toBe(
      "unknown"
    );
    expect(mapDeleteOutcomeToState({ kind: "unknown" }).state).toBe("unknown");
    expect(mapDeleteOutcomeToState({ kind: "not_sent" }).state).toBe("pending");
  });
});

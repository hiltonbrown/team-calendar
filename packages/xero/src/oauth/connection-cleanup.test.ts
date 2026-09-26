import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const retirement = vi.hoisted(() => ({
  execute: vi.fn(),
  lock: vi.fn(),
  request: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: { $transaction: retirement.transaction },
}));

import {
  aggregateXeroDisconnectReceipt,
  freezeCleanupTargets,
  mapDeleteOutcomeToState,
  retireResolvedCleanupRequest,
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

describe("terminal cleanup retirement", () => {
  const scope = {
    clerkOrgId: "clerk",
    organisationId: "organisation",
    requestId: "request",
  };
  const terminal = {
    clerk_org_id: scope.clerkOrgId,
    expected_binding_generation: 2,
    organisation_id: scope.organisationId,
    state: "confirmed_absent",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    retirement.request.mockResolvedValue({
      attempts: [terminal],
      binding_generation: 2,
      xero_tenant_id: "tenant",
    });
    retirement.transaction.mockImplementation(async (callback) =>
      callback({
        $executeRaw: retirement.execute,
        $queryRaw: retirement.lock,
        xeroCleanupRequest: { findFirst: retirement.request },
        xeroTenant: { updateMany: retirement.update },
      })
    );
    retirement.update.mockResolvedValue({ count: 1 });
  });
  it("retires only the current reserved disconnected scoped binding", async () => {
    await retireResolvedCleanupRequest(scope);
    expect(retirement.request).toHaveBeenCalledExactlyOnceWith({
      include: { attempts: true },
      where: {
        clerk_org_id: "clerk",
        id: "request",
        organisation_id: "organisation",
      },
    });
    expect(retirement.update).toHaveBeenCalledExactlyOnceWith({
      data: {
        active_slot: null,
        retired_at: expect.any(Date),
        retirement_reason: "disconnected",
      },
      where: {
        active_slot: 1,
        binding_generation: 2,
        clerk_org_id: "clerk",
        id: "tenant",
        organisation_id: "organisation",
        retired_at: null,
        xero_connection: { status: "disconnected" },
      },
    });
    expect(retirement.lock.mock.invocationCallOrder[0]).toBeLessThan(
      retirement.update.mock.invocationCallOrder[0] ?? 0
    );
  });
  it.each([
    ["empty authority", []],
    ["unknown", [{ ...terminal, state: "unknown" }]],
    ["pending", [{ ...terminal, state: "pending" }]],
    ["foreign Clerk Org", [{ ...terminal, clerk_org_id: "foreign" }]],
    ["foreign Organisation", [{ ...terminal, organisation_id: "foreign" }]],
    ["different generation", [{ ...terminal, expected_binding_generation: 3 }]],
  ])("preserves reservation for %s", async (_case, attempts) => {
    retirement.request.mockResolvedValue({
      attempts,
      binding_generation: 2,
      xero_tenant_id: "tenant",
    });
    await retireResolvedCleanupRequest(scope);
    expect(retirement.update).not.toHaveBeenCalled();
  });
});

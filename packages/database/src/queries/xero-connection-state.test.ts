import { beforeEach, describe, expect, it, vi } from "vitest";

const FORBIDDEN_PATTERN = /access_token|refresh_token|auth_tag|_iv|payload/;

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), tenant: vi.fn() }));
vi.mock("../client", () => ({
  database: {
    xeroCleanupAttempt: { findFirst: mocks.cleanup },
    xeroTenant: { findFirst: mocks.tenant },
  },
}));
const { getXeroConnectionState } = await import("./xero-connection-state");
const scope = {
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};
function binding(
  options: {
    activeSlot?: number | null;
    status?: string;
    owner?: string | null;
    lastError?: string | null;
    revokedAt?: Date | null;
    disconnectedAt?: Date | null;
    retiredAt?: Date | null;
  } = {}
) {
  return {
    active_slot: options.activeSlot === undefined ? 1 : options.activeSlot,
    binding_generation: 7,
    credential_owner: options.owner ? { usability: options.owner } : null,
    id: "tenant_1",
    retired_at: options.retiredAt ?? null,
    xero_connection: {
      disconnected_at: options.disconnectedAt ?? null,
      last_error_code: options.lastError ?? null,
      revoked_at: options.revokedAt ?? null,
      status: options.status ?? "active",
    },
  };
}
describe("getXeroConnectionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenant.mockResolvedValue(binding());
    mocks.cleanup.mockResolvedValue(null);
  });
  it("scopes every read and selects only noncredential metadata", async () => {
    await expect(getXeroConnectionState(scope)).resolves.toEqual({
      ok: true,
      value: { bindingGeneration: 7, state: "connected" },
    });
    const tenantQuery = mocks.tenant.mock.calls[0]?.[0];
    expect(tenantQuery.where).toEqual({
      clerk_org_id: scope.clerkOrgId,
      organisation_id: scope.organisationId,
    });
    const selected = JSON.stringify(tenantQuery.select);
    expect(selected).not.toMatch(FORBIDDEN_PATTERN);
    expect(mocks.cleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
        where: expect.objectContaining({
          clerk_org_id: scope.clerkOrgId,
          expected_binding_generation: 7,
          organisation_id: scope.organisationId,
          request: {
            binding_generation: 7,
            clerk_org_id: scope.clerkOrgId,
            organisation_id: scope.organisationId,
            xero_tenant_id: "tenant_1",
          },
        }),
      })
    );
  });
  it("checks only unresolved cleanup at the current generation", async () => {
    mocks.cleanup.mockResolvedValue({ id: "attempt_1" });
    await expect(getXeroConnectionState(scope)).resolves.toMatchObject({
      ok: true,
      value: { bindingGeneration: 7, state: "disconnect_pending" },
    });
    expect(mocks.cleanup.mock.calls[0]?.[0].where.state.in).toEqual([
      "pending",
      "claimed",
      "dispatching",
      "blocked_authorisation",
      "unknown",
    ]);
  });
  it("does not treat completed or older cleanup as pending after reconnect", async () => {
    mocks.cleanup.mockImplementation((query) =>
      query.where.expected_binding_generation === 6
        ? { id: "old_attempt" }
        : null
    );
    await expect(getXeroConnectionState(scope)).resolves.toMatchObject({
      ok: true,
      value: { bindingGeneration: 7, state: "connected" },
    });
  });
  it.each([
    [
      "owner reauthorisation",
      { owner: "reauthorisation_required" },
      "reauthorisation_required",
    ],
    [
      "legacy invalid refresh",
      { lastError: "refresh_token_invalid", status: "stale" },
      "reauthorisation_required",
    ],
    [
      "legacy invalid grant",
      { lastError: "invalid_grant", status: "stale" },
      "reauthorisation_required",
    ],
    [
      "usable owner with an invalid stale legacy mirror",
      { lastError: "refresh_token_invalid", owner: "usable", status: "stale" },
      "connected",
    ],
    ["recoverable expired connection", { status: "stale" }, "connected"],
    [
      "configuration incident",
      { lastError: "client_credentials_invalid", status: "stale" },
      "connected",
    ],
    ["retired binding", { retiredAt: new Date() }, "not_connected"],
    ["unreserved binding", { activeSlot: null }, "not_connected"],
    ["revoked binding", { revokedAt: new Date() }, "not_connected"],
    ["disconnected binding", { disconnectedAt: new Date() }, "not_connected"],
  ] as const)("preserves %s", async (_label, options, state) => {
    mocks.tenant.mockResolvedValue(binding(options));
    await expect(getXeroConnectionState(scope)).resolves.toMatchObject({
      ok: true,
      value: { state },
    });
  });
  it.each([-1, 1.5])("rejects invalid generation %s", async (generation) => {
    mocks.tenant.mockResolvedValue({
      ...binding(),
      binding_generation: generation,
    });
    await expect(getXeroConnectionState(scope)).resolves.toEqual({
      error: { code: "state_unavailable" },
      ok: false,
    });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("returns not_connected only for a successful absent-binding lookup", async () => {
    mocks.tenant.mockResolvedValue(null);
    await expect(getXeroConnectionState(scope)).resolves.toEqual({
      ok: true,
      value: { bindingGeneration: null, state: "not_connected" },
    });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it.each(["tenant", "cleanup"] as const)(
    "preserves unavailable when %s lookup fails",
    async (name) => {
      mocks[name].mockRejectedValue(new Error("private failure"));
      await expect(getXeroConnectionState(scope)).resolves.toEqual({
        error: { code: "state_unavailable" },
        ok: false,
      });
    }
  );
});

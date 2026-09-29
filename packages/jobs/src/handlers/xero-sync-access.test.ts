import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async () => 1),
  find: vi.fn(),
  query: vi.fn(async () => []),
  resolve: vi.fn(),
  transaction: vi.fn(),
  writes: vi.fn(async () => ({ count: 1 })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => {
  const tx = {
    $executeRaw: mocks.execute,
    $queryRaw: mocks.query,
    person: { updateMany: mocks.writes },
    xeroTenant: { findFirst: mocks.find },
  };
  return {
    database: {
      ...tx,
      $transaction: mocks.transaction.mockImplementation(async (operation) =>
        operation(tx)
      ),
    },
  };
});
vi.mock("@repo/xero", async () => ({
  classifyXeroFailure: (
    await vi.importActual<typeof import("@repo/xero")>("@repo/xero")
  ).classifyXeroFailure,
  resolveXeroAccess: mocks.resolve,
  toResolvedXeroTenant: (routingScope, value) => ({
    ...routingScope,
    ...value,
  }),
}));
const {
  afterXeroBindingCommit,
  withXeroBinding,
  resolveSyncTenant,
  rejectRetryableSyncResult,
  XeroBindingChangedError,
} = await import("./xero-sync-access");
const scope = {
  bindingGeneration: 3,
  clerkOrgId: "org_a",
  organisationId: "00000000-0000-4000-8000-000000000001",
  xeroTenantId: "00000000-0000-4000-8000-000000000002",
};

describe("Xero sync generation fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({
      id: scope.xeroTenantId,
      sync_paused_at: null,
    });
  });
  it("locks the current scoped binding before the actual batch and reuses its transaction", async () => {
    await withXeroBinding(scope, async (tx) => {
      expect(mocks.query).toHaveBeenCalledWith(
        expect.anything(),
        `xero-binding:${scope.xeroTenantId}`
      );
      expect(mocks.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            active_slot: 1,
            binding_generation: 3,
            clerk_org_id: scope.clerkOrgId,
            id: scope.xeroTenantId,
            organisation_id: scope.organisationId,
            retired_at: null,
          }),
        })
      );
      await tx.person.updateMany({
        data: { is_active: false },
        where: {
          clerk_org_id: scope.clerkOrgId,
          organisation_id: scope.organisationId,
        },
      });
      await withXeroBinding(scope, (sameTx) => {
        expect(sameTx).toBe(tx);
        return Promise.resolve();
      });
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.writes).toHaveBeenCalledTimes(1);
  });
  it("cancels a changed or disconnected generation before any batch mutation", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(
      withXeroBinding(scope, async (tx) =>
        tx.person.updateMany({ data: { is_active: false } })
      )
    ).rejects.toBeInstanceOf(XeroBindingChangedError);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("rejects mismatched scope nesting rather than reusing a sibling transaction", async () => {
    await expect(
      withXeroBinding(scope, async () =>
        withXeroBinding({ ...scope, organisationId: "sibling" }, async (tx) =>
          tx.person.updateMany({ data: { is_active: false } })
        )
      )
    ).rejects.toBeInstanceOf(XeroBindingChangedError);
    expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("rejects a resolver database tenant mismatch before any provider consumer", async () => {
    mocks.resolve.mockResolvedValue({
      ok: true,
      value: { xeroTenantDatabaseId: "sibling" },
    });
    await expect(
      resolveSyncTenant(scope, "payroll.employees.read")
    ).rejects.toBeInstanceOf(XeroBindingChangedError);
  });
  it("passes exact scope capability generation and one absolute deadline to resolution", async () => {
    mocks.resolve.mockResolvedValue({
      ok: true,
      value: { xeroTenantDatabaseId: scope.xeroTenantId },
    });
    await resolveSyncTenant(scope, "payroll.employees.read");
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "payroll.employees.read",
        clerkOrgId: scope.clerkOrgId,
        deadline: { expiresAtMs: expect.any(Number) },
        expectedBindingGeneration: 3,
        organisationId: scope.organisationId,
      })
    );
  });
  it("rejects retryable service Results at the registered job boundary", async () => {
    await expect(
      rejectRetryableSyncResult(
        Promise.resolve({ error: { code: "unknown_error" }, ok: false })
      )
    ).rejects.toThrow("retry_later");
    await expect(
      rejectRetryableSyncResult(
        Promise.resolve({ error: { code: "validation_error" }, ok: false })
      )
    ).resolves.toMatchObject({ ok: false });
  });
});

it("projects only after canonical commit and reacquires the generation fence", async () => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: scope.xeroTenantId });
  let committed = false;
  const baseTransaction = mocks.transaction.getMockImplementation();
  if (!baseTransaction) {
    throw new Error("Missing fake transaction");
  }
  mocks.transaction.mockImplementation(async (operation) => {
    const value = await baseTransaction(operation);
    committed = true;
    return value;
  });
  const effect = vi.fn(() => {
    expect(committed).toBe(true);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    return Promise.resolve();
  });
  await withXeroBinding(scope, async (tx) => {
    await tx.person.updateMany({ data: { is_active: false } });
    await afterXeroBindingCommit(scope, effect);
    expect(effect).not.toHaveBeenCalled();
  });
  expect(effect).toHaveBeenCalledTimes(1);
});

it("cancels deferred projection when binding generation changed after canonical commit", async () => {
  vi.clearAllMocks();
  mocks.find
    .mockResolvedValueOnce({ id: scope.xeroTenantId })
    .mockResolvedValue(null);
  const effect = vi.fn(async () => undefined);
  await expect(
    withXeroBinding(scope, async () => afterXeroBindingCommit(scope, effect))
  ).rejects.toBeInstanceOf(XeroBindingChangedError);
  expect(effect).not.toHaveBeenCalled();
});

// Campaign authority is verified in database runtime protocol tests; these tests isolate handler behaviour.
vi.mock("@repo/database/xero-campaign-access", () => ({
  assertXeroCampaignAccess: vi.fn(() => Promise.resolve()),
  assertXeroCampaignDispatch: vi.fn(() => Promise.resolve()),
  claimXeroCampaignScheduledDispatch: vi.fn(() => Promise.resolve(undefined)),
  currentXeroCampaignInvocation: vi.fn(() => undefined),
  lockXeroCampaignPersistence: vi.fn(() => Promise.resolve()),
  recordXeroCampaignDispatch: vi.fn(() => Promise.resolve()),
  withXeroCampaignInvocation: vi.fn(
    (_functionId: string, _input: unknown, operation: () => Promise<unknown>) =>
      operation()
  ),
  withXeroCampaignScopedEffect: (
    _scope: unknown,
    operation: () => Promise<unknown>
  ) => operation(),
  withXeroCampaignScopedInvocation: vi.fn(
    (_functionId: string, _input: unknown, operation: () => Promise<unknown>) =>
      operation()
  ),
  xeroCampaignAllowsOrdinaryMaintenance: vi.fn(() => Promise.resolve(true)),
}));

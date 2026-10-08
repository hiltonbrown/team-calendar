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
    xeroConnection: { findFirst: mocks.find },
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
  toResolvedXeroConnection: (routingScope, value) => ({
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
  clerkOrgId: "org_a",
  connectionId: "00000000-0000-4000-8000-000000000002",
  organisationId: "00000000-0000-4000-8000-000000000001",
};
describe("Xero sync connection lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({
      id: scope.connectionId,
      sync_paused_at: null,
    });
  });
  it("locks the current scoped binding before the actual batch and reuses its transaction", async () => {
    await withXeroBinding(scope, async (tx) => {
      expect(mocks.query).toHaveBeenCalledWith(
        expect.anything(),
        scope.connectionId,
        scope.clerkOrgId,
        scope.organisationId
      );
      expect(mocks.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clerk_org_id: scope.clerkOrgId,
            id: scope.connectionId,
            organisation_id: scope.organisationId,
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
  it("checks the captured external file before allowing persistence", async () => {
    await withXeroBinding(
      { ...scope, expectedXeroTenantId: "captured-file" },
      async () => undefined
    );
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ xero_tenant_id: "captured-file" }),
      })
    );
  });
  it("cancels a changed or disconnected connection before any batch mutation", async () => {
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
  it("rejects a resolver local connection mismatch before any provider consumer", async () => {
    mocks.resolve.mockResolvedValue({
      ok: true,
      value: { connectionId: "sibling" },
    });
    await expect(
      resolveSyncTenant(scope, "payroll.employees.read")
    ).rejects.toBeInstanceOf(XeroBindingChangedError);
  });
  it.each([
    { capability: "payroll.employees.read" },
    { capability: ["payroll.employees", "payroll.employees.read"] },
  ])(
    "passes exact connection and capability $capability with one absolute deadline",
    async ({ capability }) => {
      mocks.resolve.mockResolvedValue({
        ok: true,
        value: { connectionId: scope.connectionId },
      });
      await resolveSyncTenant(scope, capability);
      expect(mocks.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          capability,
          clerkOrgId: scope.clerkOrgId,
          connectionId: scope.connectionId,
          deadline: { expiresAtMs: expect.any(Number) },
          organisationId: scope.organisationId,
        })
      );
    }
  );
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
it("projects only after canonical commit and reacquires the connection lock", async () => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: scope.connectionId });
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
it("cancels deferred projection when connection disconnected after canonical commit", async () => {
  vi.clearAllMocks();
  mocks.find
    .mockResolvedValueOnce({ id: scope.connectionId })
    .mockResolvedValue(null);
  const effect = vi.fn(async () => undefined);
  await expect(
    withXeroBinding(scope, async () => afterXeroBindingCommit(scope, effect))
  ).rejects.toBeInstanceOf(XeroBindingChangedError);
  expect(effect).not.toHaveBeenCalled();
});

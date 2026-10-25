import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertNoTenantTransaction: vi.fn(),
  company: vi.fn(),
  createCompany: vi.fn(),
  lock: vi.fn(),
  memberships: vi.fn(),
  ready: vi.fn(),
  settings: vi.fn(),
  withTenantResult: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../user-lifecycle", () => ({ completeAuthUserLifecycle: vi.fn() }));
vi.mock("@repo/database", () => ({
  assertNoTenantTransaction: mocks.assertNoTenantTransaction,
  withTenantResult: mocks.withTenantResult,
}));
vi.mock("@repo/database/system", () => ({
  systemDatabase: {
    authMember: { findMany: mocks.memberships },
    authOrganization: { update: mocks.ready },
  },
}));
vi.mock("@repo/email", () => ({ sendAuthEmail: vi.fn() }));

import { ensureUserAccountsReady } from "./better-auth-server";

const account = {
  country_code: "AU",
  id: "55555555-5555-4555-8555-555555555552",
  metadata: JSON.stringify({ bootstrapTimeZone: "Australia/Brisbane" }),
  name: "Account",
  provisioning_status: "pending",
};
describe("retryable default payroll Organisation provisioning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.memberships.mockResolvedValue([{ account }]);
    mocks.company.mockResolvedValue(null);
    mocks.createCompany.mockResolvedValue({ id: "company" });
    mocks.withTenantResult.mockImplementation(async (_id, callback) =>
      callback({
        $queryRaw: mocks.lock,
        accountSettings: { upsert: mocks.settings },
        organisation: { create: mocks.createCompany, findFirst: mocks.company },
      })
    );
  });
  it("creates scoped defaults before marking the Account ready", async () => {
    await ensureUserAccountsReady("user");
    expect(mocks.assertNoTenantTransaction).toHaveBeenCalledWith(
      "ensureUserAccountsReady"
    );
    expect(mocks.withTenantResult).toHaveBeenCalledWith(
      account.id,
      expect.any(Function)
    );
    expect(mocks.createCompany).toHaveBeenCalledWith({
      data: {
        account_id: account.id,
        country_code: "AU",
        name: account.name,
        timezone: "Australia/Brisbane",
      },
    });
    expect(mocks.settings).toHaveBeenCalledWith({
      create: { account_id: account.id },
      update: {},
      where: { account_id: account.id },
    });
    expect(mocks.ready).toHaveBeenCalledWith({
      data: { provisioning_status: "ready" },
      where: { id: account.id },
    });
    expect(mocks.ready.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.settings.mock.invocationCallOrder[0]
    );
  });
  it("reuses a company left by an interrupted post-commit retry", async () => {
    mocks.company.mockResolvedValue({ id: "existing" });
    await ensureUserAccountsReady("user");
    expect(mocks.createCompany).not.toHaveBeenCalled();
    expect(mocks.ready).toHaveBeenCalledOnce();
  });
  it("keeps failed domain setup pending and retryable", async () => {
    mocks.withTenantResult.mockResolvedValue({
      error: { code: "internal" },
      ok: false,
    });
    await expect(ensureUserAccountsReady("user")).rejects.toThrow(
      "Account setup"
    );
    expect(mocks.ready).not.toHaveBeenCalled();
  });
  it("skips ready Accounts and rejects unsupported bootstrap countries", async () => {
    mocks.memberships.mockResolvedValue([
      { account: { ...account, provisioning_status: "ready" } },
    ]);
    await ensureUserAccountsReady("user");
    expect(mocks.withTenantResult).not.toHaveBeenCalled();
    mocks.memberships.mockResolvedValue([
      { account: { ...account, country_code: "NZ" } },
    ]);
    await expect(ensureUserAccountsReady("user")).rejects.toThrow(
      "current release"
    );
  });
});

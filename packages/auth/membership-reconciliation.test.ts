import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileAccountPeople } from "./membership-reconciliation";

const state = vi.hoisted(() => ({
  accountId: "55555555-5555-4555-8555-555555555552",
  companyId: "55555555-5555-4555-8555-555555555553",
  inTenant: false,
  linkedUserId: null as string | null,
  member: true,
  membership: vi.fn(),
  removeBeforeLink: false,
  tenant: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/system", () => ({
  systemDatabase: { authMember: { findUnique: state.membership } },
}));
vi.mock("@repo/database/tenant-guard", () => ({
  assertNoTenantTransaction: () => {
    if (state.inTenant) {
      throw new Error("Auth ownership read inside tenant transaction");
    }
  },
}));
vi.mock("@repo/database", () => ({ withTenantDb: state.tenant }));
const user = {
  email: "verified@example.test",
  emailVerified: true,
  id: "55555555-5555-4555-8555-555555555554",
};

beforeEach(() => {
  vi.resetAllMocks();
  state.inTenant = false;
  state.linkedUserId = null;
  state.member = true;
  state.removeBeforeLink = false;
  state.membership.mockImplementation(() => {
    if (state.inTenant) {
      throw new Error("Auth ownership read inside tenant transaction");
    }
    return Promise.resolve(state.member ? { id: "membership" } : null);
  });
  state.update.mockImplementation(({ data }) => {
    if (state.removeBeforeLink && data.user_id) {
      state.member = false;
      state.linkedUserId = null;
    }
    state.linkedUserId = data.user_id;
    return Promise.resolve({ count: 1 });
  });
  state.tenant.mockImplementation(async (accountId, callback) => {
    expect(accountId).toBe(state.accountId);
    state.inTenant = true;
    try {
      return await callback({
        organisation: { findMany: async () => [{ id: state.companyId }] },
        person: {
          findFirst: async () => (state.linkedUserId ? { id: "person" } : null),
          findMany: async () => [{ id: "person" }],
          updateMany: state.update,
        },
      });
    } finally {
      state.inTenant = false;
    }
  });
});

describe("membership Person reconciliation", () => {
  it("links the existing payroll Person for a verified current membership", async () => {
    await reconcileAccountPeople(user, [state.accountId]);
    expect(state.linkedUserId).toBe(user.id);
    expect(state.membership).toHaveBeenCalledTimes(2);
    expect(state.membership).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        account_id_user_id: { account_id: state.accountId, user_id: user.id },
      },
    });
    expect(state.update).toHaveBeenCalledWith({
      data: { user_id: user.id },
      where: {
        account_id: state.accountId,
        id: "person",
        organisation_id: state.companyId,
        user_id: null,
      },
    });
  });
  it("does not link a user whose membership has already been removed", async () => {
    state.member = false;
    await reconcileAccountPeople(user, [state.accountId]);
    expect(state.linkedUserId).toBeNull();
    expect(state.tenant).not.toHaveBeenCalled();
  });
  it("clears a delayed link when removal committed between the two phases", async () => {
    state.removeBeforeLink = true;
    await reconcileAccountPeople(user, [state.accountId]);
    expect(state.linkedUserId).toBeNull();
    expect(state.update).toHaveBeenLastCalledWith({
      data: { user_id: null },
      where: { account_id: state.accountId, user_id: user.id },
    });
    expect(state.tenant).toHaveBeenCalledTimes(2);
  });
  it("does not inspect membership or tenant rows before email verification", async () => {
    await reconcileAccountPeople({ ...user, emailVerified: false }, [
      state.accountId,
    ]);
    expect(state.membership).not.toHaveBeenCalled();
    expect(state.tenant).not.toHaveBeenCalled();
  });
});

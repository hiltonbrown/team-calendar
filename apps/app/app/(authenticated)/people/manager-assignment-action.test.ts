import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  effects: [] as Array<() => Promise<void>>,
  getSession: vi.fn(),
  revalidate: vi.fn(),
  setManager: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: vi.fn(),
  getSession: state.getSession,
}));
vi.mock("@repo/availability", () => ({ setPersonManager: state.setManager }));
vi.mock("@repo/database", () => ({
  afterTenantCommit: (_db: unknown, effect: () => Promise<void>) =>
    state.effects.push(effect),
  withTenantResult: state.transaction,
}));
vi.mock("@repo/jobs", () => ({ syncXeroLeaveBalances: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: vi.fn(),
}));

import { setPersonManagerAction } from "./_actions";

const input = {
  managerPersonId: "22222222-2222-4222-8222-222222222222",
  personId: "11111111-1111-4111-8111-111111111111",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.effects = [];
  state.getSession.mockResolvedValue({
    accountId: "account-A",
    role: "owner",
    userId: "user-1",
  });
  state.setManager.mockResolvedValue({
    ok: true,
    value: { managerPersonId: input.managerPersonId },
  });
  state.transaction.mockImplementation(
    async (_account: string, fn: (db: object) => Promise<{ ok: boolean }>) => {
      const result = await fn({});
      expect(state.revalidate).not.toHaveBeenCalled();
      if (result.ok) {
        for (const effect of state.effects) {
          await effect();
        }
      }
      return result;
    }
  );
});
test("manager assignment uses the authenticated account and an owned write scope", async () => {
  expect(await setPersonManagerAction(input)).toMatchObject({ ok: true });
  expect(state.transaction).toHaveBeenCalledWith(
    "account-A",
    expect.any(Function)
  );
  expect(state.setManager).toHaveBeenCalledWith(
    {
      ...input,
      accountId: "account-A",
      actingRole: "owner",
      actingUserId: "user-1",
    },
    expect.any(Object)
  );
  expect(state.revalidate).toHaveBeenCalledWith("/people");
});
test.each(["manager", "viewer"])(
  "%s is rejected before starting a transaction",
  async (role) => {
    state.getSession.mockResolvedValue({
      accountId: "account-A",
      role,
      userId: "user-1",
    });
    expect(await setPersonManagerAction(input)).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(state.transaction).not.toHaveBeenCalled();
  }
);
test("a rejected graph change schedules no cache revalidation", async () => {
  state.setManager.mockResolvedValue({
    error: { code: "validation_error", message: "Cycle" },
    ok: false,
  });
  expect(await setPersonManagerAction(input)).toMatchObject({ ok: false });
  expect(state.effects).toHaveLength(0);
  expect(state.revalidate).not.toHaveBeenCalled();
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
}));

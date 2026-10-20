import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  effects: [] as Array<() => Promise<void>>,
  revalidate: vi.fn(),
  setManager: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@repo/auth/server", () => ({
  auth: state.auth,
  clerkClient: vi.fn(),
  currentUser: vi.fn(),
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
  state.auth.mockResolvedValue({
    orgId: "account-A",
    orgRole: "org:owner",
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
      actingRole: "owner",
      actingUserId: "user-1",
      clerkOrgId: "account-A",
    },
    expect.any(Object)
  );
  expect(state.revalidate).toHaveBeenCalledWith("/people");
});
test.each(["org:manager", "org:viewer"])(
  "%s is rejected before starting a transaction",
  async (orgRole) => {
    state.auth.mockResolvedValue({
      orgId: "account-A",
      orgRole,
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

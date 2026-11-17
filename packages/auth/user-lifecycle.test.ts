import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeAuthUserLifecycle } from "./user-lifecycle";

const mocks = vi.hoisted(() => ({
  assertNoTenantTransaction: vi.fn(),
  authAuditEvent: { findFirst: vi.fn(), findMany: vi.fn() },
  authUser: { findUnique: vi.fn() },
  emitAuthLifecycleEvent: vi.fn(),
  ensureUserAccountsReady: vi.fn(),
  reconcileAccountPeople: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/system", () => ({
  systemDatabase: {
    authAuditEvent: mocks.authAuditEvent,
    authUser: mocks.authUser,
  },
}));
vi.mock("@repo/database/tenant-guard", () => ({
  assertNoTenantTransaction: mocks.assertNoTenantTransaction,
}));
vi.mock("./adapters/better-auth-server", () => ({
  ensureUserAccountsReady: mocks.ensureUserAccountsReady,
}));
vi.mock("./membership-reconciliation", () => ({
  reconcileAccountPeople: mocks.reconcileAccountPeople,
}));
vi.mock("./lifecycle-events", () => ({
  emitAuthLifecycleEvent: mocks.emitAuthLifecycleEvent,
}));
const time = new Date("2026-10-25T05:00:00Z");
const account = {
  id: "account-id",
  logo: null,
  metadata: JSON.stringify({ bootstrapUserId: "user-id" }),
  name: "Account",
};
const user = {
  created_at: time,
  email: "person@example.test",
  email_verified: true,
  id: "user-id",
  image: null,
  memberships: [{ account, account_id: account.id, role: "owner" }],
  name: "Person",
};
const created = {
  account_id: null,
  after_value: null,
  created_at: time,
  event_type: "user.created",
  id: "user-audit",
};
const member = {
  account_id: account.id,
  after_value: { role: "owner" },
  created_at: time,
  event_type: "membership.created",
  id: "member-audit",
};
const accountAudit = {
  account_id: account.id,
  after_value: { name: account.name },
  created_at: time,
  event_type: "account.created",
  id: "account-audit",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authUser.findUnique.mockResolvedValue(user);
  mocks.authAuditEvent.findMany.mockImplementation(({ where }) =>
    Promise.resolve(
      where.event_type === "account.created"
        ? [accountAudit]
        : [created, member]
    )
  );
  mocks.authAuditEvent.findFirst.mockResolvedValue({
    ...created,
    event_type: "user.updated",
    id: "update-audit",
  });
});
describe("post-commit user lifecycle", () => {
  it("provisions and reconciles before emitting durable identity, Account and membership events", async () => {
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(mocks.assertNoTenantTransaction).toHaveBeenCalledWith(
      "completeAuthUserLifecycle"
    );
    expect(mocks.ensureUserAccountsReady).toHaveBeenCalledWith(user.id);
    expect(mocks.reconcileAccountPeople).toHaveBeenCalledWith(
      { email: user.email, emailVerified: true, id: user.id },
      [account.id]
    );
    expect(
      mocks.emitAuthLifecycleEvent.mock.calls.map(([event]) => [
        event.kind,
        event.auditId,
        event.occurredAt,
      ])
    ).toEqual([
      ["account.created", "account-audit", time],
      ["user.created", "user-audit", time],
      ["membership.created", "member-audit", time],
    ]);
    expect(
      mocks.reconcileAccountPeople.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.emitAuthLifecycleEvent.mock.invocationCallOrder[0] ?? 0
    );
  });
  it("retains the same audit IDs and timestamps on retry", async () => {
    await completeAuthUserLifecycle(user.id, "user.created");
    const first = [...mocks.emitAuthLifecycleEvent.mock.calls];
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(mocks.emitAuthLifecycleEvent.mock.calls.slice(3)).toEqual(first);
  });
  it("does not emit or reconcile when the user no longer exists", async () => {
    mocks.authUser.findUnique.mockResolvedValue(null);
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(mocks.reconcileAccountPeople).not.toHaveBeenCalled();
    expect(mocks.authAuditEvent.findMany).not.toHaveBeenCalled();
    expect(mocks.emitAuthLifecycleEvent).not.toHaveBeenCalled();
  });
  it("never attempts Person reconciliation from an unverified email", async () => {
    mocks.authUser.findUnique.mockResolvedValue({
      ...user,
      email_verified: false,
    });
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(mocks.reconcileAccountPeople).not.toHaveBeenCalled();
  });
  it("retries failed provisioning before emitting analytics", async () => {
    mocks.ensureUserAccountsReady.mockRejectedValueOnce(new Error("pending"));
    await expect(
      completeAuthUserLifecycle(user.id, "user.created")
    ).rejects.toThrow("pending");
    expect(mocks.emitAuthLifecycleEvent).not.toHaveBeenCalled();
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(mocks.emitAuthLifecycleEvent).toHaveBeenCalledTimes(3);
  });
  it("does not claim Account creation for an invited owner", async () => {
    mocks.authUser.findUnique.mockResolvedValue({
      ...user,
      memberships: [
        {
          ...user.memberships[0],
          account: {
            ...account,
            metadata: JSON.stringify({ bootstrapUserId: "original-owner" }),
          },
        },
      ],
    });
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(
      mocks.emitAuthLifecycleEvent.mock.calls.map(([event]) => event.kind)
    ).toEqual(["user.created", "membership.created"]);
  });
  it.each([null, "invalid-json", "{}"])(
    "fails closed on missing or malformed bootstrap metadata: %s",
    async (metadata) => {
      mocks.authUser.findUnique.mockResolvedValue({
        ...user,
        memberships: [
          { ...user.memberships[0], account: { ...account, metadata } },
        ],
      });
      await completeAuthUserLifecycle(user.id, "user.created");
      expect(
        mocks.emitAuthLifecycleEvent.mock.calls.some(
          ([event]) => event.kind === "account.created"
        )
      ).toBe(false);
    }
  );
  it("uses the recorded membership role rather than a later promotion", async () => {
    mocks.authAuditEvent.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.event_type === "account.created"
          ? [accountAudit]
          : [created, { ...member, after_value: { role: "viewer" } }]
      )
    );
    await completeAuthUserLifecycle(user.id, "user.created");
    expect(mocks.emitAuthLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "membership.created", role: "viewer" })
    );
  });
  it("uses only the latest committed update audit for profile callbacks", async () => {
    await completeAuthUserLifecycle(user.id, "user.updated");
    expect(mocks.authAuditEvent.findFirst).toHaveBeenCalledWith({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      where: { event_type: "user.updated", target_user_id: user.id },
    });
    expect(mocks.emitAuthLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "update-audit",
        kind: "user.updated",
        occurredAt: time,
        userId: user.id,
      })
    );
    expect(mocks.authAuditEvent.findMany).not.toHaveBeenCalled();
  });
  it("does not invent an update event when no committed audit exists", async () => {
    mocks.authAuditEvent.findFirst.mockResolvedValue(null);
    await completeAuthUserLifecycle(user.id, "user.updated");
    expect(mocks.emitAuthLifecycleEvent).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authAuditEventFindMany: vi.fn(),
  getSession: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("./helpers", () => ({
  getSession: mocks.getSession,
  hasPermission: mocks.hasPermission,
}));

vi.mock("@repo/database/system", () => ({
  systemDatabase: {
    authAuditEvent: {
      findMany: mocks.authAuditEventFindMany,
    },
  },
}));

vi.mock("@repo/database/tenant-guard", () => ({
  assertNoTenantTransaction: vi.fn(),
}));

import { listAccountAuthAuditEvents } from "./account-audit";

describe("account-audit service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails with unauthorised error when session is missing or has no account", async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await listAccountAuthAuditEvents();

    expect(result).toEqual({
      error: {
        code: "unauthorised",
        message: "Not authenticated or no account selected",
      },
      ok: false,
    });
    expect(mocks.authAuditEventFindMany).not.toHaveBeenCalled();
  });

  it("fails with forbidden error when caller lacks audit:read permission", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "acc_1",
      role: "viewer",
      sessionId: "sess_1",
      userId: "user_1",
    });
    mocks.hasPermission.mockResolvedValue(false);

    const result = await listAccountAuthAuditEvents();

    expect(result).toEqual({
      error: {
        code: "forbidden",
        message: "Permission denied",
      },
      ok: false,
    });
    expect(mocks.hasPermission).toHaveBeenCalledWith({ audit: ["read"] });
    expect(mocks.authAuditEventFindMany).not.toHaveBeenCalled();
  });

  it("queries systemDatabase scoped to session account and returns sanitized events", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "acc_1",
      role: "owner",
      sessionId: "sess_1",
      userId: "user_1",
    });
    mocks.hasPermission.mockResolvedValue(true);

    const createdAt = new Date("2026-10-30T10:00:00.000Z");
    mocks.authAuditEventFindMany.mockResolvedValue([
      {
        account_id: "acc_1",
        actor_user_id: "user_1",
        after_value: {
          name: "Updated Name",
          passwordHash: "secret-hash",
          role: "admin",
          sessionToken: "token-123",
          verified: true,
        },
        before_value: {
          name: "Old Name",
          role: "member",
        },
        created_at: createdAt,
        event_type: "membership.role_changed",
        id: "evt_1",
        request_id: "req_abc",
        target_user_id: "user_2",
      },
    ]);

    const result = await listAccountAuthAuditEvents({ limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(mocks.authAuditEventFindMany).toHaveBeenCalledWith({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 11,
      where: { account_id: "acc_1" },
    });

    expect(result.value.events).toEqual([
      {
        accountId: "acc_1",
        actorUserId: "user_1",
        after: {
          name: "Updated Name",
          role: "admin",
          verified: "true",
        },
        before: {
          name: "Old Name",
          role: "member",
        },
        createdAt: "2026-10-30T10:00:00.000Z",
        eventType: "membership.role_changed",
        id: "evt_1",
        requestId: "req_abc",
        targetUserId: "user_2",
      },
    ]);
    expect(result.value.nextCursor).toBeNull();
  });

  it("handles pagination and generates cursor when more records exist", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "acc_1",
      role: "admin",
      sessionId: "sess_1",
      userId: "user_1",
    });
    mocks.hasPermission.mockResolvedValue(true);

    const d1 = new Date("2026-10-30T10:00:00.000Z");
    const d2 = new Date("2026-10-30T09:00:00.000Z");

    mocks.authAuditEventFindMany.mockResolvedValue([
      {
        account_id: "acc_1",
        actor_user_id: null,
        after_value: null,
        before_value: null,
        created_at: d1,
        event_type: "invitation.created",
        id: "evt_1",
        request_id: null,
        target_user_id: null,
      },
      {
        account_id: "acc_1",
        actor_user_id: null,
        after_value: null,
        before_value: null,
        created_at: d2,
        event_type: "account.created",
        id: "evt_2",
        request_id: null,
        target_user_id: null,
      },
    ]);

    const result = await listAccountAuthAuditEvents({ limit: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0]?.id).toBe("evt_1");
    expect(result.value.nextCursor).not.toBeNull();

    // Query with cursor
    const cursor = result.value.nextCursor;
    if (!cursor) {
      throw new Error("Missing cursor");
    }

    mocks.authAuditEventFindMany.mockResolvedValue([
      {
        account_id: "acc_1",
        actor_user_id: null,
        after_value: null,
        before_value: null,
        created_at: d2,
        event_type: "account.created",
        id: "evt_2",
        request_id: null,
        target_user_id: null,
      },
    ]);

    const nextResult = await listAccountAuthAuditEvents({ cursor, limit: 1 });

    expect(nextResult.ok).toBe(true);
    if (!nextResult.ok) {
      return;
    }

    expect(mocks.authAuditEventFindMany).toHaveBeenLastCalledWith({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 2,
      where: {
        account_id: "acc_1",
        OR: [
          { created_at: { lt: d1 } },
          { created_at: d1, id: { lt: "evt_1" } },
        ],
      },
    });
    expect(nextResult.value.events).toHaveLength(1);
    expect(nextResult.value.events[0]?.id).toBe("evt_2");
    expect(nextResult.value.nextCursor).toBeNull();
  });
});

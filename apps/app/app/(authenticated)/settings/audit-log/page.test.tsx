import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLogClient: vi.fn(),
  getAuditEventDetail: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  listAccountAuthAuditEvents: vi.fn(),
  listAuditLogEvents: vi.fn(),
  requireAccount: vi.fn(),
  requirePagePermission: vi.fn(),
  resolveAccountCompanies: vi.fn(),
  withTenantDb: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  requireAccount: mocks.requireAccount,
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
  listAccountAuthAuditEvents: mocks.listAccountAuthAuditEvents,
}));

vi.mock("@repo/availability", () => ({
  getAuditEventDetail: mocks.getAuditEventDetail,
  listAuditLogEvents: mocks.listAuditLogEvents,
}));

vi.mock("@repo/database", () => ({
  withTenantDb: mocks.withTenantDb,
}));

vi.mock("@repo/database/queries/account-companies", () => ({
  resolveAccountCompanies: mocks.resolveAccountCompanies,
}));

vi.mock("@/lib/auth/require-page-permission", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));

vi.mock("./audit-log-client", () => ({
  AuditLogClient: (props: unknown) => {
    mocks.auditLogClient(props);
    return null;
  },
}));

import AuditLogPage from "./page";

describe("AuditLogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccount.mockResolvedValue("acc_123");
    mocks.getSession.mockResolvedValue({
      accountId: "acc_123",
      role: "owner",
      sessionId: "sess_1",
      userId: "user_1",
    });
    mocks.getCurrentUser.mockResolvedValue({ id: "user_1" });
    mocks.requirePagePermission.mockResolvedValue(undefined);
    mocks.withTenantDb.mockImplementation((_accountId, callback) =>
      callback({
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
      })
    );
  });

  it("requires audit:read page permission", async () => {
    mocks.resolveAccountCompanies.mockResolvedValue([]);
    mocks.listAccountAuthAuditEvents.mockResolvedValue({
      ok: true,
      value: { events: [], nextCursor: null },
    });

    await AuditLogPage({ searchParams: Promise.resolve({}) });

    expect(mocks.requirePagePermission).toHaveBeenCalledWith({
      audit: ["read"],
    });
  });

  it("combines auth and domain audit events and discriminates source", async () => {
    const domainDate = new Date("2026-10-30T10:00:00.000Z");
    const authDate = new Date("2026-10-30T11:00:00.000Z");

    mocks.resolveAccountCompanies.mockResolvedValue([
      {
        country_code: "AU",
        id: "00000000-0000-4000-8000-000000000001",
        name: "Acme",
      },
    ]);

    mocks.listAuditLogEvents.mockResolvedValue({
      ok: true,
      value: {
        events: [
          {
            action: "leave.approved",
            actorDisplay: "Manager Bob",
            actorUserId: "user_bob",
            createdAt: domainDate,
            entityId: "leave_1",
            entityType: "leave",
            hasBeforeAfter: true,
            id: "domain_evt_1",
            ipAddress: null,
            metadata: { notes: "approved" },
            userAgent: null,
          },
        ],
        nextCursor: "domain_cursor_1",
      },
    });

    mocks.getAuditEventDetail.mockResolvedValue({
      ok: true,
      value: {
        afterValue: { status: "approved" },
        beforeValue: { status: "pending" },
        id: "domain_evt_1",
      },
    });

    mocks.listAccountAuthAuditEvents.mockResolvedValue({
      ok: true,
      value: {
        events: [
          {
            accountId: "acc_123",
            actorUserId: "user_1",
            after: { role: "admin" },
            before: { role: "member" },
            createdAt: authDate.toISOString(),
            eventType: "membership.role_changed",
            id: "auth_evt_1",
            requestId: "req_999",
            targetUserId: "user_target",
          },
        ],
        nextCursor: "auth_cursor_1",
      },
    });

    const result = await AuditLogPage({ searchParams: Promise.resolve({}) });

    expect(result.props).toEqual(
      expect.objectContaining({
        details: {
          auth_evt_1: {
            afterValue: { role: "admin" },
            beforeValue: { role: "member" },
            id: "auth_evt_1",
            source: "auth",
          },
          domain_evt_1: {
            afterValue: { status: "approved" },
            beforeValue: { status: "pending" },
            id: "domain_evt_1",
            source: "domain",
          },
        },
        events: [
          expect.objectContaining({
            action: "membership.role_changed",
            id: "auth_evt_1",
            metadata: { requestId: "req_999" },
            source: "auth",
          }),
          expect.objectContaining({
            action: "leave.approved",
            id: "domain_evt_1",
            metadata: { notes: "approved" },
            source: "domain",
          }),
        ],
        nextCursor: expect.any(String),
        organisationId: "00000000-0000-4000-8000-000000000001",
      })
    );
  });

  it("renders auth audit events even when no payroll organisation exists", async () => {
    mocks.resolveAccountCompanies.mockResolvedValue([]);
    mocks.listAccountAuthAuditEvents.mockResolvedValue({
      ok: true,
      value: {
        events: [
          {
            accountId: "acc_123",
            actorUserId: "user_1",
            after: { name: "New Account" },
            before: null,
            createdAt: "2026-10-30T09:00:00.000Z",
            eventType: "account.created",
            id: "auth_evt_2",
            requestId: null,
            targetUserId: null,
          },
        ],
        nextCursor: null,
      },
    });

    const result = await AuditLogPage({ searchParams: Promise.resolve({}) });

    expect(mocks.listAuditLogEvents).not.toHaveBeenCalled();
    expect(result.props).toEqual(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            action: "account.created",
            id: "auth_evt_2",
            source: "auth",
          }),
        ],
        organisationId: null,
      })
    );
  });
});

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getApprovalSummaryCounts: vi.fn(),
  getSession: vi.fn(),
  listForApprover: vi.fn(),
  resolveAccountCompanies: vi.fn(),
  resolveApprovalActingPerson: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.currentUser,
  getSession: mocks.getSession,
  hasPermission: vi.fn(() => true),
}));
vi.mock("@repo/availability", () => ({
  getApprovalSummaryCounts: mocks.getApprovalSummaryCounts,
  listForApprover: mocks.listForApprover,
}));
vi.mock("@repo/database", () => ({
  resolveAccountCompanies: mocks.resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS: {},
  withTenantDb: async (
    _account: string,
    fn: (db: unknown) => Promise<unknown>
  ) => fn({}),
}));
vi.mock("./acting-person", () => ({
  resolveApprovalActingPerson: mocks.resolveApprovalActingPerson,
}));
vi.mock("../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));
vi.mock("@/components/states/permission-denied-state", () => ({
  PermissionDeniedState: () => <div data-testid="permission-denied" />,
}));
vi.mock("@/components/states/fetch-error-state", () => ({
  FetchErrorState: () => <div data-testid="fetch-error" />,
}));
vi.mock("./leave-approvals-client", () => ({
  LeaveApprovalsClient: (props: {
    canDispatchReconciliation: boolean;
    items: unknown[];
  }) => (
    <div
      data-can-reconcile={String(props.canDispatchReconciliation)}
      data-testid="leave-approvals-client"
    />
  ),
}));

const { default: LeaveApprovalsPage } = await import("./page");

describe("LeaveApprovalsPage role scoping", () => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000002";
  const personId = "00000000-0000-4000-8000-000000000003";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      accountId,
      role: "admin",
      sessionId: "session-1",
      userId,
    });
    mocks.currentUser.mockResolvedValue({
      email: "user@example.com",
      id: userId,
      name: "Test User",
    });
    mocks.resolveAccountCompanies.mockResolvedValue([
      { id: "company-1", name: "Company 1" },
    ]);
    mocks.resolveApprovalActingPerson.mockResolvedValue({ id: personId });
    mocks.listForApprover.mockResolvedValue({
      ok: true,
      value: { items: [], nextCursor: null },
    });
    mocks.getApprovalSummaryCounts.mockResolvedValue({
      ok: true,
      value: {
        approvedThisMonth: 0,
        declinedThisMonth: 0,
        failedSync: 0,
        pending: 0,
      },
    });
  });

  it("denies access to a viewer role", async () => {
    mocks.getSession.mockResolvedValue({
      accountId,
      role: "viewer",
      sessionId: "session-1",
      userId,
    });

    const element = await LeaveApprovalsPage({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByTestId("permission-denied")).toBeDefined();
    expect(mocks.listForApprover).not.toHaveBeenCalled();
  });

  it("passes manager role to service and disables reconciliation", async () => {
    mocks.getSession.mockResolvedValue({
      accountId,
      role: "manager",
      sessionId: "session-1",
      userId,
    });

    const element = await LeaveApprovalsPage({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByTestId("leave-approvals-client")).toBeDefined();
    expect(
      screen
        .getByTestId("leave-approvals-client")
        .getAttribute("data-can-reconcile")
    ).toBe("false");

    expect(mocks.listForApprover).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        actingPersonId: personId,
        actingUserId: userId,
        role: "manager",
      }),
      expect.anything()
    );
    expect(mocks.getApprovalSummaryCounts).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        actingPersonId: personId,
        actingUserId: userId,
        role: "manager",
      }),
      expect.anything()
    );
  });

  it("denies a manager without a linked Person profile", async () => {
    mocks.getSession.mockResolvedValue({
      accountId,
      role: "manager",
      sessionId: "session-1",
      userId,
    });
    mocks.resolveApprovalActingPerson.mockResolvedValue(null);

    const element = await LeaveApprovalsPage({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByTestId("permission-denied")).toBeDefined();
    expect(mocks.listForApprover).not.toHaveBeenCalled();
    expect(mocks.getApprovalSummaryCounts).not.toHaveBeenCalled();
  });

  it("allows admin without a linked Person and enables reconciliation", async () => {
    mocks.getSession.mockResolvedValue({
      accountId,
      role: "admin",
      sessionId: "session-1",
      userId,
    });
    mocks.resolveApprovalActingPerson.mockResolvedValue(null);

    const element = await LeaveApprovalsPage({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByTestId("leave-approvals-client")).toBeDefined();
    expect(
      screen
        .getByTestId("leave-approvals-client")
        .getAttribute("data-can-reconcile")
    ).toBe("true");

    expect(mocks.listForApprover).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        actingPersonId: null,
        actingUserId: userId,
        role: "admin",
      }),
      expect.anything()
    );
  });

  it("allows owner without a linked Person and enables reconciliation", async () => {
    mocks.getSession.mockResolvedValue({
      accountId,
      role: "owner",
      sessionId: "session-1",
      userId,
    });
    mocks.resolveApprovalActingPerson.mockResolvedValue(null);

    const element = await LeaveApprovalsPage({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByTestId("leave-approvals-client")).toBeDefined();
    expect(
      screen
        .getByTestId("leave-approvals-client")
        .getAttribute("data-can-reconcile")
    ).toBe("true");

    expect(mocks.listForApprover).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        actingPersonId: null,
        actingUserId: userId,
        role: "owner",
      }),
      expect.anything()
    );
  });
});

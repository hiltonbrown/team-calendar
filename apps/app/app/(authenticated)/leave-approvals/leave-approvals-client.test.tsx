import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApprovalStatusBadge,
  LeaveApprovalsClient,
} from "./leave-approvals-client";

const mocks = vi.hoisted(() => ({
  dispatchXeroLeaveSyncAction: vi.fn(),
  refresh: vi.fn(),
  retryApprovalAction: vi.fn(),
  retryDeclineAction: vi.fn(),
  revertApprovalAttemptAction: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/leave-approvals",
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@repo/design-system/components/ui/sonner", () => ({
  toast: {
    error: mocks.toastError,
    message: mocks.toastMessage,
    success: mocks.toastSuccess,
  },
}));

vi.mock("./_actions", () => ({
  approveAction: vi.fn(),
  declineAction: vi.fn(),
  dispatchXeroLeaveSyncAction: mocks.dispatchXeroLeaveSyncAction,
  requestMoreInfoAction: vi.fn(),
  retryApprovalAction: mocks.retryApprovalAction,
  retryDeclineAction: mocks.retryDeclineAction,
  revertApprovalAttemptAction: mocks.revertApprovalAttemptAction,
}));

const organisationId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000099";
const APPROVAL_ROW_NAME = /Ari Report.*Annual Leave/i;

describe("LeaveApprovalsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dispatchXeroLeaveSyncAction.mockResolvedValue({
      ok: true,
      value: { queued: true },
    });
  });

  afterEach(() => cleanup());

  it("keeps child keyboard input isolated and exposes a named disclosure", async () => {
    renderClient();

    const disclosure = screen.getByRole("button", {
      name: "Expand details for Ari Report",
    });
    const row = screen.getByRole("row", {
      name: APPROVAL_ROW_NAME,
    });

    fireEvent.keyDown(disclosure, { key: "a" });
    expect(
      screen.queryByRole("dialog", { name: "Approve this leave?" })
    ).toBeNull();

    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(disclosure.getAttribute("aria-controls")).toBe(
      `approval-details-${recordId}`
    );
    expect(
      document.getElementById(`approval-details-${recordId}`)
    ).not.toBeNull();

    fireEvent.keyDown(row, { key: "a" });
    expect(
      await screen.findByRole("dialog", { name: "Approve this leave?" })
    ).toBeDefined();
  });

  it("enables inbound Xero leave sync for authorised users and confirms dispatch", async () => {
    renderClient();

    const sync = screen.getByRole("button", {
      name: "Sync Xero leave",
    });
    expect((sync as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(sync);

    await waitFor(() => {
      expect(mocks.dispatchXeroLeaveSyncAction).toHaveBeenCalledWith({
        organisationId,
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Xero leave sync queued");
    });
  });

  it("renders balance labels appropriately for days, hours, and currency", () => {
    const { rerender } = renderClient();
    expect(
      screen.getAllByText("8 days remaining after approval").length
    ).toBeGreaterThan(0);

    rerender(
      <LeaveApprovalsClient
        canDispatchReconciliation={true}
        filters={{ includeFailed: false }}
        items={[
          {
            approvalNote: null,
            approvalStatus: "submitted",
            approvedAt: null,
            availableActions: ["approve", "decline", "request_more_info"],
            balanceSnapshot: {
              balanceAvailable: 40,
              balanceRemainingAfterApproval: null,
              currencyCode: null,
              leaveBalanceUpdatedAt: "2026-04-14T00:00:00.000Z",
              unit: "hours",
            },
            durationWorkingDays: 2,
            endsAt: "2026-04-16T23:59:59.999Z",
            failedAction: null,
            id: recordId,
            mutedActionNote: null,
            notesInternal: "Coverage arranged.",
            organisationId,
            person: {
              email: "ari@example.com",
              firstName: "Ari",
              id: "00000000-0000-4000-8000-000000000011",
              lastName: "Report",
              teamName: "Operations",
            },
            recordType: "annual_leave",
            startsAt: "2026-04-15T00:00:00.000Z",
            submittedAt: "2026-04-10T00:00:00.000Z",
            xeroWriteError: null,
          },
        ]}
        nextCursor={null}
        organisationId={organisationId}
        summary={{
          approvedThisMonth: 2,
          declinedThisMonth: 1,
          failedSync: 0,
          pending: 1,
        }}
      />
    );
    expect(screen.getAllByText("40 hours available").length).toBeGreaterThan(0);

    rerender(
      <LeaveApprovalsClient
        canDispatchReconciliation={true}
        filters={{ includeFailed: false }}
        items={[
          {
            approvalNote: null,
            approvalStatus: "submitted",
            approvedAt: null,
            availableActions: ["approve", "decline", "request_more_info"],
            balanceSnapshot: {
              balanceAvailable: 1500,
              balanceRemainingAfterApproval: null,
              currencyCode: "NZD",
              leaveBalanceUpdatedAt: "2026-04-14T00:00:00.000Z",
              unit: "currency",
            },
            durationWorkingDays: 2,
            endsAt: "2026-04-16T23:59:59.999Z",
            failedAction: null,
            id: recordId,
            mutedActionNote: null,
            notesInternal: "Coverage arranged.",
            organisationId,
            person: {
              email: "ari@example.com",
              firstName: "Ari",
              id: "00000000-0000-4000-8000-000000000011",
              lastName: "Report",
              teamName: "Operations",
            },
            recordType: "annual_leave",
            startsAt: "2026-04-15T00:00:00.000Z",
            submittedAt: "2026-04-10T00:00:00.000Z",
            xeroWriteError: null,
          },
        ]}
        nextCursor={null}
        organisationId={organisationId}
        summary={{
          approvedThisMonth: 2,
          declinedThisMonth: 1,
          failedSync: 0,
          pending: 1,
        }}
      />
    );
    expect(screen.getAllByText("$1,500.00 available").length).toBeGreaterThan(
      0
    );
  });

  it.each([
    ["submitted", "Pending approval"],
    ["approved", "Approved"],
    ["declined", "Declined"],
    ["withdrawn", "Withdrawn"],
    ["xero_sync_failed", "Xero sync failed"],
  ])("gives %s a labelled icon treatment", (status, label) => {
    render(<ApprovalStatusBadge status={status} />);

    const badge = screen.getByText(label);
    expect(badge.getAttribute("data-status")).toBe(status);
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("keeps the complete mobile decision path in one wrapping row", () => {
    renderClient();

    const queue = screen.getByRole("table", { name: "Leave approval queue" });
    const row = screen.getByRole("row", { name: APPROVAL_ROW_NAME });
    expect(queue.className).toContain("block");
    expect(row.className).toContain("grid");
    expect(row.className).not.toContain("overflow-x");
    expect(screen.getByRole("button", { name: "Approve" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Decline" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "More actions for Ari Report" })
    ).toBeDefined();
  });
});

function renderClient() {
  return render(
    <LeaveApprovalsClient
      canDispatchReconciliation={true}
      filters={{ includeFailed: false }}
      items={[
        {
          approvalNote: null,
          approvalStatus: "submitted",
          approvedAt: null,
          availableActions: ["approve", "decline", "request_more_info"],
          balanceSnapshot: {
            balanceAvailable: 10,
            balanceRemainingAfterApproval: 8,
            leaveBalanceUpdatedAt: "2026-04-14T00:00:00.000Z",
            unit: "days",
          },
          durationWorkingDays: 2,
          endsAt: "2026-04-16T23:59:59.999Z",
          failedAction: null,
          id: recordId,
          mutedActionNote: null,
          notesInternal: "Coverage arranged.",
          organisationId,
          person: {
            email: "ari@example.com",
            firstName: "Ari",
            id: "00000000-0000-4000-8000-000000000011",
            lastName: "Report",
            teamName: "Operations",
          },
          recordType: "annual_leave",
          startsAt: "2026-04-15T00:00:00.000Z",
          submittedAt: "2026-04-10T00:00:00.000Z",
          xeroWriteError: null,
        },
      ]}
      nextCursor={null}
      organisationId={organisationId}
      summary={{
        approvedThisMonth: 2,
        declinedThisMonth: 1,
        failedSync: 0,
        pending: 1,
      }}
    />
  );
}

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApproveConfirmationModal } from "./approve-confirmation-modal";
import { DeclineModal } from "./decline-modal";

const mocks = vi.hoisted(() => ({
  approveAction: vi.fn(),
  declineAction: vi.fn(),
  retryApprovalAction: vi.fn(),
  retryDeclineAction: vi.fn(),
  revertApprovalAttemptAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/(authenticated)/leave-approvals/_actions", () => ({
  approveAction: mocks.approveAction,
  declineAction: mocks.declineAction,
  retryApprovalAction: mocks.retryApprovalAction,
  retryDeclineAction: mocks.retryDeclineAction,
  revertApprovalAttemptAction: mocks.revertApprovalAttemptAction,
}));

vi.mock("@repo/design-system/components/ui/sonner", () => ({
  toast: { success: mocks.toastSuccess },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

const record = {
  balanceRemainingAfterApproval: 8,
  durationWorkingDays: 2,
  employeeName: "Ari Report",
  endsAt: "2026-04-16T23:59:59.999Z",
  id: "00000000-0000-4000-8000-000000000099",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordType: "annual_leave",
  startsAt: "2026-04-15T00:00:00.000Z",
};

describe("approval modals", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("locks dismissal during approval and shows a success receipt", async () => {
    let resolveApproval: ((value: unknown) => void) | undefined;
    mocks.approveAction.mockReturnValue(
      new Promise((resolve) => {
        resolveApproval = resolve;
      })
    );
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <ApproveConfirmationModal
        onClose={onClose}
        onSuccess={onSuccess}
        record={record}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and approve" })
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
      expect(
        screen
          .getByRole("dialog", { name: "Approve this leave?" })
          .getAttribute("aria-busy")
      ).toBe("true");
    });
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    resolveApproval?.({
      ok: true,
      value: {
        approvalStatus: "approved",
        id: record.id,
        xeroWriteError: null,
      },
    });

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Leave approved in Xero");
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a success receipt after declining", async () => {
    mocks.declineAction.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "declined",
        id: record.id,
        xeroWriteError: null,
      },
    });
    const onSuccess = vi.fn();

    render(
      <DeclineModal onClose={vi.fn()} onSuccess={onSuccess} record={record} />
    );

    expect(
      screen.getByText("The reason will be visible to the employee.")
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Coverage is not available." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));

    await waitFor(() => {
      expect(mocks.declineAction).toHaveBeenCalledWith({
        organisationId: record.organisationId,
        reason: "Coverage is not available.",
        recordId: record.id,
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Leave declined");
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("renders remaining balance for days and available balance for hours/currency", () => {
    const { rerender } = render(
      <ApproveConfirmationModal
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        record={record}
      />
    );

    expect(screen.getByText("8 days remaining after approval")).toBeDefined();

    rerender(
      <ApproveConfirmationModal
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        record={{
          ...record,
          balanceAvailable: 40,
          balanceRemainingAfterApproval: null,
          balanceUnit: "hours",
        }}
      />
    );
    expect(screen.getByText("40 hours available")).toBeDefined();

    rerender(
      <ApproveConfirmationModal
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        record={{
          ...record,
          balanceAvailable: 1500,
          balanceCurrencyCode: "NZD",
          balanceRemainingAfterApproval: null,
          balanceUnit: "currency",
        }}
      />
    );
    expect(screen.getByText("$1,500.00 available")).toBeDefined();

    rerender(
      <ApproveConfirmationModal
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        record={{
          ...record,
          balanceAvailable: null,
          balanceRemainingAfterApproval: null,
        }}
      />
    );
    expect(screen.getByText("Balance unavailable")).toBeDefined();
  });
});

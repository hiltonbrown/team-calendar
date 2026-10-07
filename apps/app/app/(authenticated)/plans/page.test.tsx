import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveRecordAction,
  listSubmitRecoveryCandidatesAction,
} from "./_actions";
import PlansError from "./error";
import { PlansClient } from "./plans-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));
vi.mock("@repo/design-system/components/ui/sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));
vi.mock("@/components/plans/submit-confirmation-modal", () => ({
  SubmitConfirmationModal: () => null,
}));
vi.mock("./_actions", () => ({
  archiveRecordAction: vi.fn(),
  deleteDraftAction: vi.fn(),
  listSubmitRecoveryCandidatesAction: vi.fn(),
  restoreRecordAction: vi.fn(),
  retrySubmissionAction: vi.fn(),
  revertToDraftAction: vi.fn(),
  submitForApprovalAction: vi.fn(),
  withdrawSubmissionAction: vi.fn(),
}));
const baseFilters = {
  includeArchived: false,
  recordTypeCategory: "all" as const,
  tab: "my" as const,
};
function planRecord(
  overrides: Partial<Parameters<typeof PlansClient>[0]["records"][number]>
): Parameters<typeof PlansClient>[0]["records"][number] {
  return {
    allDay: true,
    approvalStatus: "draft",
    archivedAt: null,
    balanceChip: null,
    editableActions: ["edit"],
    endsAt: "2026-05-05T23:59:59.999Z",
    failedAction: null,
    id: "00000000-0000-4000-8000-000000000099",
    personName: "Test Person",
    recordType: "annual_leave",
    sourceType: "team_calendar_leave",
    startsAt: "2026-05-04T00:00:00.000Z",
    workingDays: 2,
    workingDaysError: null,
    xeroWriteError: null,
    ...overrides,
  };
}
describe("Plans page client surface", () => {
  afterEach(() => cleanup());
  it.each([true, false])(
    "gates imported recovery controls by administrator access %s",
    async (canRecoverSubmit) => {
      vi.mocked(listSubmitRecoveryCandidatesAction).mockResolvedValue({
        ok: true,
        value: { candidates: [], complete: true },
      });
      render(
        <PlansClient
          canRecoverSubmit={canRecoverSubmit}
          canViewTeam
          filters={{ ...baseFilters, sourceType: ["xero_leave"], tab: "team" }}
          organisationId="00000000-0000-4000-8000-000000000001"
          orgQueryValue={null}
          records={[
            planRecord({
              approvalStatus: "submitted",
              editableActions: ["view"],
              sourceType: "xero_leave",
              submissionResolutionPending: true,
            }),
          ]}
          xeroConnectionState="connected"
        />
      );
      expect(screen.queryByText("Resolve Xero leave action") !== null).toBe(
        canRecoverSubmit
      );
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
      if (canRecoverSubmit) {
        fireEvent.change(screen.getByLabelText("Recovery reason"), {
          target: { value: "Verify the imported approval outcome." },
        });
        fireEvent.click(
          screen.getByRole("button", { name: "Check Xero candidates" })
        );
        await waitFor(() =>
          expect(listSubmitRecoveryCandidatesAction).toHaveBeenCalledWith({
            organisationId: "00000000-0000-4000-8000-000000000001",
            recordId: "00000000-0000-4000-8000-000000000099",
          })
        );
      }
    }
  );
  it("shows a persisted withdrawal refusal while the leave remains approved", () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({
            approvalStatus: "approved",
            editableActions: ["withdraw"],
            failedAction: "withdraw",
            xeroWriteError:
              "Xero cannot withdraw leave already included in a pay run.",
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Xero cannot withdraw leave already included in a pay run."
    );
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Retry failed action" })
    ).toBeNull();
  });
  it("does not expose the team tab to viewers", () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[]}
        xeroConnectionState="not_connected"
      />
    );
    expect(screen.getByText("My records")).toBeDefined();
    expect(screen.queryByText("Team records")).toBeNull();
  });
  it("renders balance chips for leave rows only", () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({
            balanceChip: {
              balanceAvailable: 10,
              balanceUnavailableReason: "not_synced",
              leaveBalanceUpdatedAt: null,
            },
          }),
          planRecord({
            approvalStatus: "approved",
            endsAt: "2026-05-06T23:59:59.999Z",
            id: "00000000-0000-4000-8000-000000000100",
            recordType: "wfh",
            sourceType: "manual",
            startsAt: "2026-05-06T00:00:00.000Z",
            workingDays: 1,
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    expect(screen.getByText("8 days left if approved")).toBeDefined();
  });
  it("separates record category from Xero or manual provenance", () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({ sourceType: "team_calendar_leave" }),
          planRecord({
            id: "00000000-0000-4000-8000-000000000100",
            recordType: "wfh",
            sourceType: "manual",
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    const rows = screen.getAllByRole("row");
    expect(
      rows.some((row) => row.textContent?.includes("Annual leaveLeaveXero"))
    ).toBe(true);
    expect(
      rows.some((row) =>
        row.textContent?.includes("Working from homeAvailabilityManual")
      )
    ).toBe(true);
  });
  it("renders submit and withdraw failures with action-specific copy", () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({
            approvalStatus: "xero_sync_failed",
            failedAction: "submit",
            id: "00000000-0000-4000-8000-000000000101",
            xeroWriteError: "Timed out.",
          }),
          planRecord({
            approvalStatus: "xero_sync_failed",
            failedAction: "withdraw",
            id: "00000000-0000-4000-8000-000000000102",
            xeroWriteError: "Connection failed.",
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    expect(screen.getByText("Submission failed")).toBeDefined();
    expect(screen.getByText("Withdrawal failed")).toBeDefined();
    expect(
      screen.getByText("Submission failed in Xero: Timed out.")
    ).toBeDefined();
    expect(
      screen.getByText("Withdrawal failed in Xero: Connection failed.")
    ).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: "Retry submission" })
    ).toHaveLength(1);
  });
  it.each(["approve", "decline"] as const)(
    "keeps %s failures out of employee retry and edit controls",
    (failedAction) => {
      render(
        <PlansClient
          canViewTeam={false}
          filters={baseFilters}
          organisationId="00000000-0000-4000-8000-000000000001"
          orgQueryValue={null}
          records={[
            planRecord({
              approvalStatus: "xero_sync_failed",
              editableActions: ["view"],
              failedAction,
              xeroWriteError: "The manager action needs attention.",
            }),
          ]}
          xeroConnectionState="connected"
        />
      );
      expect(
        screen.queryByRole("button", { name: "Retry submission" })
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Revert to draft" })
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
      expect(
        screen.getByText("The manager action needs attention.", {
          exact: false,
        })
      ).toBeDefined();
    }
  );
  it("clears filters while preserving the selected tab and organisation", () => {
    render(
      <PlansClient
        canViewTeam
        filters={{
          ...baseFilters,
          approvalStatus: ["submitted"],
          sourceType: ["manual"],
          tab: "team",
        }}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue="org_123"
        records={[]}
        xeroConnectionState="connected"
      />
    );
    const clear = screen.getByRole("link", { name: "Clear filters" });
    expect(clear.getAttribute("href")).toContain("tab=team");
    expect(clear.getAttribute("href")).toContain("org=org_123");
    expect(screen.getByText("2 filters active")).toBeDefined();
  });
  it("renders status vocabulary and current-view counts", () => {
    render(
      <PlansClient
        canViewTeam={true}
        filters={{ ...baseFilters, tab: "team" }}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({
            approvalStatus: "submitted",
            id: "00000000-0000-4000-8000-000000000101",
          }),
          planRecord({
            approvalStatus: "xero_sync_failed",
            id: "00000000-0000-4000-8000-000000000102",
          }),
          planRecord({
            approvalStatus: "declined",
            id: "00000000-0000-4000-8000-000000000103",
          }),
          planRecord({
            approvalStatus: "approved",
            id: "00000000-0000-4000-8000-000000000104",
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Xero sync failed").length).toBeGreaterThan(1);
    expect(screen.getByText("Failed or declined")).toBeDefined();
    expect(
      screen.getAllByText("This leave request was declined").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("This leave action needs attention").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });
  it("promotes one row action and moves the rest into the overflow menu", async () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({
            editableActions: ["view", "edit", "submit_for_approval", "archive"],
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    expect(
      screen.getByRole("button", { name: "Submit for approval" })
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
    const moreActions = screen.getByRole("button", {
      name: "More actions for Annual leave",
    });
    fireEvent.pointerDown(moreActions, { button: 0, ctrlKey: false });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDefined();
      expect(screen.getByRole("menuitem", { name: "Archive" })).toBeDefined();
    });
  });
  it("shows pending feedback only on the record being updated", async () => {
    let finishAction: (() => void) | undefined;
    vi.mocked(archiveRecordAction).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishAction = resolve;
      });
      return { ok: true, value: undefined };
    });
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({ editableActions: ["archive"] }),
          planRecord({
            editableActions: ["edit"],
            id: "00000000-0000-4000-8000-000000000100",
            recordType: "wfh",
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(screen.getByText("Updating this plan…")).toBeDefined();
      expect(screen.getByRole("link", { name: "Edit" })).toBeDefined();
    });
    finishAction?.();
    await waitFor(() => {
      expect(screen.queryByText("Updating this plan…")).toBeNull();
    });
  });
  it("uses an accessible alert dialog for revert confirmation", async () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          planRecord({
            approvalStatus: "xero_sync_failed",
            editableActions: ["revert_to_draft"],
            xeroWriteError: "Could not reach Xero.",
          }),
        ]}
        xeroConnectionState="connected"
      />
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Revert to draft" })[0]
    );
    expect(
      screen.getByRole("alertdialog", { name: "Revert to draft?" })
    ).toBeDefined();
    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain(
        "Keep failed state"
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep failed state" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("alertdialog", { name: "Revert to draft?" })
      ).toBeNull();
    });
  });
});
describe("Plans route states", () => {
  afterEach(() => cleanup());
  it("offers a retry from the route error boundary", () => {
    const reset = vi.fn();
    render(<PlansError reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

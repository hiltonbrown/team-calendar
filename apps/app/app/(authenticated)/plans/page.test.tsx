import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("Plans page client surface", () => {
  afterEach(() => cleanup());

  it("does not expose the team tab to viewers", () => {
    render(
      <PlansClient
        canViewTeam={false}
        filters={baseFilters}
        hasActiveXeroConnection={false}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[]}
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
        hasActiveXeroConnection={true}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
        records={[
          {
            allDay: true,
            approvalStatus: "draft",
            archivedAt: null,
            balanceChip: {
              balanceAvailable: 10,
              balanceUnavailableReason: "not_synced",
              leaveBalanceUpdatedAt: null,
            },
            editableActions: ["edit"],
            endsAt: "2026-05-05T23:59:59.999Z",
            id: "00000000-0000-4000-8000-000000000099",
            personName: "Test Person",
            recordType: "annual_leave",
            sourceType: "team_calendar_leave",
            startsAt: "2026-05-04T00:00:00.000Z",
            workingDays: 2,
            workingDaysError: null,
            xeroWriteError: null,
          },
          {
            allDay: true,
            approvalStatus: "approved",
            archivedAt: null,
            balanceChip: null,
            editableActions: ["edit"],
            endsAt: "2026-05-06T23:59:59.999Z",
            id: "00000000-0000-4000-8000-000000000100",
            personName: "Test Person",
            recordType: "wfh",
            sourceType: "manual",
            startsAt: "2026-05-06T00:00:00.000Z",
            workingDays: 1,
            workingDaysError: null,
            xeroWriteError: null,
          },
        ]}
      />
    );

    expect(screen.getByText("8 days remaining after this")).toBeDefined();
  });
});

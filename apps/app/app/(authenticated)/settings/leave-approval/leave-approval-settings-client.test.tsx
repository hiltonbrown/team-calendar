import type { OrganisationSettings } from "@repo/availability";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaveApprovalSettingsClient } from "./leave-approval-settings-client";

const mocks = vi.hoisted(() => ({
  restoreLeaveApprovalDefaultsAction: vi.fn(),
  updateLeaveApprovalSettingsAction: vi.fn(),
}));

vi.mock("./_actions", () => ({
  restoreLeaveApprovalDefaultsAction: mocks.restoreLeaveApprovalDefaultsAction,
  updateLeaveApprovalSettingsAction: mocks.updateLeaveApprovalSettingsAction,
}));

const organisationId = "70000000-0000-4000-8000-000000000001";
const settings: OrganisationSettings = {
  clerkOrgId: "org_clerk",
  createdAt: new Date("2026-08-30T00:00:00.000Z"),
  defaultFeedPrivacyMode: "named",
  defaultLeaveRequestAdvanceDays: 0,
  defaultPrivacyMode: "named",
  feedsIncludePublicHolidaysDefault: false,
  id: "70000000-0000-4000-8000-000000000002",
  managerVisibilityScope: "direct_reports_only",
  notifyManagersOnStatusChange: true,
  organisationId,
  requireDeclineReason: true,
  showDeclinedOnApprovals: true,
  showPendingOnCalendar: true,
  updatedAt: new Date("2026-08-30T00:00:00.000Z"),
};

describe("LeaveApprovalSettingsClient", () => {
  afterEach(() => {
    cleanup();
    mocks.restoreLeaveApprovalDefaultsAction.mockReset();
    mocks.updateLeaveApprovalSettingsAction.mockReset();
  });

  it("gives every auto-save switch an accessible name", () => {
    render(
      <LeaveApprovalSettingsClient
        organisationId={organisationId}
        settings={settings}
      />
    );

    expect(
      screen.getByRole("switch", { name: "Show pending leave on calendar" })
    ).toBeDefined();
    expect(
      screen.getByRole("switch", {
        name: "Show declined records by default",
      })
    ).toBeDefined();
    expect(
      screen.getByRole("switch", {
        name: "Notify managers on status change",
      })
    ).toBeDefined();
    expect(
      screen.getByRole("switch", { name: "Require decline reason" })
    ).toBeDefined();
  });

  it("announces the receipt beside the setting that saved", async () => {
    mocks.updateLeaveApprovalSettingsAction.mockResolvedValue({
      ok: true,
      value: { updated: true },
    });
    render(
      <LeaveApprovalSettingsClient
        organisationId={organisationId}
        settings={settings}
      />
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Show pending leave on calendar" })
    );
    await waitFor(() => expect(screen.getByText("Saved")).toBeDefined());
    expect(mocks.updateLeaveApprovalSettingsAction).toHaveBeenCalledWith({
      organisationId,
      patch: { showPendingOnCalendar: false },
    });
  });
});

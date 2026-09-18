import type { OrganisationSettings } from "@repo/availability";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedsClient } from "./feeds-client";

const mocks = vi.hoisted(() => ({
  updateFeedDefaultsAction: vi.fn(),
}));

vi.mock("./_actions", () => ({
  updateFeedDefaultsAction: mocks.updateFeedDefaultsAction,
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

describe("FeedsClient", () => {
  afterEach(() => {
    cleanup();
    mocks.updateFeedDefaultsAction.mockReset();
  });

  it("labels auto-save controls and announces a scoped receipt", async () => {
    mocks.updateFeedDefaultsAction.mockResolvedValue({
      ok: true,
      value: { updated: true },
    });
    render(
      <FeedsClient
        feeds={[]}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        settings={settings}
      />
    );

    expect(screen.getByRole("radio", { name: "Named" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Masked" })).toBeDefined();
    expect(
      screen.getByRole("switch", {
        name: "Public holidays enabled by default",
      })
    ).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "Masked" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeDefined());
    expect(mocks.updateFeedDefaultsAction).toHaveBeenCalledWith({
      organisationId,
      patch: { defaultFeedPrivacyMode: "masked" },
    });
  });

  it("keeps the failed control identified and announces recovery", async () => {
    mocks.updateFeedDefaultsAction.mockResolvedValue({
      error: { code: "unknown_error", message: "Source unavailable" },
      ok: false,
    });
    render(
      <FeedsClient
        feeds={[]}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        settings={settings}
      />
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Public holidays enabled by default",
      })
    );
    await waitFor(() =>
      expect(screen.getByText("Not saved. Try again.")).toBeDefined()
    );
  });
});

import type { PersonProfile } from "@repo/availability";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonProfileContent } from "./person-profile-content";

const mocks = vi.hoisted(() => ({
  refreshBalancesAction: vi.fn(),
  setManualBalanceAction: vi.fn(),
}));

vi.mock("@/app/(authenticated)/people/_actions", () => ({
  refreshBalancesAction: mocks.refreshBalancesAction,
  setManualBalanceAction: mocks.setManualBalanceAction,
}));

const profile: PersonProfile = {
  alternativeContacts: [],
  balances: {
    balancesLastFetchedAt: null,
    hasActiveXeroConnection: false,
    rows: [
      {
        balanceUnits: 12,
        currencyCode: null,
        id: "balance-1",
        leaveTypeName: "Annual leave",
        leaveTypeXeroId: "annual",
        recordType: "annual_leave",
        unitType: "hours",
        xeroTenantId: null,
      },
    ],
    xeroLinked: false,
  },
  currentStatus: {
    activePublicHoliday: null,
    activeRecord: null,
    approvalStatus: null,
    contactabilityStatus: null,
    label: "Available",
    recordType: null,
    statusKey: "available",
  },
  fieldOwnership: {
    avatarUrl: "team-calendar",
    email: "team-calendar",
    firstName: "team-calendar",
    jobTitle: "team-calendar",
    lastName: "team-calendar",
    location: "team-calendar",
    manager: "team-calendar",
    personType: "team-calendar",
    startDate: "team-calendar",
    statusNote: "team-calendar",
    team: "team-calendar",
  },
  header: {
    archivedAt: null,
    avatarUrl: null,
    email: "jane@example.com",
    firstName: "Jane",
    id: "00000000-0000-4000-8000-000000000003",
    jobTitle: "Engineer",
    lastName: "Doe",
    location: null,
    manager: null,
    personType: "employee",
    startDate: null,
    statusNote: null,
    team: null,
    xeroLinked: false,
  },
  upcomingRecords: [],
  xeroSyncFailedCount: 0,
};

describe("PersonProfileContent", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows profile provenance and hides manual balance editing from viewers", () => {
    renderProfile(false);

    expect(screen.getByText("Source: Manual entry.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(
      screen.getByText("Only admins and owners can edit manual balances.")
    ).toBeDefined();
  });

  it("gives admins a recovery path for an unlinked Xero profile", () => {
    renderProfile(true, {
      ...profile,
      balances: {
        ...profile.balances,
        hasActiveXeroConnection: true,
        rows: [],
      },
    });

    expect(
      screen.getByText("This profile is not linked to Xero.")
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Review Xero matches" })
        .getAttribute("href")
    ).toBe(
      "/settings/integrations/xero/matches?org=00000000-0000-4000-8000-000000000001"
    );
  });

  it("uses plain labels and announces a saved manual balance", async () => {
    mocks.setManualBalanceAction.mockResolvedValueOnce({ ok: true, value: {} });
    renderProfile(true);

    expect(screen.getByText("Leave type reference")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Leave type reference"), {
      target: { value: "annual" },
    });
    fireEvent.change(screen.getByLabelText("Balance"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "Manual balance saved."
    );
  });

  it("opens the balance panel when a deep link selects Balances", () => {
    renderProfile(false);

    expect(screen.getByRole("button", { name: "Balances" })).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Leave type" })
    ).toBeDefined();
    expect(screen.getByText("Annual leave")).toBeDefined();
  });
});

function renderProfile(canRefreshBalances: boolean, value = profile) {
  return render(
    <PersonProfileContent
      balanceRefreshEnabled
      canManageAlternativeContacts={false}
      canRefreshBalances={canRefreshBalances}
      history={{ nextCursor: null, records: [] }}
      initialTab="balances"
      organisationId="00000000-0000-4000-8000-000000000001"
      orgQueryValue="00000000-0000-4000-8000-000000000001"
      profile={value}
    />
  );
}

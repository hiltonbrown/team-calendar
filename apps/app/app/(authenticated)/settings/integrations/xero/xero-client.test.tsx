import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganisationWithConnectionView } from "../_connection-view";
import { XeroClient } from "./xero-client";

const mocks = vi.hoisted(() => ({
  disconnectXeroAction: vi.fn(),
  pauseTenantSyncAction: vi.fn(),
  refresh: vi.fn(),
  resumeTenantSyncAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));

vi.mock("@/app/(authenticated)/sync/_actions", () => ({
  dispatchManualSyncAction: vi.fn(),
}));

vi.mock("./_actions", () => ({
  connectXeroAction: vi.fn(),
  disconnectXeroAction: mocks.disconnectXeroAction,
  pauseTenantSyncAction: mocks.pauseTenantSyncAction,
  refreshXeroConnectionAction: vi.fn(),
  resumeTenantSyncAction: mocks.resumeTenantSyncAction,
}));

const ROLLING_REFRESH_REGEX = /Rolling refresh in progress since/i;
const DISCONNECT_CONFIRMATION_REGEX = /Type Acme Corp to confirm/i;

describe("XeroClient component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const baseTenant = {
    id: "70000000-0000-4000-8000-000000000003",
    last_approval_state_reconciled_at: null,
    last_leave_balances_sync_at: new Date("2026-08-28T09:00:00Z"),
    last_leave_records_sync_at: null,
    last_people_sync_at: null,
    leave_balances_stale_since: null,
    payroll_region: "AU" as const,
    sync_paused_at: null,
    tenant_name: "Acme Payroll AU",
    xero_tenant_id: "xero-tenant-1",
  };

  const baseConnection = {
    disconnected_at: null,
    expires_at: new Date("2026-08-30T00:00:00Z"),
    id: "70000000-0000-4000-8000-000000000002",
    last_error_message: null,
    revoked_at: null,
    status: "active" as const,
    xero_tenant: baseTenant,
  };

  const baseOrg: OrganisationWithConnectionView = {
    country_code: "AU",
    id: "70000000-0000-4000-8000-000000000001",
    name: "Acme Corp",
    xero_connection: baseConnection,
  };

  it("renders Latest balance page stat label", () => {
    render(<XeroClient organisations={[baseOrg]} />);

    expect(screen.getByText("Latest balance page")).toBeDefined();
    expect(screen.queryByText("Balance sync")).toBeNull();
  });

  it("renders rolling refresh in progress message when leave_balances_stale_since is present", () => {
    const orgWithStaleSince: OrganisationWithConnectionView = {
      ...baseOrg,
      xero_connection: {
        ...baseConnection,
        xero_tenant: {
          ...baseTenant,
          leave_balances_stale_since: new Date("2026-08-28T08:00:00Z"),
        },
      },
    };

    render(<XeroClient organisations={[orgWithStaleSince]} />);

    expect(screen.getByText(ROLLING_REFRESH_REGEX)).toBeDefined();
  });

  it("does not render rolling refresh in progress message when cycle is complete", () => {
    render(<XeroClient organisations={[baseOrg]} />);

    expect(screen.queryByText(ROLLING_REFRESH_REGEX)).toBeNull();
  });

  it("offers manual token refresh only for an active connection", () => {
    render(<XeroClient organisations={[baseOrg]} />);

    fireEvent.click(screen.getByText("Connection controls"));
    expect(
      screen.getByRole("button", { name: "Refresh tokens" })
    ).toBeDefined();
  });

  it.each([
    { disconnected_at: null, revoked_at: null, status: "stale" as const },
    {
      disconnected_at: new Date("2026-08-29T00:00:00.000Z"),
      revoked_at: null,
      status: "disconnected" as const,
    },
    {
      disconnected_at: null,
      revoked_at: new Date("2026-08-29T00:00:00.000Z"),
      status: "active" as const,
    },
  ])("hides manual token refresh for inactive connection state %#", (state) => {
    const organisation: OrganisationWithConnectionView = {
      ...baseOrg,
      xero_connection: { ...baseConnection, ...state },
    };

    render(<XeroClient organisations={[organisation]} />);

    fireEvent.click(screen.getByText("Connection controls"));
    expect(screen.queryByRole("button", { name: "Refresh tokens" })).toBeNull();
  });

  it("promotes one recommended sync and progressively discloses the rest", () => {
    render(<XeroClient organisations={[baseOrg]} />);

    expect(
      screen.getByRole("button", { name: "Sync people now" })
    ).toBeDefined();
    const details = screen.getByText("Manual sync options").closest("details");
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText("Manual sync options"));
    expect(details?.open).toBe(true);
    expect(
      screen.getByRole("button", { name: "Sync leave records" })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Sync balances" })).toBeDefined();
  });

  it("requires consequence-aware confirmation before disconnect", async () => {
    mocks.disconnectXeroAction.mockResolvedValue({
      ok: true,
      value: { disconnected: true },
    });
    render(<XeroClient organisations={[baseOrg]} />);
    fireEvent.click(screen.getByText("Connection controls"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Xero" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Disconnect Xero?",
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Disconnect Xero",
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(
      within(dialog).getByLabelText(DISCONNECT_CONFIRMATION_REGEX),
      {
        target: { value: "Acme Corp" },
      }
    );
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(mocks.disconnectXeroAction).toHaveBeenCalledWith({
        confirmationText: "Acme Corp",
        connectionId: baseConnection.id,
        mode: "soft",
        organisationId: baseOrg.id,
      })
    );
  });

  it("exposes the existing audited pause action", async () => {
    mocks.pauseTenantSyncAction.mockResolvedValue({
      ok: true,
      value: { paused: true },
    });
    render(<XeroClient organisations={[baseOrg]} />);
    fireEvent.click(screen.getByText("Connection controls"));
    fireEvent.click(
      screen.getByRole("button", { name: "Pause automatic sync" })
    );

    await waitFor(() =>
      expect(mocks.pauseTenantSyncAction).toHaveBeenCalledWith({
        organisationId: baseOrg.id,
        xeroTenantId: baseTenant.id,
      })
    );
  });
});

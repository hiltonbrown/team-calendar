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
  connectXeroAction: vi.fn(),
  disconnectXeroAction: vi.fn(),
  dispatchManualSyncAction: vi.fn(),
  pauseTenantSyncAction: vi.fn(),
  refresh: vi.fn(),
  resumeTenantSyncAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("@/app/(authenticated)/sync/_actions", () => ({
  dispatchManualSyncAction: mocks.dispatchManualSyncAction,
}));
vi.mock("./_actions", () => ({
  connectXeroAction: mocks.connectXeroAction,
  disconnectXeroAction: mocks.disconnectXeroAction,
  pauseTenantSyncAction: mocks.pauseTenantSyncAction,
  resumeTenantSyncAction: mocks.resumeTenantSyncAction,
}));
const OAUTH_ACTION_REGEX = /^(Connect|Reconnect) Xero$/;
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
    ...baseTenant,
    id: baseTenant.id,
    last_error_message: null,
    status: "active" as const,
  };
  const baseOrg: OrganisationWithConnectionView = {
    country_code: "AU",
    id: "70000000-0000-4000-8000-000000000001",
    name: "Acme Corp",
    xero_connection: baseConnection,
    xeroConnectionState: "connected",
  };
  it.each([
    {
      message:
        "We cannot reach Xero right now. Try again later or contact support.",
      state: "unavailable" as const,
    },
  ])(
    "only rechecks status when the connection is $state",
    ({ state, message }) => {
      render(
        <XeroClient
          organisations={[{ ...baseOrg, xeroConnectionState: state }]}
        />
      );
      expect(screen.getByRole("status").textContent).toBe(message);
      expect(
        screen.queryByRole("button", { name: OAUTH_ACTION_REGEX })
      ).toBeNull();
      const recheckButtons = screen.getAllByRole("button", {
        name: "Check connection again",
      });
      expect(recheckButtons).toHaveLength(1);
      fireEvent.click(recheckButtons[0]);
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByText("Manual sync options"));
      for (const name of [
        "Sync leave records",
        "Sync balances",
        "Reconcile approval state",
      ]) {
        const syncButton = screen.getByRole("button", { name });
        expect(syncButton.hasAttribute("disabled")).toBe(true);
        fireEvent.click(syncButton);
      }
      fireEvent.click(screen.getByText("Connection controls"));
      expect(
        screen.queryByRole("button", { name: "Refresh tokens" })
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: OAUTH_ACTION_REGEX })
      ).toBeNull();
      expect(mocks.connectXeroAction).not.toHaveBeenCalled();
      expect(mocks.dispatchManualSyncAction).not.toHaveBeenCalled();
    }
  );
  it.each([
    {
      name: "Connect Xero",
      organisation: {
        ...baseOrg,
        xero_connection: null,
        xeroConnectionState: "not_connected" as const,
      },
    },
    {
      name: "Reconnect Xero",
      organisation: {
        ...baseOrg,
        xeroConnectionState: "not_connected" as const,
      },
    },
    {
      name: "Reconnect Xero",
      organisation: {
        ...baseOrg,
        xeroConnectionState: "reauthorisation_required" as const,
      },
    },
  ])(
    "offers one OAuth action for $organisation.xeroConnectionState ($name)",
    async ({ name, organisation }) => {
      mocks.connectXeroAction.mockResolvedValue({
        error: { message: "Test-only connection failure." },
        ok: false,
      });
      render(<XeroClient organisations={[organisation]} />);
      const buttons = screen.getAllByRole("button", {
        name: OAUTH_ACTION_REGEX,
      });
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toBe(name);
      expect(
        screen.queryByRole("button", { name: "Check connection again" })
      ).toBeNull();
      if (organisation.xeroConnectionState === "reauthorisation_required") {
        expect(screen.getByRole("status").textContent).toBe(
          "Xero access needs to be renewed."
        );
      } else {
        expect(screen.queryByRole("status")).toBeNull();
      }
      fireEvent.click(buttons[0]);
      await waitFor(() =>
        expect(mocks.connectXeroAction).toHaveBeenCalledTimes(1)
      );
      expect(mocks.connectXeroAction).toHaveBeenCalledWith({
        organisationId: baseOrg.id,
      });
      expect(mocks.dispatchManualSyncAction).not.toHaveBeenCalled();
    }
  );
  it("keeps active manual sync without an OAuth prompt", async () => {
    mocks.dispatchManualSyncAction.mockResolvedValue({
      ok: true,
      value: { queued: true },
    });
    render(<XeroClient organisations={[baseOrg]} />);
    expect(
      screen.queryByRole("button", { name: OAUTH_ACTION_REGEX })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sync people now" }));
    await waitFor(() =>
      expect(mocks.dispatchManualSyncAction).toHaveBeenCalledTimes(1)
    );
    expect(mocks.dispatchManualSyncAction).toHaveBeenCalledWith({
      connectionId: baseTenant.id,
      organisationId: baseOrg.id,
      runType: "people",
    });
    expect(mocks.connectXeroAction).not.toHaveBeenCalled();
  });
  it("keeps paused syncs disabled and the audited resume action available", async () => {
    mocks.resumeTenantSyncAction.mockResolvedValue({
      ok: true,
      value: { paused: false },
    });
    render(
      <XeroClient
        organisations={[
          {
            ...baseOrg,
            xero_connection: {
              ...baseConnection,
              ...baseTenant,
              sync_paused_at: new Date("2026-09-27T00:00:00Z"),
            },
          },
        ]}
      />
    );
    expect(screen.getByText("Sync paused")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: OAUTH_ACTION_REGEX })
    ).toBeNull();
    fireEvent.click(screen.getByText("Manual sync options"));
    for (const name of [
      "Sync people now",
      "Sync leave records",
      "Sync balances",
      "Reconcile approval state",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(true);
      fireEvent.click(button);
    }
    expect(mocks.dispatchManualSyncAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Connection controls"));
    fireEvent.click(
      screen.getByRole("button", { name: "Resume automatic sync" })
    );
    await waitFor(() =>
      expect(mocks.resumeTenantSyncAction).toHaveBeenCalledTimes(1)
    );
    expect(mocks.resumeTenantSyncAction).toHaveBeenCalledWith({
      connectionId: baseTenant.id,
      organisationId: baseOrg.id,
    });
    expect(mocks.connectXeroAction).not.toHaveBeenCalled();
  });
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
        ...baseTenant,
        leave_balances_stale_since: new Date("2026-08-28T08:00:00Z"),
      },
    };
    render(<XeroClient organisations={[orgWithStaleSince]} />);
    expect(screen.getByText(ROLLING_REFRESH_REGEX)).toBeDefined();
  });
  it("does not render rolling refresh in progress message when cycle is complete", () => {
    render(<XeroClient organisations={[baseOrg]} />);
    expect(screen.queryByText(ROLLING_REFRESH_REGEX)).toBeNull();
  });
  it.each([null, new Date("2026-09-27T00:00:00Z")])(
    "settings has no manual token refresh when sync_paused_at is %s",
    (syncPausedAt) => {
      render(
        <XeroClient
          organisations={[
            {
              ...baseOrg,
              xero_connection: {
                ...baseConnection,
                sync_paused_at: syncPausedAt,
              },
            },
          ]}
        />
      );
      fireEvent.click(screen.getByText("Connection controls"));
      expect(
        screen.queryByRole("button", { name: "Refresh tokens" })
      ).toBeNull();
      expect(screen.queryByText("Refresh tokens")).toBeNull();
    }
  );
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
      value: {
        disconnected: true,
        result: { connectionId: baseConnection.id, state: "disconnected" },
      },
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
  it("reports confirmed disconnect success and refreshes the page", async () => {
    mocks.disconnectXeroAction.mockResolvedValue({
      ok: true,
      value: {
        disconnected: true,
        result: { connectionId: baseConnection.id, state: "disconnected" },
      },
    });
    render(<XeroClient organisations={[baseOrg]} />);
    fireEvent.click(screen.getByText("Connection controls"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Xero" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Disconnect Xero?",
    });
    fireEvent.change(
      within(dialog).getByLabelText(DISCONNECT_CONFIRMATION_REGEX),
      { target: { value: "Acme Corp" } }
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Disconnect Xero" })
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Disconnected from Xero."
      )
    );
    expect(mocks.refresh).toHaveBeenCalled();
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
        connectionId: baseTenant.id,
        organisationId: baseOrg.id,
      })
    );
  });
});

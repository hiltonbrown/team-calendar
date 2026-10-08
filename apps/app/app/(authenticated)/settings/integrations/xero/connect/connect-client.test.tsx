import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XeroConnectClient } from "./connect-client";

const mocks = vi.hoisted(() => ({
  completeTenantSelectionAction: vi.fn(),
}));

vi.mock("./_actions", () => ({
  completeTenantSelectionAction: mocks.completeTenantSelectionAction,
}));

const organisations = [
  { countryCode: "AU", id: "organisation-1", name: "Acme Corp" },
  { countryCode: "AU", id: "organisation-2", name: "Acme Hotels" },
];
const tenant = {
  connectionId: "provider-link-1",
  tenantId: "xero-file-1",
  tenantName: "Acme Payroll",
};
const PAYROLL_FILE_REGEX = /Acme Payroll/;
const HOTELS_PAYROLL_FILE_REGEX = /Acme Hotels Payroll/;

describe("XeroConnectClient", () => {
  beforeEach(() => {
    mocks.completeTenantSelectionAction.mockResolvedValue({
      error: { message: "Test-only connection failure." },
      ok: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows one Xero file as fixed information while retaining the organisation chooser", async () => {
    render(
      <XeroConnectClient
        organisations={organisations}
        presetOrganisationId={null}
        sessionId="session-1"
        tenants={[tenant]}
      />
    );

    expect(
      screen.queryByRole("button", { name: PAYROLL_FILE_REGEX })
    ).toBeNull();
    expect(screen.queryByText("Select a Xero tenant")).toBeNull();
    expect(screen.getByText("Acme Payroll")).toBeDefined();
    expect(
      screen
        .getByRole("combobox", { name: "Organisation" })
        .hasAttribute("disabled")
    ).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "Complete connection" })
    );
    await waitFor(() =>
      expect(mocks.completeTenantSelectionAction).toHaveBeenCalledWith({
        organisationId: organisations[0].id,
        sessionId: "session-1",
        tenantId: tenant.tenantId,
      })
    );
  });

  it("retains the Xero file picker and submits the selected file when several are available", async () => {
    const secondTenant = {
      connectionId: "provider-link-2",
      tenantId: "xero-file-2",
      tenantName: "Acme Hotels Payroll",
    };
    render(
      <XeroConnectClient
        organisations={organisations}
        presetOrganisationId={organisations[1].id}
        sessionId="session-1"
        tenants={[tenant, secondTenant]}
      />
    );

    expect(screen.getByText("Select a Xero tenant")).toBeDefined();
    expect(
      screen.getByRole("button", { name: PAYROLL_FILE_REGEX })
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: HOTELS_PAYROLL_FILE_REGEX })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Complete connection" })
    );
    await waitFor(() =>
      expect(mocks.completeTenantSelectionAction).toHaveBeenCalledWith({
        organisationId: organisations[1].id,
        sessionId: "session-1",
        tenantId: secondTenant.tenantId,
      })
    );
  });

  it.each(["xero-file-1", "xero-file-2"])(
    "marks current consent while keeping current and previous files selectable (%s)",
    async (selectedTenantId) => {
      const currentTenant = { ...tenant, isCurrentConsent: true };
      const previousTenant = {
        connectionId: "provider-link-2",
        isCurrentConsent: false,
        tenantId: "xero-file-2",
        tenantName: "Acme Hotels Payroll",
      };
      render(
        <XeroConnectClient
          organisations={organisations}
          presetOrganisationId={organisations[1].id}
          sessionId="session-1"
          tenants={[currentTenant, previousTenant]}
        />
      );

      const currentButton = screen.getByRole("button", {
        name: PAYROLL_FILE_REGEX,
      });
      const previousButton = screen.getByRole("button", {
        name: HOTELS_PAYROLL_FILE_REGEX,
      });
      expect(
        within(currentButton).getByText("Authorised just now")
      ).toBeDefined();
      expect(
        within(previousButton).queryByText("Authorised just now")
      ).toBeNull();
      expect(currentButton.hasAttribute("disabled")).toBe(false);
      expect(previousButton.hasAttribute("disabled")).toBe(false);
      fireEvent.click(
        selectedTenantId === currentTenant.tenantId
          ? currentButton
          : previousButton
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Complete connection" })
      );
      await waitFor(() =>
        expect(mocks.completeTenantSelectionAction).toHaveBeenCalledWith({
          organisationId: organisations[1].id,
          sessionId: "session-1",
          tenantId: selectedTenantId,
        })
      );
    }
  );
});

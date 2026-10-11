import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XeroConnectClient } from "./connect-client";

const mocks = vi.hoisted(() => ({ completeTenantSelectionAction: vi.fn() }));
vi.mock("./_actions", () => ({
  completeTenantSelectionAction: mocks.completeTenantSelectionAction,
}));
const available = {
  connectionId: "provider-1",
  state: "available" as const,
  tenantId: "file-1",
  tenantName: "Acme Payroll",
};
const existing = {
  connectionId: "provider-2",
  state: "already_in_account" as const,
  tenantId: "file-2",
  tenantName: "Acme Hotels",
};
const unavailable = {
  connectionId: "provider-3",
  state: "unavailable" as const,
  tenantId: "file-3",
  tenantName: "Other Payroll",
};
const baseProps = {
  organisations: [],
  presetOrganisationId: null,
  sessionId: "session-1",
};
describe("Xero multi-company picker", () => {
  beforeEach(() =>
    mocks.completeTenantSelectionAction.mockResolvedValue({
      error: { message: "Try again" },
      ok: false,
    })
  );
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("selects several available files and submits only selected IDs", async () => {
    render(
      <XeroConnectClient {...baseProps} tenants={[available, existing]} />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Acme Hotels" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete connection" })
    );
    await waitFor(() =>
      expect(mocks.completeTenantSelectionAction).toHaveBeenCalledWith({
        organisationId: undefined,
        sessionId: "session-1",
        tenantIds: ["file-1", "file-2"],
      })
    );
  });
  it("shows neutral ownership conflict copy and disables unavailable files", () => {
    render(<XeroConnectClient {...baseProps} tenants={[unavailable]} />);
    expect(
      screen.getByText(
        "This Xero organisation is connected to another Team Calendar account. Ask its administrator to remove it there first."
      )
    ).toBeDefined();
    expect(
      screen
        .getByRole("checkbox", { name: "Other Payroll" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Complete connection" })
        .hasAttribute("disabled")
    ).toBe(true);
  });
  it("shows every availability state without displaying provider connection identifiers", () => {
    render(
      <XeroConnectClient
        {...baseProps}
        tenants={[available, existing, unavailable]}
      />
    );
    for (const state of [
      "Available",
      "Already in this account",
      "Unavailable",
    ]) {
      expect(screen.getByText(state)).toBeDefined();
    }
    expect(screen.queryByText("provider-3")).toBeNull();
    expect(screen.queryByText("file-3")).toBeNull();
  });
  it("blocks selections above allowance while allowing existing-account reconnection", () => {
    render(
      <XeroConnectClient
        {...baseProps}
        payrollEntityAllowance={{ limit: 5, remaining: 0, used: 5 }}
        tenants={[available, existing]}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("exceed");
    fireEvent.click(screen.getByRole("checkbox", { name: "Acme Payroll" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Acme Hotels" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Complete connection" })
        .hasAttribute("disabled")
    ).toBe(false);
  });
  it("permits binding an existing Starter company with no new-company allowance", async () => {
    render(
      <XeroConnectClient
        {...baseProps}
        payrollEntityAllowance={{ limit: 1, remaining: 0, used: 1 }}
        presetOrganisationId="company-1"
        tenants={[available, { ...existing, state: "available" }]}
      />
    );
    expect(screen.queryByRole("alert")).toBeNull();
    const complete = screen.getByRole("button", {
      name: "Complete connection",
    });
    expect(complete.hasAttribute("disabled")).toBe(false);
    fireEvent.click(complete);
    await waitFor(() =>
      expect(mocks.completeTenantSelectionAction).toHaveBeenCalledWith({
        organisationId: "company-1",
        sessionId: "session-1",
        tenantIds: ["file-1"],
      })
    );
  });
  it("replaces the selected file when choosing another for a preset company", async () => {
    render(
      <XeroConnectClient
        {...baseProps}
        payrollEntityAllowance={{ limit: 1, remaining: 0, used: 1 }}
        presetOrganisationId="company-1"
        tenants={[available, { ...existing, state: "available" }]}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Acme Hotels" }));
    expect(
      screen
        .getByRole("checkbox", { name: "Acme Payroll" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(
      screen
        .getByRole("checkbox", { name: "Acme Hotels" })
        .getAttribute("aria-checked")
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "Complete connection" })
    );
    await waitFor(() =>
      expect(mocks.completeTenantSelectionAction).toHaveBeenCalledWith({
        organisationId: "company-1",
        sessionId: "session-1",
        tenantIds: ["file-2"],
      })
    );
  });
  it("retains successful and failed per-file results", async () => {
    mocks.completeTenantSelectionAction.mockResolvedValue({
      ok: true,
      value: {
        outcomes: [
          { ok: true, tenantId: "file-1" },
          {
            message: "Unable to connect this file.",
            ok: false,
            tenantId: "file-2",
          },
        ],
        redirectTo: "/settings/integrations/xero",
      },
    });
    render(
      <XeroConnectClient {...baseProps} tenants={[available, existing]} />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Acme Hotels" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete connection" })
    );
    await waitFor(() =>
      expect(screen.getByText("Connection results")).toBeDefined()
    );
    expect(screen.getByText("Connected")).toBeDefined();
    expect(screen.getByText("Unable to connect this file.")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Back to Xero settings" })
        .getAttribute("href")
    ).toBe("/settings/integrations/xero");
  });
});

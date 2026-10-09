import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  advanceStepAction: vi.fn(),
  assign: vi.fn(),
  saveDetailsAction: vi.fn(),
  skipXeroAction: vi.fn(),
  startXeroFromOnboardingAction: vi.fn(),
}));
vi.mock("../_actions", () => mocks);

class ResizeObserverMock {
  disconnect() {
    // jsdom has no layout to observe.
  }
  observe() {
    // jsdom has no layout to observe.
  }
  unobserve() {
    // jsdom has no layout to observe.
  }
}
globalThis.ResizeObserver = ResizeObserverMock;

const { DetailsStep } = await import("./details-step");
const { XeroStep, xeroReturnMessage } = await import("./xero-step");
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("DetailsStep", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("defaults a non-Australian timezone to Sydney and submits the details", async () => {
    mocks.saveDetailsAction.mockResolvedValue({ ok: true, value: {} });
    render(
      <DetailsStep name="Acme" organisationId={organisationId} timezone="UTC" />
    );
    expect(document.activeElement?.textContent).toBe("Your organisation");
    fireEvent.change(screen.getByLabelText("Organisation name"), {
      target: { value: "Acme Pty Ltd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.saveDetailsAction).toHaveBeenCalledWith({
        name: "Acme Pty Ltd",
        organisationId,
        timezone: "Australia/Sydney",
      })
    );
  });

  it("keeps the input and shows the error when saving fails", async () => {
    mocks.saveDetailsAction.mockResolvedValue({
      error: { code: "unknown_error", message: "Could not save." },
      ok: false,
    });
    render(
      <DetailsStep
        name="Acme"
        organisationId={organisationId}
        timezone="Australia/Perth"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not save."
    );
    expect(
      (screen.getByLabelText("Organisation name") as HTMLInputElement).value
    ).toBe("Acme");
  });
});

describe("XeroStep", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("maps return codes to plain copy and never shows unknown codes", () => {
    expect(
      xeroReturnMessage({ cancelled: false, errorCode: "unavailable" })
    ).toContain("could not be reached");
    expect(
      xeroReturnMessage({ cancelled: false, errorCode: "<script>" })
    ).toContain("could not be connected");
    expect(xeroReturnMessage({ cancelled: true, errorCode: null })).toContain(
      "cancelled"
    );
    expect(xeroReturnMessage({ cancelled: false, errorCode: null })).toBeNull();
  });

  it("starts the Xero connection", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: mocks.assign },
    });
    mocks.startXeroFromOnboardingAction.mockResolvedValue({
      ok: true,
      value: { redirectUrl: "https://api.test/start" },
    });
    render(
      <XeroStep
        connected={false}
        organisationId={organisationId}
        returnMessage={null}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Xero Payroll" })
    );
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith("https://api.test/start")
    );
  });

  it("confirms before setting up without Xero", async () => {
    mocks.skipXeroAction.mockResolvedValue({ ok: true, value: {} });
    render(
      <XeroStep
        connected={false}
        organisationId={organisationId}
        returnMessage="You cancelled the Xero connection."
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("cancelled");
    fireEvent.click(
      screen.getByRole("button", { name: "Set up without Xero" })
    );
    expect(mocks.skipXeroAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent === "Set up without Xero"
      ) as HTMLButtonElement
    );
    await waitFor(() =>
      expect(mocks.skipXeroAction).toHaveBeenCalledWith({ organisationId })
    );
  });

  it("continues once Xero is connected", async () => {
    mocks.advanceStepAction.mockResolvedValue({ ok: true, value: {} });
    render(
      <XeroStep
        connected
        organisationId={organisationId}
        returnMessage={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.advanceStepAction).toHaveBeenCalledWith({
        from: "xero",
        organisationId,
      })
    );
  });
});

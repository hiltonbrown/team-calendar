import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordForm } from "./record-form";

const mocks = vi.hoisted(() => ({
  createRecordAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  updateRecordAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("./_actions", () => ({
  createRecordAction: (input: unknown) => mocks.createRecordAction(input),
  updateRecordAction: (input: unknown) => mocks.updateRecordAction(input),
}));

class ResizeObserverMock {
  disconnect() {
    // No-op: the form does not react to resize callbacks in this test.
  }
  observe() {
    // No-op: the form does not react to resize callbacks in this test.
  }
  unobserve() {
    // No-op: the form does not react to resize callbacks in this test.
  }
}

globalThis.ResizeObserver = ResizeObserverMock;

const renderForm = () =>
  render(
    <RecordForm
      balanceAvailable={null}
      canSelectPerson
      closeHref="/plans"
      mode="create"
      organisationId="00000000-0000-4000-8000-000000000001"
      people={[
        {
          email: "alex@example.com",
          id: "00000000-0000-4000-8000-000000000002",
          label: "Alex Morgan",
        },
      ]}
      xeroConnectionState="not_connected"
    />
  );

describe("RecordForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    [
      "unavailable",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    ["disconnect_pending", "Sync stopped. Xero disconnection is pending."],
    ["reauthorisation_required", "Xero access needs to be renewed."],
  ] as const)("blocks the payroll leave path while %s", (state, message) => {
    const { container } = render(
      <RecordForm
        balanceAvailable={null}
        canSelectPerson={false}
        closeHref="/plans"
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={[
          {
            email: "alex@example.com",
            id: "00000000-0000-4000-8000-000000000002",
            label: "Alex Morgan",
          },
        ]}
        xeroConnectionState={state}
      />
    );
    expect(screen.getByText(message)).toBeDefined();
    expect(
      screen.queryByText("Saves as approved in Team Calendar only.", {
        exact: false,
      })
    ).toBeNull();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    const form = container.querySelector("form");
    if (!form) {
      throw new Error("Form missing");
    }
    fireEvent.submit(form);
    expect(mocks.createRecordAction).not.toHaveBeenCalled();
  });

  it("associates visible labels with the core controls", () => {
    renderForm();

    expect(screen.getByRole("radiogroup", { name: "Intent" })).toBeDefined();
    expect(screen.getByLabelText("Person")).toBeDefined();
    expect(screen.getByLabelText("Leave type")).toBeDefined();
    expect(screen.getByLabelText("Starts")).toBeDefined();
    expect(screen.getByLabelText("Ends")).toBeDefined();
    expect(screen.getByLabelText("Contactability")).toBeDefined();
    expect(screen.getByLabelText("Privacy")).toBeDefined();
    expect(screen.getByLabelText("Notes")).toBeDefined();
  });

  it("focuses an announced error summary and preserves entered values", async () => {
    const { container } = renderForm();
    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: "Keep this note" } });

    const form = container.querySelector("form");
    if (!form) {
      throw new Error("Expected the record form to render.");
    }
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(alert);
    expect(notes.value).toBe("Keep this note");
  });

  it("renders formatted balance according to balanceUnit and balanceCurrencyCode", () => {
    const { rerender } = render(
      <RecordForm
        balanceAvailable={15}
        balanceUnit="days"
        canSelectPerson
        closeHref="/plans"
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={[
          {
            email: "alex@example.com",
            id: "00000000-0000-4000-8000-000000000002",
            label: "Alex Morgan",
          },
        ]}
        xeroConnectionState="connected"
      />
    );

    expect(
      screen.getByText("Current Xero balance: 15 days before this request.")
    ).toBeDefined();

    rerender(
      <RecordForm
        balanceAvailable={37.5}
        balanceUnit="hours"
        canSelectPerson
        closeHref="/plans"
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={[
          {
            email: "alex@example.com",
            id: "00000000-0000-4000-8000-000000000002",
            label: "Alex Morgan",
          },
        ]}
        xeroConnectionState="connected"
      />
    );

    expect(
      screen.getByText("Current Xero balance: 37.5 hours before this request.")
    ).toBeDefined();

    rerender(
      <RecordForm
        balanceAvailable={1200}
        balanceCurrencyCode="NZD"
        balanceUnit="currency"
        canSelectPerson
        closeHref="/plans"
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={[
          {
            email: "alex@example.com",
            id: "00000000-0000-4000-8000-000000000002",
            label: "Alex Morgan",
          },
        ]}
        xeroConnectionState="connected"
      />
    );

    expect(
      screen.getByText("Current Xero balance: $1,200.00 before this request.")
    ).toBeDefined();
  });
});

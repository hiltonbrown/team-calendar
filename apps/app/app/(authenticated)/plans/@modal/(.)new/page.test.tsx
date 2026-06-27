import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordForm } from "../../record-form";

const LOCAL_ONLY_COPY = /will not create payroll leave/;
const CURRENT_BALANCE_COPY = /Current Xero balance/;
const CALENDAR_IMMEDIATE_COPY = /appears on calendars and feeds/;
const LEAVE_INTENT_NAME = /Leave/;
const AVAILABILITY_INTENT_NAME = /Availability/;

const mocks = vi.hoisted(() => ({
  createRecordAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  retrySubmissionAction: vi.fn(),
  revertToDraftAction: vi.fn(),
  submitForApprovalAction: vi.fn(),
  updateRecordAction: vi.fn(),
}));

class ResizeObserverMock {
  disconnect() {
    return;
  }
  observe() {
    return;
  }
  unobserve() {
    return;
  }
}

globalThis.ResizeObserver = ResizeObserverMock;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));
vi.mock("../../_actions", () => ({
  createRecordAction: mocks.createRecordAction,
  retrySubmissionAction: mocks.retrySubmissionAction,
  revertToDraftAction: mocks.revertToDraftAction,
  submitForApprovalAction: mocks.submitForApprovalAction,
  updateRecordAction: mocks.updateRecordAction,
}));
vi.mock("@/app/(authenticated)/plans/_actions", () => ({
  createRecordAction: mocks.createRecordAction,
  retrySubmissionAction: mocks.retrySubmissionAction,
  revertToDraftAction: mocks.revertToDraftAction,
  submitForApprovalAction: mocks.submitForApprovalAction,
  updateRecordAction: mocks.updateRecordAction,
}));

const people = [
  {
    email: "person@example.com",
    id: "00000000-0000-4000-8000-000000000011",
    label: "Test Person",
  },
];

const initialRecord = {
  allDay: true,
  contactabilityStatus: "contactable" as const,
  endsAt: "2026-05-05",
  endTime: "",
  id: "00000000-0000-4000-8000-000000000099",
  notesInternal: "Keep me",
  personId: people[0].id,
  privacyMode: "named" as const,
  recordType: "annual_leave" as const,
  startsAt: "2026-05-04",
  startTime: "",
};

describe("new record modal form", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.createRecordAction.mockResolvedValue({
      ok: true,
      value: { id: initialRecord.id },
    });
    mocks.submitForApprovalAction.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "xero_sync_failed",
        id: initialRecord.id,
        xeroWriteError: "Could not reach Xero.",
      },
    });
  });

  it("shows Save draft and Save and submit for connected leave", () => {
    render(
      <RecordForm
        balanceAvailable={10}
        canSelectPerson={false}
        closeHref="/plans"
        hasActiveXeroConnection={true}
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={people}
        record={initialRecord}
      />
    );

    expect(
      screen
        .getByRole("radio", { name: LEAVE_INTENT_NAME })
        .getAttribute("data-state")
    ).toBe("on");
    expect(screen.getByText("Payroll leave sent to Xero")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Save and submit" })
    ).toBeDefined();
  });

  it("shows a single Save button for leave when Xero is disconnected", () => {
    render(
      <RecordForm
        balanceAvailable={null}
        canSelectPerson={false}
        closeHref="/plans"
        hasActiveXeroConnection={false}
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={people}
        record={initialRecord}
      />
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.getByText(LOCAL_ONLY_COPY)).toBeDefined();
  });

  it("switches from leave to availability intent", () => {
    render(
      <RecordForm
        balanceAvailable={10}
        canSelectPerson={false}
        closeHref="/plans"
        hasActiveXeroConnection={true}
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={people}
        record={initialRecord}
      />
    );

    fireEvent.click(
      screen.getByRole("radio", { name: AVAILABILITY_INTENT_NAME })
    );

    expect(
      screen
        .getByRole("radio", { name: AVAILABILITY_INTENT_NAME })
        .getAttribute("data-state")
    ).toBe("on");
    expect(screen.getByText(CALENDAR_IMMEDIATE_COPY)).toBeDefined();
    expect(screen.queryByText(CURRENT_BALANCE_COPY)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Save and submit" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });

  it("shows a single Save button and no balance panel for local-only records", () => {
    render(
      <RecordForm
        balanceAvailable={10}
        canSelectPerson={false}
        closeHref="/plans"
        hasActiveXeroConnection={true}
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={people}
        record={{ ...initialRecord, recordType: "wfh" }}
      />
    );

    expect(
      screen
        .getByRole("radio", { name: AVAILABILITY_INTENT_NAME })
        .getAttribute("data-state")
    ).toBe("on");
    expect(screen.getByText("Calendar-only work status")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    expect(screen.queryByText(CURRENT_BALANCE_COPY)).toBeNull();
    expect(screen.getByText(CALENDAR_IMMEDIATE_COPY)).toBeDefined();
  });

  it("keeps values and shows the Xero error after Save and submit", async () => {
    render(
      <RecordForm
        balanceAvailable={10}
        canSelectPerson={false}
        closeHref="/plans"
        hasActiveXeroConnection={true}
        mode="create"
        organisationId="00000000-0000-4000-8000-000000000001"
        people={people}
        record={initialRecord}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save and submit" }));
    await screen.findByText("Send leave to Xero?");
    fireEvent.click(screen.getByRole("button", { name: "Send to Xero" }));

    await waitFor(() => {
      expect(screen.getByText("Could not reach Xero.")).toBeDefined();
    });
    expect(screen.getByDisplayValue("Keep me")).toBeDefined();
  });
});

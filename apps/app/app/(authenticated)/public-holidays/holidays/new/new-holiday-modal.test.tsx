import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCustomHolidayActionInput,
  NewHolidayModal,
} from "./new-holiday-modal";

const mocks = vi.hoisted(() => ({
  addCustomHolidayAction: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mocks.back }),
}));
vi.mock("../../_actions", () => ({
  addCustomHolidayAction: mocks.addCustomHolidayAction,
}));

class ResizeObserverMock {
  disconnect() {
    // The form does not react to resize callbacks in this test.
  }
  observe() {
    // The form does not react to resize callbacks in this test.
  }
  unobserve() {
    // The form does not react to resize callbacks in this test.
  }
}

globalThis.ResizeObserver = ResizeObserverMock;

const organisationId = "00000000-0000-4000-8000-000000000001";
const jurisdictions = [
  {
    country_code: "AU",
    id: "00000000-0000-4000-8000-000000000101",
    region_code: null,
  },
  {
    country_code: "AU",
    id: "00000000-0000-4000-8000-000000000102",
    region_code: "QLD",
  },
];

describe("NewHolidayModal", () => {
  beforeEach(() => {
    mocks.addCustomHolidayAction.mockResolvedValue({
      ok: true,
      value: { id: "holiday" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("previews and submits an organisation-wide holiday", async () => {
    render(
      <NewHolidayModal
        jurisdictions={jurisdictions}
        organisationId={organisationId}
      />
    );

    expect(
      screen.getAllByText("All organisation locations").length
    ).toBeGreaterThan(1);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));

    await waitFor(() => {
      expect(mocks.addCustomHolidayAction).toHaveBeenCalledWith(
        expect.objectContaining({
          appliesToAllJurisdictions: true,
          jurisdictionId: null,
          organisationId,
        })
      );
    });
  });

  it.each([
    ["AU national", jurisdictions[0].id],
    ["AU-QLD", jurisdictions[1].id],
  ])("builds the supported %s jurisdiction scope", (_label, id) => {
    expect(
      buildCustomHolidayActionInput(
        {
          date: "2026-09-14",
          jurisdictionId: id,
          name: "Company day",
          recursAnnually: false,
          scope: "jurisdiction",
        },
        organisationId
      )
    ).toMatchObject({
      appliesToAllJurisdictions: false,
      jurisdictionId: id,
      organisationId,
    });
  });
});

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Company day" },
  });
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2026-09-14" },
  });
}

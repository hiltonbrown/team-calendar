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
const countries = [
  {
    code: "AU",
    label: "Australia",
    regions: [{ code: "QLD", label: "Queensland" }],
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

  it("previews and submits a holiday for everyone", async () => {
    render(
      <NewHolidayModal
        countries={countries}
        defaultCountryCode="AU"
        organisationId={organisationId}
      />
    );

    expect(screen.getByText("Everyone in the organisation")).toBeTruthy();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));

    await waitFor(() => {
      expect(mocks.addCustomHolidayAction).toHaveBeenCalledWith(
        expect.objectContaining({
          appliesToAllJurisdictions: true,
          countryCode: null,
          organisationId,
          regionCode: null,
        })
      );
    });
  });

  it.each([
    ["the whole country", "__all__", null],
    ["one region", "QLD", "QLD"],
  ])("builds a country scope for %s", (_label, regionCode, expected) => {
    expect(
      buildCustomHolidayActionInput(
        {
          countryCode: "AU",
          date: "2026-09-14",
          name: "Company day",
          regionCode,
          scope: "country",
        },
        organisationId
      )
    ).toMatchObject({
      appliesToAllJurisdictions: false,
      countryCode: "AU",
      organisationId,
      regionCode: expected,
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

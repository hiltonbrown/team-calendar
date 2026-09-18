import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsFilters, validateCustomRange } from "./analytics-filters";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams("org=org-1&view=compact&cursor=next"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

describe("AnalyticsFilters", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("requires both custom dates and links errors to their fields", () => {
    render(<AnalyticsFilters preset="custom" />);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    expect(from.getAttribute("aria-invalid")).toBe("true");
    expect(from.getAttribute("aria-describedby")).toBe("analytics-from-error");
    expect(to.getAttribute("aria-invalid")).toBe("true");
    expect(to.getAttribute("aria-describedby")).toBe("analytics-to-error");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("rejects an inverted range without discarding its values", () => {
    render(
      <AnalyticsFilters
        customEnd="2026-03-01"
        customStart="2026-03-31"
        preset="custom"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByLabelText("From").getAttribute("value")).toBe(
      "2026-03-31"
    );
    expect(screen.getByLabelText("To").getAttribute("value")).toBe(
      "2026-03-01"
    );
    expect(
      screen.getByText("The end date must be on or after the start date.")
    ).toBeDefined();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("preserves unrelated query state and removes pagination", () => {
    render(
      <AnalyticsFilters
        customEnd="2026-03-31"
        customStart="2026-03-01"
        preset="custom"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const destination = mocks.push.mock.calls[0]?.[0];
    expect(destination).toContain("org=org-1");
    expect(destination).toContain("view=compact");
    expect(destination).toContain("preset=custom");
    expect(destination).toContain("from=2026-03-01");
    expect(destination).toContain("to=2026-03-31");
    expect(destination).not.toContain("cursor=");
  });

  it("preserves the selected person type with organisation state", () => {
    render(<AnalyticsFilters personType="contractor" preset="this_year" />);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const destination = mocks.push.mock.calls[0]?.[0];
    expect(destination).toContain("org=org-1");
    expect(destination).toContain("personType=contractor");
    expect(screen.getByLabelText("People").textContent).toContain(
      "Contractors"
    );
  });
});

describe("validateCustomRange", () => {
  it("accepts an inclusive same-day range", () => {
    expect(validateCustomRange("2026-03-01", "2026-03-01")).toEqual({});
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarError from "./error";
import CalendarLoading from "./loading";

const FILTER_CONTEXT_PATTERN = /filters are still in place/i;

vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));

describe("calendar route states", () => {
  afterEach(cleanup);

  it("renders a calendar-shaped announced loading state", () => {
    render(<CalendarLoading />);

    const status = screen.getByRole("status", { name: "Loading calendar" });
    expect(status.querySelectorAll(".animate-pulse")).toHaveLength(22);
  });

  it("preserves context copy and retries a route error", () => {
    const reset = vi.fn();
    render(<CalendarError reset={reset} />);

    expect(screen.getByText(FILTER_CONTEXT_PATTERN)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

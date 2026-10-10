import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setFilterParams: vi.fn() }));
vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [null, mocks.setFilterParams],
}));

const { FeedOversightFilterBar } = await import("./feed-oversight-filters");

describe("FeedOversightFilterBar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("applies search and resets pagination", () => {
    render(
      <FeedOversightFilterBar filters={{ status: ["active", "paused"] }} />
    );
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "  sales " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.setFilterParams).toHaveBeenCalledWith({
      cursor: undefined,
      search: "sales",
      status: ["active", "paused"],
      type: undefined,
    });
  });

  it("keeps active type and status filters and clears them together", () => {
    render(
      <FeedOversightFilterBar
        filters={{ search: "ops", status: ["archived"], type: ["self"] }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.setFilterParams).toHaveBeenLastCalledWith({
      cursor: undefined,
      search: "ops",
      status: ["archived"],
      type: ["self"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.setFilterParams).toHaveBeenLastCalledWith({
      cursor: undefined,
      search: "",
      status: ["active", "paused"],
      type: undefined,
    });
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe(
      ""
    );
  });
});

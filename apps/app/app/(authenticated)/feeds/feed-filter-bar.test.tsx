import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedFilterBar } from "./feed-filter-bar";

const mocks = vi.hoisted(() => ({ setFilterParams: vi.fn() }));

vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [{}, mocks.setFilterParams],
}));

describe("FeedFilterBar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reports active filters and clears them to the default feed view", () => {
    render(
      <FeedFilterBar
        privacyMode={["named"]}
        search="leadership"
        status={["archived"]}
      />
    );

    expect(screen.getByText("3 filters active.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(mocks.setFilterParams).toHaveBeenCalledWith({
      cursor: undefined,
      privacyMode: undefined,
      search: undefined,
      status: ["active", "paused"],
    });
    expect(screen.getByText("Showing active and paused feeds.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardSkeleton } from "./dashboard-skeleton";

describe("DashboardSkeleton", () => {
  afterEach(cleanup);

  it("announces loading and mirrors the timeline rows", () => {
    const { container } = render(<DashboardSkeleton />);
    expect(screen.getByRole("status").textContent).toContain(
      "Loading dashboard"
    );
    expect(container.querySelectorAll(".h-16")).toHaveLength(6);
  });
});

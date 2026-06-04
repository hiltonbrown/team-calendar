import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarCreateLauncher } from "./calendar-create-launcher";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("org=org_1"),
}));

describe("CalendarCreateLauncher", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("navigates to the new record route with date and person prefilled", () => {
    render(
      <CalendarCreateLauncher
        personId="00000000-0000-4000-8000-000000000011"
        startsAt="2026-04-15"
      >
        Add
      </CalendarCreateLauncher>
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/plans/new?startsAt=2026-04-15&personId=00000000-0000-4000-8000-000000000011&org=org_1"
    );
  });
});

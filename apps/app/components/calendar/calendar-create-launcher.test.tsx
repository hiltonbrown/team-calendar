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

  it("navigates to the new record route with date and person prefilled and accessible name", () => {
    render(
      <CalendarCreateLauncher
        personId="00000000-0000-4000-8000-000000000011"
        startsAt="2026-04-15"
      />
    );

    const button = screen.getByRole("button", {
      name: "Add availability for 15 April 2026",
    });
    expect(button).toBeDefined();

    fireEvent.click(button);

    expect(mocks.push).toHaveBeenCalledWith(
      "/plans/new?startsAt=2026-04-15&personId=00000000-0000-4000-8000-000000000011&org=org_1"
    );
  });

  it("activates via keyboard activation", () => {
    render(
      <CalendarCreateLauncher
        personId="00000000-0000-4000-8000-000000000011"
        startsAt="2026-04-15"
      />
    );

    const button = screen.getByRole("button", {
      name: "Add availability for 15 April 2026",
    });

    fireEvent.click(button);
    expect(mocks.push).toHaveBeenCalledWith(
      "/plans/new?startsAt=2026-04-15&personId=00000000-0000-4000-8000-000000000011&org=org_1"
    );
  });

  it("includes the selected time in its accessible name", () => {
    render(
      <CalendarCreateLauncher
        personId="00000000-0000-4000-8000-000000000011"
        startsAt="2026-04-15T09:00"
      >
        Add at 09:00
      </CalendarCreateLauncher>
    );

    expect(
      screen.getByRole("button", {
        name: "Add availability for 15 April 2026 at 09:00",
      })
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add availability for 15 April 2026 at 09:00",
      })
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/plans/new?startsAt=2026-04-15T09%3A00&personId=00000000-0000-4000-8000-000000000011&org=org_1"
    );
  });
});

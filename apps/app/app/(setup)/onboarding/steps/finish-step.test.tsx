import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  finishAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("../_actions", () => ({ finishAction: mocks.finishAction }));

const { FinishStep } = await import("./finish-step");
const organisationId = "00000000-0000-4000-8000-000000000001";
const OPEN = "Open team calendar";

function renderFinish(
  overrides: Partial<Parameters<typeof FinishStep>[0]> = {}
) {
  return render(
    <FinishStep
      calendarHref="/calendar"
      mode="xero"
      organisationId={organisationId}
      stages={{ balances: "running", leave: "running", people: "complete" }}
      {...overrides}
    />
  );
}

describe("FinishStep", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("waits for leave but lets the admin open the calendar now", async () => {
    mocks.finishAction.mockResolvedValue({
      ok: true,
      value: { redirectTo: "/calendar" },
    });
    renderFinish();
    expect(
      (screen.getByRole("button", { name: OPEN }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      screen.getByText("Your calendar opens when leave has been imported.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open calendar now" }));
    await waitFor(() =>
      expect(mocks.finishAction).toHaveBeenCalledWith({
        force: true,
        organisationId,
      })
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/calendar"));
  });

  it("opens the calendar once leave is imported", async () => {
    mocks.finishAction.mockResolvedValue({
      ok: true,
      value: { redirectTo: "/calendar" },
    });
    renderFinish({
      stages: { balances: "running", leave: "complete", people: "complete" },
    });
    expect(
      screen.getByRole("heading", { name: "Your calendar is ready" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open calendar now" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: OPEN }));
    await waitFor(() =>
      expect(mocks.finishAction).toHaveBeenCalledWith({
        force: false,
        organisationId,
      })
    );
  });

  it("never traps the admin behind a failed leave import", () => {
    renderFinish({
      stages: { balances: "failed", leave: "failed", people: "complete" },
    });
    expect(
      (screen.getByRole("button", { name: OPEN }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect(screen.getAllByText("Did not finish").length).toBe(2);
  });

  it("finishes straight away in manual mode without import status", () => {
    renderFinish({
      mode: "manual",
      stages: {
        balances: "not_started",
        leave: "not_started",
        people: "not_started",
      },
    });
    expect(
      (screen.getByRole("button", { name: OPEN }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect(screen.queryByText("Leave balances")).toBeNull();
  });

  it("announces stage status politely and shows finish errors", async () => {
    mocks.finishAction.mockResolvedValue({
      error: { code: "step_incomplete", message: "Not yet." },
      ok: false,
    });
    const { container } = renderFinish();
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe(
      "People: Imported. Leave: Importing. Leave balances: Importing"
    );
    fireEvent.click(screen.getByRole("button", { name: "Open calendar now" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not yet.");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CoverageSettingsClient,
  type CoverageTeam,
} from "./coverage-settings-client";

const mocks = vi.hoisted(() => ({
  updateTeamCoverageMinimumAction: vi.fn(),
}));

vi.mock("./_actions", () => ({
  updateTeamCoverageMinimumAction: mocks.updateTeamCoverageMinimumAction,
}));

const organisationId = "70000000-0000-4000-8000-000000000001";

const buildTeam = (overrides: Partial<CoverageTeam> = {}): CoverageTeam => ({
  activePeopleCount: 7,
  id: "70000000-0000-4000-8000-000000000010",
  minimumAvailablePeople: null,
  name: "Customer support",
  ...overrides,
});

const teams = [
  buildTeam({ minimumAvailablePeople: 2 }),
  buildTeam({
    activePeopleCount: 1,
    id: "70000000-0000-4000-8000-000000000011",
    name: "Operations",
  }),
];

const renderClient = (rows: CoverageTeam[] = teams) =>
  render(
    <CoverageSettingsClient organisationId={organisationId} teams={rows} />
  );

const minimumInput = (teamName: string) =>
  screen.getByLabelText(`Minimum people in for ${teamName}`);

describe("CoverageSettingsClient", () => {
  afterEach(() => {
    cleanup();
    mocks.updateTeamCoverageMinimumAction.mockReset();
  });

  it("renders the page copy and one row per team with its size and minimum", () => {
    renderClient();

    expect(screen.getByRole("heading", { name: "Coverage" })).toBeDefined();
    expect(
      screen.getByText(
        "Set how many people each team needs available on a working day. Managers see shortfalls on their dashboard."
      )
    ).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Team size: 7 people")).toBeDefined();
    expect(screen.getByText("Team size: 1 person")).toBeDefined();
    expect(screen.getAllByText("Minimum people in")).toHaveLength(2);
    const support = minimumInput("Customer support") as HTMLInputElement;
    expect(support.type).toBe("number");
    expect(support.value).toBe("2");
    expect(support.max).toBe("7");
    expect((minimumInput("Operations") as HTMLInputElement).value).toBe("");
  });

  it("saves one team at a time and announces the receipt politely", async () => {
    mocks.updateTeamCoverageMinimumAction.mockResolvedValue({
      ok: true,
      value: {
        message: "Operations minimum set to 1 person.",
        minimum: 1,
      },
    });
    renderClient();

    fireEvent.change(minimumInput("Operations"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Operations" }));

    const status = screen.getByRole("status");
    await waitFor(() =>
      expect(status.textContent).toBe("Operations minimum set to 1 person.")
    );
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(mocks.updateTeamCoverageMinimumAction).toHaveBeenCalledOnce();
    expect(mocks.updateTeamCoverageMinimumAction).toHaveBeenCalledWith({
      minimum: 1,
      organisationId,
      teamId: "70000000-0000-4000-8000-000000000011",
    });
  });

  it("sends null when the field is cleared", async () => {
    mocks.updateTeamCoverageMinimumAction.mockResolvedValue({
      ok: true,
      value: { message: "Customer support minimum cleared.", minimum: null },
    });
    renderClient();

    fireEvent.change(minimumInput("Customer support"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save Customer support" })
    );

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Customer support minimum cleared."
      )
    );
    expect(mocks.updateTeamCoverageMinimumAction).toHaveBeenCalledWith(
      expect.objectContaining({ minimum: null })
    );
  });

  it("keeps the entered value and shows the error beside the field on failure", async () => {
    mocks.updateTeamCoverageMinimumAction.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "Minimum must be between 0 and 7 people.",
      },
      ok: false,
    });
    renderClient();
    const input = minimumInput("Customer support") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save Customer support" })
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Minimum must be between 0 and 7 people.");
    expect(alert.querySelector("svg")).not.toBeNull();
    expect(input.value).toBe("9");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("shows the empty state with a link to People", () => {
    renderClient([]);

    expect(
      screen.getByText("No teams yet. Teams come from your people records.")
    ).toBeDefined();
    const link = screen.getByRole("link", { name: "Open People" });
    expect(link.getAttribute("href")).toBe(`/people?org=${organisationId}`);
    expect(screen.queryByRole("list")).toBeNull();
    expect(within(document.body).queryByRole("spinbutton")).toBeNull();
  });
});

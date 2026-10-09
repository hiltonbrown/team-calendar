import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createOwnFeedAction: vi.fn() }));
vi.mock("./_actions", () => ({
  createOwnFeedAction: mocks.createOwnFeedAction,
}));

const { OwnFeedActions } = await import("./own-feed-actions");
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("OwnFeedActions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when no own feed can be created", () => {
    const { container } = render(
      <OwnFeedActions
        canCreatePersonal={false}
        canCreateTeam={false}
        organisationId={organisationId}
      />
    );
    expect(container.childElementCount).toBe(0);
  });

  it("creates the chosen feed kind", async () => {
    mocks.createOwnFeedAction.mockResolvedValue({
      ok: true,
      value: { created: true, feedId: "f" },
    });
    render(
      <OwnFeedActions
        canCreatePersonal
        canCreateTeam
        organisationId={organisationId}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create my team feed" })
    );
    await waitFor(() =>
      expect(mocks.createOwnFeedAction).toHaveBeenCalledWith({
        kind: "team",
        organisationId,
      })
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the service error and lets the person retry", async () => {
    mocks.createOwnFeedAction.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "Your current plan has reached its active feed limit.",
      },
      ok: false,
    });
    render(
      <OwnFeedActions
        canCreatePersonal
        canCreateTeam={false}
        organisationId={organisationId}
      />
    );
    const button = screen.getByRole("button", {
      name: "Create my calendar feed",
    }) as HTMLButtonElement;
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "active feed limit"
    );
    // The transition settles after the error renders; retry is available
    // once it has.
    await waitFor(() => expect(button.disabled).toBe(false));
  });
});

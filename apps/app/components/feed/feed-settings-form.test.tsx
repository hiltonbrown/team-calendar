import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateFeedAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/(authenticated)/feeds/_actions", () => ({
  updateFeedAction: mocks.updateFeedAction,
}));

class ResizeObserverMock {
  disconnect() {
    // Radix measures controls; jsdom has no layout to observe.
  }
  observe() {
    // No layout in jsdom.
  }
  unobserve() {
    // No layout in jsdom.
  }
}
globalThis.ResizeObserver = ResizeObserverMock;

const { FeedSettingsForm } = await import("./feed-settings-form");
const feed = {
  id: "00000000-0000-4000-8000-000000000101",
  includesPublicHolidays: false,
  name: "Ava's calendar",
  privacyMode: "named" as const,
};
const organisationId = "00000000-0000-4000-8000-000000000001";
const PRIVATE_OPTION = /Private/;

describe("FeedSettingsForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves only the fields that changed", async () => {
    mocks.updateFeedAction.mockResolvedValue({
      ok: true,
      value: { feedId: feed.id },
    });
    render(<FeedSettingsForm feed={feed} organisationId={organisationId} />);
    fireEvent.change(screen.getByLabelText("Feed name"), {
      target: { value: "Ava's leave" },
    });
    fireEvent.click(screen.getByRole("radio", { name: PRIVATE_OPTION }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.updateFeedAction).toHaveBeenCalledWith({
        feedId: feed.id,
        organisationId,
        patch: { name: "Ava's leave", privacyMode: "private" },
      })
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Feed settings saved"
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("disables saving until something changes", () => {
    render(<FeedSettingsForm feed={feed} organisationId={organisationId} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("keeps the input and shows the error when saving fails", async () => {
    mocks.updateFeedAction.mockResolvedValue({
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage feeds.",
      },
      ok: false,
    });
    render(<FeedSettingsForm feed={feed} organisationId={organisationId} />);
    fireEvent.click(
      screen.getByRole("switch", { name: "Include public holidays" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "do not have permission"
    );
    expect(
      screen
        .getByRole("switch", { name: "Include public holidays" })
        .getAttribute("aria-checked")
    ).toBe("true");
  });
});

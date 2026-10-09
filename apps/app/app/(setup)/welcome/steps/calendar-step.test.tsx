import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeWelcomeAction: vi.fn(),
  createOwnFeedAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("../_actions", () => ({
  completeWelcomeAction: mocks.completeWelcomeAction,
}));
vi.mock("@/app/(authenticated)/feeds/_actions", () => ({
  createOwnFeedAction: mocks.createOwnFeedAction,
}));

const { CalendarStep } = await import("./calendar-step");
const organisationId = "00000000-0000-4000-8000-000000000001";
const ORG_INSTEAD = /organisation's calendar instead/;
const FEED_LIMIT = /active feed limit/;
const orgFeed = {
  name: "All staff",
  subscribeUrl: "https://api.test/ical/org.ics",
};

describe("CalendarStep", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates a personal feed on request", async () => {
    mocks.createOwnFeedAction.mockResolvedValue({
      ok: true,
      value: { created: true, feedId: "f" },
    });
    render(
      <CalendarStep
        fallbackFeed={orgFeed}
        homeHref="/"
        organisationId={organisationId}
        personalFeed={null}
      />
    );
    expect(screen.queryByDisplayValue(orgFeed.subscribeUrl)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Create my calendar feed" })
    );
    await waitFor(() =>
      expect(mocks.createOwnFeedAction).toHaveBeenCalledWith({
        kind: "personal",
        organisationId,
      })
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("falls back to the organisation feed when the plan limit blocks creation", async () => {
    mocks.createOwnFeedAction.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "Your current plan has reached its active feed limit.",
      },
      ok: false,
    });
    render(
      <CalendarStep
        fallbackFeed={orgFeed}
        homeHref="/"
        organisationId={organisationId}
        personalFeed={null}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create my calendar feed" })
    );
    expect(await screen.findByDisplayValue(orgFeed.subscribeUrl)).toBeTruthy();
    expect(screen.getByText(ORG_INSTEAD)).toBeTruthy();
    expect(screen.getByText(FEED_LIMIT)).toBeTruthy();
  });

  it("shows the full personal feed URL and completes on Done or Skip", async () => {
    mocks.completeWelcomeAction.mockResolvedValue({
      ok: true,
      value: { redirectTo: "/" },
    });
    render(
      <CalendarStep
        fallbackFeed={null}
        homeHref="/"
        organisationId={organisationId}
        personalFeed={{
          name: "Mia's calendar",
          subscribeUrl: "https://api.test/ical/own.ics",
        }}
      />
    );
    expect(
      screen.getByDisplayValue("https://api.test/ical/own.ics")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(mocks.completeWelcomeAction).toHaveBeenCalledWith({
        organisationId,
        skipped: false,
      })
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(mocks.completeWelcomeAction).toHaveBeenLastCalledWith({
        organisationId,
        skipped: true,
      })
    );
  });
});

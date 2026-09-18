import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedTable, type FeedTableItem } from "./feed-table";

const mocks = vi.hoisted(() => ({
  archiveFeedAction: vi.fn(),
  pauseFeedAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  restoreFeedAction: vi.fn(),
  resumeFeedAction: vi.fn(),
  rotateTokenAction: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/app/(authenticated)/feeds/_actions", () => ({
  archiveFeedAction: (input: unknown) => mocks.archiveFeedAction(input),
  pauseFeedAction: (input: unknown) => mocks.pauseFeedAction(input),
  restoreFeedAction: (input: unknown) => mocks.restoreFeedAction(input),
  resumeFeedAction: (input: unknown) => mocks.resumeFeedAction(input),
  rotateTokenAction: (input: unknown) => mocks.rotateTokenAction(input),
}));
const feed: FeedTableItem = {
  activeTokenHint: { hint: "abcd", lastUsedAt: null },
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  description: "Team leave",
  id: "00000000-0000-4000-8000-000000000101",
  includesPublicHolidays: false,
  lastRenderedAt: null,
  name: "Team availability",
  privacyMode: "named",
  scopeCount: 1,
  scopeSummary: "All people",
  status: "active",
  subscribeUrl: "https://calendar.example/ical/tc1.feed-token.signature.ics",
};

function openManageMenu(feedName = feed.name) {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `Manage ${feedName}` }),
    { button: 0, ctrlKey: false }
  );
}

describe("FeedTable", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("preserves organisation context in feed navigation", () => {
    render(
      <FeedTable
        canManage
        feeds={[feed]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue="00000000-0000-4000-8000-000000000001"
      />
    );

    expect(
      screen.getByRole("link", { name: feed.name }).getAttribute("href")
    ).toBe(`/feeds/${feed.id}?org=00000000-0000-4000-8000-000000000001`);
  });

  it("keeps archive confirmation open and announces action failures", async () => {
    mocks.archiveFeedAction.mockResolvedValueOnce({
      error: { code: "unknown_error", message: "Archive failed." },
      ok: false,
    });
    render(
      <FeedTable
        canManage
        feeds={[feed]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    openManageMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive feed" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Archive failed."
    );
    expect(screen.getByRole("button", { name: "Archive feed" })).toBeDefined();
  });

  it("announces clipboard rejection", async () => {
    mocks.writeText.mockRejectedValueOnce(new Error("Clipboard blocked"));
    render(
      <FeedTable
        canManage
        feeds={[feed]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not copy the URL"
      );
    });
  });

  it("shows and copies the full subscribe URL without rotating", async () => {
    mocks.writeText.mockResolvedValueOnce(undefined);
    render(
      <FeedTable
        canManage={false}
        feeds={[feed]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    expect(
      screen.getByRole("textbox", {
        name: `Subscribe URL for ${feed.name}`,
      })
    ).toHaveProperty("value", feed.subscribeUrl);
    expect(screen.queryByRole("button", { name: "Rotate token" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));

    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith(feed.subscribeUrl);
      expect(screen.getByRole("status").textContent).toContain(
        "Subscribe URL copied."
      );
    });
  });

  it("keeps paused feed URLs visible and shows no copy control without an active URL", () => {
    const { rerender } = render(
      <FeedTable
        canManage
        feeds={[{ ...feed, status: "paused" }]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    expect(
      screen.getByRole("textbox", { name: `Subscribe URL for ${feed.name}` })
    ).toHaveProperty("value", feed.subscribeUrl);

    rerender(
      <FeedTable
        canManage
        feeds={[{ ...feed, status: "archived", subscribeUrl: null }]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    expect(screen.getByText("No active subscribe URL")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Copy URL" })).toBeNull();
  });

  it("restores an archived feed into its safe paused state", async () => {
    mocks.restoreFeedAction.mockResolvedValueOnce({ ok: true, value: {} });
    render(
      <FeedTable
        canManage
        feeds={[{ ...feed, status: "archived" }]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    openManageMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore" }));

    await waitFor(() => {
      expect(mocks.restoreFeedAction).toHaveBeenCalledWith({
        feedId: feed.id,
        organisationId: "00000000-0000-4000-8000-000000000001",
      });
      expect(screen.getByRole("status").textContent).toContain(
        "Feed restored in a paused state"
      );
    });
  });

  it("returns focus to the management menu after cancelling confirmation", async () => {
    render(
      <FeedTable
        canManage
        feeds={[feed]}
        organisationId="00000000-0000-4000-8000-000000000001"
        orgQueryValue={null}
      />
    );

    const manageButton = screen.getByRole("button", {
      name: `Manage ${feed.name}`,
    });
    openManageMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rotate token" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(manageButton);
    });
  });
});

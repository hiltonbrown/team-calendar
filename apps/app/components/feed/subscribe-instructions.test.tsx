import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type SubscribableFeed,
  SubscribeInstructions,
  toWebcalUrl,
} from "./subscribe-instructions";

const writeText = vi.fn();
const ACTIVE_FEED_COPY_PATTERN = /An active feed is needed/;

const feed: SubscribableFeed = {
  id: "feed-1",
  name: "All staff",
  subscribeUrl: "https://calendar.example/ical/tc1.token.signature.ics",
};

describe("SubscribeInstructions", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    cleanup();
    await waitFor(() => {
      expect(document.body.childElementCount).toBe(0);
      expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
      expect(document.body.style.pointerEvents).toBe("");
    });
    vi.clearAllMocks();
  });

  it("renders an actionable empty state when there is no active feed", () => {
    render(<SubscribeInstructions feeds={[]} />);

    expect(
      screen.getByRole("heading", { name: "How to subscribe" })
    ).toBeDefined();
    expect(screen.getByText(ACTIVE_FEED_COPY_PATTERN)).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("distinguishes a load failure from an organisation with no active feed", () => {
    render(<SubscribeInstructions feeds={[]} hasLoadError />);

    expect(
      screen.getByRole("heading", {
        name: "Subscription options are unavailable",
      })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    expect(screen.queryByText(ACTIVE_FEED_COPY_PATTERN)).toBeNull();
  });

  it("shows the complete URL and creates direct webcal actions", () => {
    render(<SubscribeInstructions feeds={[feed]} />);

    expect(
      screen.getByRole("textbox", { name: "Subscribe URL for All staff" })
    ).toHaveProperty("value", feed.subscribeUrl);
    expect(
      screen.getByRole("link", { name: "Open Apple Calendar" })
    ).toHaveProperty("href", toWebcalUrl(feed.subscribeUrl));
    expect(
      screen.getByRole("link", { name: "Open calendar app" })
    ).toHaveProperty("href", toWebcalUrl(feed.subscribeUrl));
  });

  it("updates every launch action when another feed is selected", async () => {
    const managersFeed: SubscribableFeed = {
      id: "feed-2",
      name: "Managers",
      subscribeUrl: "https://calendar.example/ical/tc1.managers.signature.ics",
    };
    writeText.mockResolvedValueOnce(undefined);
    render(<SubscribeInstructions feeds={[feed, managersFeed]} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(await screen.findByText("Subscribe URL copied.")).toBeDefined();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const managersOption = await screen.findByRole("option", {
      name: managersFeed.name,
    });
    managersOption.focus();
    fireEvent.click(managersOption);

    await waitFor(() => {
      const combobox = screen.getByRole("combobox");
      expect(
        screen.getByRole("textbox", {
          name: `Subscribe URL for ${managersFeed.name}`,
        })
      ).toHaveProperty("value", managersFeed.subscribeUrl);
      expect(
        screen.queryByRole("option", { name: managersFeed.name })
      ).toBeNull();
      expect(combobox.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(combobox);
      expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
      expect(document.body.style.pointerEvents).toBe("");
      expect(screen.queryByText("Subscribe URL copied.")).toBeNull();
    });
    expect(
      screen.getByRole("link", { name: "Open Apple Calendar" })
    ).toHaveProperty("href", toWebcalUrl(managersFeed.subscribeUrl));
    expect(screen.getByRole("button", { name: "Copy URL" })).toBeDefined();
  });

  it("copies the selected URL while opening Google Calendar setup", async () => {
    writeText.mockResolvedValueOnce(undefined);
    render(<SubscribeInstructions feeds={[feed]} />);

    const googleLink = screen.getByRole("link", {
      name: "Open Google Calendar",
    });
    expect(googleLink).toHaveProperty(
      "href",
      "https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
    );

    fireEvent.click(googleLink);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(feed.subscribeUrl);
      expect(screen.getByRole("status").textContent).toContain(
        "Subscribe URL copied"
      );
    });
  });

  it("keeps a visible recovery path when provider copying is blocked", async () => {
    writeText.mockRejectedValueOnce(new Error("Clipboard blocked"));
    render(<SubscribeInstructions feeds={[feed]} />);

    fireEvent.click(screen.getByRole("link", { name: "Open Outlook" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Use the Copy URL button"
    );
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      feed.subscribeUrl
    );
  });
});

describe("toWebcalUrl", () => {
  it("preserves the complete feed path while changing the protocol", () => {
    expect(toWebcalUrl(feed.subscribeUrl)).toBe(
      "webcal://calendar.example/ical/tc1.token.signature.ics"
    );
  });
});

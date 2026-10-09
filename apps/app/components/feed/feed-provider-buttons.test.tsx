import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedProviderButtons } from "./feed-provider-buttons";

const url = "https://api.example.test/ical/tc1.token.sig.ics";
const webcal = "webcal://api.example.test/ical/tc1.token.sig.ics";
const writeText = vi.fn();
const APPLE = /Add to Apple Calendar: All staff/;
const GOOGLE = /Add to Google Calendar: All staff/;
const OUTLOOK = /Add to Outlook: All staff/;

describe("FeedProviderButtons", () => {
  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });
  afterEach(cleanup);

  it("links each provider to its subscribe target", () => {
    render(<FeedProviderButtons feedName="All staff" subscribeUrl={url} />);
    expect(screen.getByRole("link", { name: APPLE }).getAttribute("href")).toBe(
      webcal
    );
    expect(
      screen.getByRole("link", { name: GOOGLE }).getAttribute("href")
    ).toBe("https://calendar.google.com/calendar/u/0/r/settings/addbyurl");
    expect(
      screen.getByRole("link", { name: OUTLOOK }).getAttribute("target")
    ).toBe("_blank");
    expect(
      screen
        .getByRole("link", { name: "Open in Outlook desktop" })
        .getAttribute("href")
    ).toBe(webcal);
  });

  it("copies the exact URL before opening a web provider", async () => {
    writeText.mockResolvedValue(undefined);
    render(<FeedProviderButtons feedName="All staff" subscribeUrl={url} />);
    fireEvent.click(screen.getByRole("link", { name: GOOGLE }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Paste it into Google Calendar"
    );
  });

  it("explains how to recover when copying fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<FeedProviderButtons feedName="All staff" subscribeUrl={url} />);
    fireEvent.click(screen.getByRole("link", { name: OUTLOOK }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not copy the URL"
    );
  });

  it("tells the person what to do if a webcal hand-off does nothing", async () => {
    render(<FeedProviderButtons feedName="All staff" subscribeUrl={url} />);
    fireEvent.click(screen.getByRole("link", { name: APPLE }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "If nothing opened"
    );
    expect(writeText).not.toHaveBeenCalled();
  });
});

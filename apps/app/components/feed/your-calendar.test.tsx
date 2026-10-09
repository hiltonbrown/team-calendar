import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { YourCalendar } from "./your-calendar";

const ADD_TO_APPLE = /Add to Apple Calendar/;
const ADD_TO_ANY = /Add to/;
const LOAD_FAILED = /could not be loaded/;

const feed = {
  id: "feed_1",
  name: "Ava's calendar",
  privacyMode: "named" as const,
  scopeSummary: "Just you",
  subscribeUrl: "https://api.example.test/ical/tc1.token.sig.ics",
};

describe("YourCalendar", () => {
  afterEach(cleanup);

  it("shows the recommended feed with its full URL and provider actions", () => {
    render(<YourCalendar feed={feed} />);
    expect(screen.getByRole("heading", { name: "Your calendar" })).toBeTruthy();
    expect(screen.getByText("Ava's calendar")).toBeTruthy();
    const field = screen.getByLabelText(
      "Subscribe URL for Ava's calendar"
    ) as HTMLInputElement;
    expect(field.value).toBe(feed.subscribeUrl);
    expect(screen.getByRole("link", { name: ADD_TO_APPLE })).toBeTruthy();
    expect(screen.getByText("Other calendar apps")).toBeTruthy();
  });

  it("explains when no feed is available and shows supplied actions", () => {
    render(
      <YourCalendar
        actions={<button type="button">Create my calendar feed</button>}
        feed={null}
      />
    );
    expect(screen.getByText("No calendar feed is available yet.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create my calendar feed" })
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: ADD_TO_ANY })).toBeNull();
  });

  it("shows a recoverable load error", () => {
    render(<YourCalendar feed={null} hasLoadError />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByText(LOAD_FAILED)).toBeTruthy();
  });

  it("renders a supplied notice such as a paused own feed", () => {
    render(
      <YourCalendar feed={feed} notice={<p>Your calendar feed is paused</p>} />
    );
    expect(screen.getByText("Your calendar feed is paused")).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OtherFeedsList } from "./other-feeds-list";

const ADD_SALES_TO_GOOGLE = /Add to Google Calendar: Sales team/;

const active = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sales team",
  privacyMode: "masked" as const,
  scopeSummary: "Sales",
  status: "active" as const,
  subscribeUrl: "https://api.example.test/ical/tc1.sales.sig.ics",
};
const paused = {
  ...active,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Ops team",
  status: "paused" as const,
};

describe("OtherFeedsList", () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it("renders nothing without feeds", () => {
    const { container } = render(
      <OtherFeedsList feeds={[]} orgQueryValue={null} />
    );
    expect(container.childElementCount).toBe(0);
  });

  it("lists feeds compactly without URLs and links to detail", () => {
    render(<OtherFeedsList feeds={[active, paused]} orgQueryValue="org_1" />);
    expect(
      screen.getByRole("link", { name: "Sales team" }).getAttribute("href")
    ).toBe(`/feeds/${active.id}?org=org_1`);
    expect(screen.queryByDisplayValue(active.subscribeUrl)).toBeNull();
    expect(screen.getByText("Paused, not updating")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add Ops team to a calendar" })
    ).toBeNull();
  });

  it("opens provider choices for a feed from its Add button", async () => {
    render(<OtherFeedsList feeds={[active]} orgQueryValue={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add Sales team to a calendar" })
    );
    expect(
      await screen.findByRole("link", {
        name: ADD_SALES_TO_GOOGLE,
      })
    ).toBeTruthy();
  });
});

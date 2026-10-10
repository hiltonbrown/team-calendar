import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeedOversightList, type OversightFeed } from "./feed-oversight-list";

const now = new Date("2026-10-09T10:00:00.000Z");
const ORG = "00000000-0000-4000-8000-000000000001";
const FRESH_FETCH = /2 days ago/;
const NO_MATCH = /No feeds match these filters/;
const NO_FEEDS = /No feeds yet/;

function feed(overrides: Partial<OversightFeed> = {}): OversightFeed {
  return {
    createdByName: "Ava Person",
    createdByUserId: "user_ava",
    id: "00000000-0000-4000-8000-000000000101",
    kind: "personal",
    lastFetchedAt: new Date("2026-10-07T10:00:00.000Z"),
    name: "Ava's calendar",
    status: "active",
    ...overrides,
  };
}

describe("FeedOversightList", () => {
  afterEach(cleanup);

  it("shows type, creator, status and last fetch for each feed", () => {
    render(
      <FeedOversightList
        feeds={[feed()]}
        hasActiveFilters={false}
        now={now}
        orgQueryValue={ORG}
      />
    );
    expect(
      screen.getByRole("link", { name: "Ava's calendar" }).getAttribute("href")
    ).toBe(`/feeds/00000000-0000-4000-8000-000000000101?org=${ORG}`);
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.getByText("Ava Person")).toBeTruthy();
    const time = screen.getByText(FRESH_FETCH).closest("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-10-07T10:00:00.000Z");
    expect(time?.getAttribute("title")).toContain("7 October 2026");
    expect(screen.queryByText("Not fetched in 30 days")).toBeNull();
  });

  it("flags never-fetched and stale active feeds with text, not colour alone", () => {
    render(
      <FeedOversightList
        feeds={[
          feed({ id: "a", lastFetchedAt: null, name: "Never" }),
          feed({
            id: "b",
            lastFetchedAt: new Date("2026-08-01T00:00:00.000Z"),
            name: "Stale",
          }),
        ]}
        hasActiveFilters={false}
        now={now}
        orgQueryValue={null}
      />
    );
    expect(screen.getAllByText("Never fetched")).toHaveLength(1);
    expect(screen.getByText("Not fetched in 30 days")).toBeTruthy();
  });

  it("does not flag paused or archived feeds", () => {
    render(
      <FeedOversightList
        feeds={[
          feed({ id: "a", lastFetchedAt: null, status: "paused" }),
          feed({
            id: "b",
            lastFetchedAt: new Date("2026-01-01T00:00:00.000Z"),
            status: "archived",
          }),
        ]}
        hasActiveFilters={false}
        now={now}
        orgQueryValue={null}
      />
    );
    expect(screen.queryByText("Not fetched in 30 days")).toBeNull();
    expect(screen.getAllByText("Never fetched")).toHaveLength(1);
  });

  it("describes the creator when no person record exists", () => {
    render(
      <FeedOversightList
        feeds={[
          feed({ createdByName: null, id: "a", kind: "organisation" }),
          feed({
            createdByName: null,
            createdByUserId: null,
            id: "b",
            kind: "organisation",
          }),
        ]}
        hasActiveFilters={false}
        now={now}
        orgQueryValue={null}
      />
    );
    expect(screen.getByText("Administrator")).toBeTruthy();
    expect(screen.getByText("Set up automatically")).toBeTruthy();
  });

  it("distinguishes empty and filtered-empty states", () => {
    const { rerender } = render(
      <FeedOversightList
        feeds={[]}
        hasActiveFilters
        now={now}
        orgQueryValue={null}
      />
    );
    expect(screen.getByText(NO_MATCH)).toBeTruthy();
    rerender(
      <FeedOversightList
        feeds={[]}
        hasActiveFilters={false}
        now={now}
        orgQueryValue={null}
      />
    );
    expect(screen.getByText(NO_FEEDS)).toBeTruthy();
  });
});

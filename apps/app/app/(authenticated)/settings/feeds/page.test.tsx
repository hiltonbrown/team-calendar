import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  filterBarMounted: vi.fn(),
  getFeedOversightCounts: vi.fn(),
  getSettings: vi.fn(),
  listFeeds: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({ getSettings: mocks.getSettings }));
vi.mock("@repo/feeds", () => ({
  getFeedOversightCounts: mocks.getFeedOversightCounts,
  listFeeds: mocks.listFeeds,
  normaliseRole: (role: string | null) => role,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("./feeds-client", () => ({
  FeedsClient: () => <div>Feed defaults</div>,
}));
vi.mock("./feed-oversight-filters", async () => {
  const { useState } = await import("react");
  return {
    FeedOversightFilterBar: () => {
      useState(() => mocks.filterBarMounted());
      return <div>Feed filters</div>;
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/feeds",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const Page = (await import("./page")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";
const COUNTS = /5 feeds active or paused, including 3 personal feeds/;

function feed(index: number) {
  return {
    createdByName: null,
    createdByUserId: null,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: "organisation",
    lastFetchedAt: null,
    name: `Feed ${index}`,
    status: "active",
  };
}

describe("Settings feeds page", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: "user_admin" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
      orgQueryValue: organisationId,
    });
    mocks.getSettings.mockResolvedValue({ ok: true, value: {} });
    mocks.getFeedOversightCounts.mockResolvedValue({
      ok: true,
      value: { personal: 3, total: 5 },
    });
    mocks.listFeeds.mockResolvedValue({ ok: true, value: [feed(1)] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("passes URL filters to the feed list and states the counts", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          org: organisationId,
          search: "sales",
          status: "archived",
          type: "self",
        }),
      })
    );
    expect(mocks.requirePageRole).toHaveBeenCalledWith("org:admin");
    expect(mocks.listFeeds).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        filters: { search: "sales", status: ["archived"], type: ["self"] },
        organisationId,
        pagination: { cursor: undefined, pageSize: 50 },
      })
    );
    expect(screen.getByText(COUNTS)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "New feed" }).getAttribute("href")
    ).toBe(`/feeds/new?org=${organisationId}`);
    expect(screen.queryByRole("navigation", { name: "Feed pages" })).toBeNull();
  });

  it("resets the filter controls when the URL filters change, not the page", async () => {
    const pageFor = (params: Record<string, string>) =>
      Page({
        searchParams: Promise.resolve({ org: organisationId, ...params }),
      });
    const { rerender } = render(await pageFor({ search: "sales" }));
    rerender(await pageFor({ cursor: feed(1).id, search: "sales" }));
    expect(mocks.filterBarMounted).toHaveBeenCalledTimes(1);
    rerender(await pageFor({ search: "support" }));
    expect(mocks.filterBarMounted).toHaveBeenCalledTimes(2);
  });

  it("links to the next page with the last feed as cursor, keeping filters", async () => {
    const page = Array.from({ length: 50 }, (_, index) => feed(index + 1));
    mocks.listFeeds.mockResolvedValue({ ok: true, value: page });
    render(
      await Page({
        searchParams: Promise.resolve({ org: organisationId, type: "team" }),
      })
    );
    const next = screen.getByRole("link", { name: "Next page" });
    const url = new URL(next.getAttribute("href") ?? "", "https://app.test");
    expect(url.pathname).toBe("/settings/feeds");
    expect(url.searchParams.get("cursor")).toBe(page[49]?.id);
    expect(url.searchParams.getAll("type")).toEqual(["team"]);
    expect(url.searchParams.get("org")).toBe(organisationId);
    expect(screen.queryByRole("link", { name: "First page" })).toBeNull();
  });

  it("offers a way back to the first page", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          cursor: "00000000-0000-4000-8000-000000000050",
          org: organisationId,
        }),
      })
    );
    const first = screen.getByRole("link", { name: "First page" });
    expect(first.getAttribute("href")).not.toContain("cursor");
  });
});

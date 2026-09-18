import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  listFeeds: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  requirePageRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/feeds", () => ({
  listFeeds: mocks.listFeeds,
  normaliseRole: (role: string | null) => role,
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("./feed-filter-bar", () => ({
  FeedFilterBar: () => <div>Feed filters</div>,
}));
vi.mock("@/components/feed/subscribe-instructions", () => ({
  SubscribeInstructions: () => <div>Subscribe instructions</div>,
}));
vi.mock("@/components/feed/feed-table", () => ({
  FeedTable: () => <div>Feed table</div>,
}));

const Page = (await import("./page")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("FeedPage empty states", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
      orgQueryValue: organisationId,
    });
    mocks.listFeeds.mockResolvedValue({ ok: true, value: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers creation when the organisation has no feeds", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({ org: organisationId }),
      })
    );

    expect(screen.getByText("No feeds yet")).toBeDefined();
    expect(screen.getByRole("link", { name: "Create feed" })).toBeDefined();
  });

  it("explains a filtered empty result without offering creation", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          org: organisationId,
          search: "leadership",
        }),
      })
    );

    expect(screen.getByText("No feeds match these filters")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Create feed" })).toBeNull();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  personFindMany: vi.fn(),
  requireActiveOrgPageContext: vi.fn(),
  teamFindMany: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@repo/database", () => ({
  database: {
    person: { findMany: mocks.personFindMany },
    team: { findMany: mocks.teamFindMany },
  },
}));
vi.mock("@repo/feeds", () => ({
  normaliseRole: (role: string | null) => role,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  requireActiveOrgPageContext: mocks.requireActiveOrgPageContext,
}));
vi.mock("../../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("@/components/feed/feed-create-form", () => ({
  FeedCreateForm: () => <form aria-label="Create feed" />,
}));

const Page = (await import("./page")).default;
const organisationId = "00000000-0000-4000-8000-000000000001";

describe("NewFeedPage", () => {
  beforeEach(() => {
    mocks.requireActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId,
      orgQueryValue: organisationId,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("gives viewers a safe return without loading creation data", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });

    render(
      await Page({
        searchParams: Promise.resolve({ org: organisationId }),
      })
    );

    expect(screen.getByText("Feed creation is read-only")).toBeDefined();
    expect(screen.queryByRole("form", { name: "Create feed" })).toBeNull();
    expect(mocks.teamFindMany).not.toHaveBeenCalled();
    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Return to feeds" }).getAttribute("href")
    ).toBe(`/feeds?org=${organisationId}`);
  });

  it("loads creation data for administrators", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.teamFindMany.mockResolvedValue([]);
    mocks.personFindMany.mockResolvedValue([]);

    render(
      await Page({
        searchParams: Promise.resolve({ org: organisationId }),
      })
    );

    expect(screen.getByRole("form", { name: "Create feed" })).toBeDefined();
    expect(mocks.teamFindMany).toHaveBeenCalledOnce();
    expect(mocks.personFindMany).toHaveBeenCalledOnce();
  });
});

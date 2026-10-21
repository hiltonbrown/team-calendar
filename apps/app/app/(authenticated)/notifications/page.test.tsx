import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  listAllTypes: vi.fn(),
  listForUser: vi.fn(),
  listPreferences: vi.fn(),
  requirePageRole: vi.fn(),
  resolveActiveOrgPageContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/helpers", () => ({ requireOrg: async () => "org_1" }));
vi.mock("@repo/database", () => ({
  TENANT_READ_TRANSACTION_OPTIONS: {},
  withTenantDb: async (
    _account: string,
    run: (db: unknown) => Promise<unknown>
  ) =>
    run({ organisation: { findFirst: async () => ({ name: "Company A" }) } }),
}));
vi.mock("@repo/auth/server", () => ({
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/notifications", () => ({
  listAllTypes: mocks.listAllTypes,
  listForUser: mocks.listForUser,
  listPreferences: mocks.listPreferences,
}));
vi.mock("@repo/notifications/components/provider", () => ({
  NotificationsProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/auth/require-page-role", () => ({
  requirePageRole: mocks.requirePageRole,
}));
vi.mock("@/lib/server/require-active-org-page-context", () => ({
  resolveActiveOrgPageContext: mocks.resolveActiveOrgPageContext,
}));
vi.mock("../components/header", () => ({
  Header: ({ page }: { page: string }) => <header>{page}</header>,
}));
vi.mock("./notifications-client", () => ({
  NotificationsClient: ({ filters }: { filters: { tab: string } }) => (
    <div>
      {filters.tab === "preferences"
        ? "Notification preferences"
        : "No notifications yet"}
    </div>
  ),
}));

const Page = (await import("./page")).default;

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.resolveActiveOrgPageContext.mockResolvedValue({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      orgQueryValue: null,
    });
    mocks.listAllTypes.mockReturnValue([]);
    mocks.listForUser.mockResolvedValue({
      ok: true,
      value: { nextCursor: null, notifications: [], unreadCount: 0 },
    });
    mocks.listPreferences.mockResolvedValue({ ok: true, value: [] });
  });

  it("defaults to the feed tab", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Notifications")).toBeDefined();
    expect(screen.getByText("No notifications yet")).toBeDefined();
  });

  it("renders preferences tab from URL state", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({ tab: "preferences" }),
      })
    );

    expect(screen.getByText("Notification preferences")).toBeDefined();
  });
});

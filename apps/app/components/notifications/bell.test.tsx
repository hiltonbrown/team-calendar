import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsBell } from "./bell";

const LEAVE_SUBMITTED_REGEX = /Leave submitted/i;

const mocks = vi.hoisted(() => ({
  connection: {
    status: "open" as "closed" | "connecting" | "open",
    version: 0,
  },
  listRecentUnreadAction: vi.fn(),
  markAllAsReadAction: vi.fn(),
  markAsReadAction: vi.fn(),
  push: vi.fn(),
  refreshUnreadCountAction: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({
    connectionVersion: mocks.connection.version,
    status: mocks.connection.status,
    subscribe: mocks.subscribe,
  }),
}));
vi.mock("@/app/(authenticated)/notifications/_actions", () => ({
  listRecentUnreadAction: (args: unknown) => mocks.listRecentUnreadAction(args),
  markAllAsReadAction: (args: unknown) => mocks.markAllAsReadAction(args),
  markAsReadAction: (args: unknown) => mocks.markAsReadAction(args),
  refreshUnreadCountAction: (args: unknown) =>
    mocks.refreshUnreadCountAction(args),
}));

describe("NotificationsBell", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.connection.status = "open";
    mocks.connection.version = 0;
  });

  it("renders trigger with 44px touch target, opens list, and handles notification click", async () => {
    mocks.markAsReadAction.mockResolvedValueOnce({
      ok: true,
      value: { unreadCount: 6 },
    });

    render(
      <NotificationsBell
        initialRecent={[
          {
            actionUrl: "/plans/123",
            body: "Ava submitted leave.",
            createdAt: new Date().toISOString(),
            iconKey: "inbox-in",
            id: "n_1",
            organisationId: "00000000-0000-4000-8000-000000000002",
            organisationName: "Company B",
            title: "Leave submitted",
          },
        ]}
        initialUnreadCount={7}
      />
    );

    const trigger = screen.getByLabelText("Notifications, 7 unread");
    expect(trigger.className).toContain("size-11");

    fireEvent.click(trigger);

    const listitem = await screen.findByRole("listitem");
    expect(listitem).toBeDefined();

    const notifBtn = screen.getByRole("button", {
      name: LEAVE_SUBMITTED_REGEX,
    });
    expect(notifBtn).toBeDefined();
    expect(screen.getByText(COMPANY_B_PATTERN)).toBeDefined();

    fireEvent.click(notifBtn);

    expect(mocks.markAsReadAction).toHaveBeenCalledWith({
      notificationId: "n_1",
    });

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        "/plans/123?org=00000000-0000-4000-8000-000000000002"
      );
    });
  });

  it("opens the account-wide notifications inbox", () => {
    render(<NotificationsBell initialRecent={[]} initialUnreadCount={0} />);

    fireEvent.click(screen.getByLabelText("Notifications, 0 unread"));

    expect(
      screen.getByRole("link", { name: "View all" }).getAttribute("href")
    ).toBe("/notifications");
  });

  it("surfaces mark-as-read failures without navigating away", async () => {
    mocks.markAsReadAction.mockResolvedValueOnce({
      error: { code: "unknown_error", message: "Could not mark as read." },
      ok: false,
    });

    render(
      <NotificationsBell
        initialRecent={[
          {
            actionUrl: "/plans/123",
            body: "Ava submitted leave.",
            createdAt: new Date().toISOString(),
            iconKey: "inbox-in",
            id: "n_1",
            organisationId: "00000000-0000-4000-8000-000000000001",
            organisationName: "Company A",
            title: "Leave submitted",
          },
        ]}
        initialUnreadCount={1}
      />
    );

    fireEvent.click(screen.getByLabelText("Notifications, 1 unread"));
    fireEvent.click(
      screen.getByRole("button", { name: LEAVE_SUBMITTED_REGEX })
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not mark as read."
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("announces when live notifications are reconnecting", () => {
    mocks.connection.status = "connecting";

    render(<NotificationsBell initialRecent={[]} initialUnreadCount={0} />);

    fireEvent.click(screen.getByLabelText("Notifications, 0 unread"));

    expect(screen.getByRole("status").textContent).toContain(
      "Connecting to live notifications"
    );
  });

  it("formats large badges as 99+", () => {
    render(<NotificationsBell initialRecent={[]} initialUnreadCount={120} />);

    expect(screen.getByText("99+")).toBeDefined();
  });

  it("disables Mark all as read button when unread count is zero", () => {
    render(<NotificationsBell initialRecent={[]} initialUnreadCount={0} />);

    fireEvent.click(screen.getByLabelText("Notifications, 0 unread"));

    const markAllBtn = screen.getByRole("button", {
      name: "Mark all as read",
    }) as HTMLButtonElement;
    expect(markAllBtn.disabled).toBe(true);
  });
});

const COMPANY_B_PATTERN = /Company B/;

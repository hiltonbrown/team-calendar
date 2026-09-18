import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationsClient,
  usePrefersReducedMotion,
} from "./notifications-client";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  updatePreferenceAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/notifications",
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({ subscribe: vi.fn(() => () => undefined) }),
}));
vi.mock("./_actions", () => ({
  markAllAsReadAction: vi.fn(),
  markAsReadAction: vi.fn(),
  updatePreferenceAction: mocks.updatePreferenceAction,
}));

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("handles reduced motion preference, preference changes, and listener cleanup", () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null;
    const removeEventListener = vi.fn();
    const addEventListener = vi.fn(
      (_event: string, cb: (e: MediaQueryListEvent) => void) => {
        listener = cb;
      }
    );

    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      addEventListener,
      addListener: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener,
      removeListener: vi.fn(),
    }));

    vi.stubGlobal("matchMedia", matchMediaMock);

    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    expect(addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );

    act(() => {
      if (listener) {
        listener({ matches: true } as MediaQueryListEvent);
      }
    });
    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });
});

describe("NotificationsClient", () => {
  beforeEach(() => {
    mocks.updatePreferenceAction.mockResolvedValue({ ok: true, value: {} });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders unread items without border-l-2 side stripe", () => {
    const { container } = render(
      <NotificationsClient
        filters={{
          category: [],
          cursor: null,
          dateFrom: null,
          dateTo: null,
          focus: null,
          tab: "feed",
          type: [],
          unreadOnly: false,
        }}
        nextCursor={null}
        notifications={[
          {
            actionLabel: "View",
            actionUrl: null,
            body: "Test body",
            category: "leave_lifecycle",
            createdAt: new Date().toISOString(),
            iconKey: "inbox-in",
            id: "n1",
            isUnread: true,
            label: "test",
            objectId: null,
            objectType: null,
            readAt: null,
            title: "Unread title",
            type: "leave_submitted",
          },
        ]}
        notificationTypes={[]}
        organisationId="org-1"
        orgQueryValue={null}
        preferences={[]}
        unreadCount={1}
      />
    );

    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(article?.className).not.toContain("border-l-2");
    expect(article?.className).toContain("bg-primary/10");
  });

  it("keeps categories primary, discloses types and clears all filters", () => {
    renderNotifications({
      filters: {
        ...baseProps.filters,
        category: ["approval_flow"],
        type: ["leave_submitted"],
        unreadOnly: true,
      },
    });

    expect(screen.getByRole("button", { name: "Approval flow" })).toBeDefined();
    expect(screen.getByText("Filter by event type")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Leave submitted" })
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.push).toHaveBeenCalledWith("/notifications?tab=feed");
  });

  it("labels switches and explains why the last channel is disabled", () => {
    renderNotifications({
      filters: { ...baseProps.filters, tab: "preferences" },
      preferences: [{ ...preference, emailEnabled: false, inAppEnabled: true }],
    });

    const inApp = screen.getByRole("switch", { name: "In-app" });
    expect(inApp.getAttribute("aria-describedby")).toBe(
      "leave_submitted-in-app-description"
    );
    expect(
      screen.getByText("At least one delivery channel must stay enabled.")
    ).toBeDefined();
    expect(screen.getByRole("switch", { name: "Email" })).toBeDefined();
  });

  it("announces saved preference updates and rolls back failures", async () => {
    const { unmount } = renderNotifications({
      filters: { ...baseProps.filters, tab: "preferences" },
      preferences: [preference],
    });

    fireEvent.click(screen.getByRole("switch", { name: "In-app" }));
    expect(screen.getByText("Saving…")).toBeDefined();
    expect(await screen.findByText("Saved")).toBeDefined();

    mocks.updatePreferenceAction.mockResolvedValueOnce({
      error: { code: "unknown_error", message: "Save failed." },
      ok: false,
    });
    unmount();
    renderNotifications({
      filters: { ...baseProps.filters, tab: "preferences" },
      preferences: [preference],
    });
    const email = screen.getByRole("switch", { name: "Email" });
    fireEvent.click(email);
    expect(
      await screen.findByText("Could not save. Previous setting restored.")
    ).toBeDefined();
    await waitFor(() =>
      expect(email.getAttribute("data-state")).toBe("checked")
    );
  });

  it("moves focus to a linked preference row and announces it", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    renderNotifications({
      filters: {
        ...baseProps.filters,
        focus: "leave_submitted",
        tab: "preferences",
      },
      preferences: [preference],
    });

    const row = screen
      .getByText(preference.label)
      .closest("div[tabindex='-1']");
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(
      screen.getByText("Focused the linked notification setting.")
    ).toBeDefined();
  });

  it("uses the notification body as the single primary navigation action", () => {
    renderNotifications({ notifications: [notification] });

    expect(
      screen.getByRole("button", { name: "Unread title, open notification" })
    ).toBeDefined();
    expect(screen.queryByRole("link", { name: "View" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeDefined();
  });
});

type NotificationsProps = ComponentProps<typeof NotificationsClient>;

const notification: NotificationsProps["notifications"][number] = {
  actionLabel: "View",
  actionUrl: "/leave-approvals",
  body: "Test body",
  category: "approval_flow",
  createdAt: new Date().toISOString(),
  iconKey: "inbox-in",
  id: "n1",
  isUnread: true,
  label: "Leave submitted",
  objectId: null,
  objectType: null,
  readAt: null,
  title: "Unread title",
  type: "leave_submitted",
};

const preference: NotificationsProps["preferences"][number] = {
  category: "approval_flow",
  description: "A team member submitted leave.",
  emailEnabled: true,
  inAppEnabled: true,
  isDefault: false,
  label: "Leave submitted for approval",
  type: "leave_submitted",
};

const baseProps: NotificationsProps = {
  filters: {
    category: [],
    cursor: null,
    dateFrom: null,
    dateTo: null,
    focus: null,
    tab: "feed",
    type: [],
    unreadOnly: false,
  },
  nextCursor: null,
  notifications: [],
  notificationTypes: [
    {
      actionLabel: "View request",
      defaultChannels: { email: true, inApp: true },
      description: "A team member submitted leave.",
      emailTemplate: "LeaveSubmitted",
      iconKey: "inbox-in",
      label: "Leave submitted for approval",
      shortLabel: "Leave submitted",
      supportsActionUrl: true,
      type: "leave_submitted",
      userFacingCategory: "approval_flow",
    },
  ],
  organisationId: "00000000-0000-4000-8000-000000000001",
  orgQueryValue: null,
  preferences: [],
  unreadCount: 0,
};

function renderNotifications(overrides: Partial<NotificationsProps> = {}) {
  return render(<NotificationsClient {...baseProps} {...overrides} />);
}

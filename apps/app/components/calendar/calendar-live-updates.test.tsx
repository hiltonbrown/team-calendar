import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarLiveUpdates } from "./calendar-live-updates";

let eventHandler: ((event: unknown) => void) | null = null;
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  subscribe: vi.fn((fn: (event: unknown) => void) => {
    eventHandler = fn;
    return () => {
      eventHandler = null;
    };
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({
    subscribe: mocks.subscribe,
  }),
}));

describe("CalendarLiveUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    eventHandler = null;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("subscribes on mount and refreshes router on terminal sync for active org", () => {
    render(<CalendarLiveUpdates organisationId="org_model_1" />);
    expect(eventHandler).not.toBeNull();

    act(() => {
      eventHandler?.({
        payload: {
          organisationId: "org_model_1",
          runId: "run_1",
          runType: "leave_records",
          status: "succeeded",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Calendar updated from recent sync.")
    ).toBeDefined();
  });

  it("deduplicates repeat terminal events for the same run", () => {
    render(<CalendarLiveUpdates organisationId="org_model_1" />);

    act(() => {
      eventHandler?.({
        payload: {
          organisationId: "org_model_1",
          runId: "run_1",
          runType: "leave_records",
          status: "succeeded",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    // Duplicate event
    act(() => {
      eventHandler?.({
        payload: {
          organisationId: "org_model_1",
          runId: "run_1",
          runType: "leave_records",
          status: "succeeded",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores sync events for a different organisation", () => {
    render(<CalendarLiveUpdates organisationId="org_model_1" />);

    act(() => {
      eventHandler?.({
        payload: {
          organisationId: "org_model_OTHER",
          runId: "run_1",
          runType: "leave_records",
          status: "succeeded",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ignores non-terminal sync events (e.g. running)", () => {
    render(<CalendarLiveUpdates organisationId="org_model_1" />);

    act(() => {
      eventHandler?.({
        payload: {
          organisationId: "org_model_1",
          runId: "run_1",
          runType: "leave_records",
          status: "running",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes router on leave notification events", () => {
    render(<CalendarLiveUpdates organisationId="org_model_1" />);

    act(() => {
      eventHandler?.({
        payload: {
          actionUrl: "/calendar",
          body: "Leave submitted",
          category: "leave",
          createdAt: new Date().toISOString(),
          notificationId: "notif_1",
          title: "New Leave",
          type: "leave_submitted",
          unreadCount: 1,
        },
        type: "notification.created",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Calendar updated from new leave activity.")
    ).toBeDefined();
  });

  it("coalesces multiple rapid events into a single refresh", () => {
    render(<CalendarLiveUpdates organisationId="org_model_1" />);

    act(() => {
      eventHandler?.({
        payload: {
          organisationId: "org_model_1",
          runId: "run_1",
          runType: "leave_records",
          status: "succeeded",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(100);

      eventHandler?.({
        payload: {
          organisationId: "org_model_1",
          runId: "run_2",
          runType: "people",
          status: "succeeded",
          xeroTenantId: "tenant_1",
        },
        type: "sync.run_status_changed",
      });

      vi.advanceTimersByTime(350);
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

import type { RunListItem, TenantSummary } from "@repo/availability";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncClient } from "./sync-client";

interface TestSyncEvent {
  payload: { organisationId: string };
  type: string;
}

const mocks = vi.hoisted(() => ({
  dispatchManualSyncAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  subscribe: vi.fn<
    (listener: (event: TestSyncEvent) => void) => () => undefined
  >(() => () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({ subscribe: mocks.subscribe }),
}));
vi.mock("./_actions", () => ({
  dispatchManualSyncAction: (input: unknown) =>
    mocks.dispatchManualSyncAction(input),
}));

const organisationId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000011";
const runId = "00000000-0000-4000-8000-000000000021";
const summary: TenantSummary = {
  connectionStatus: "active",
  currentFailedRuns: 0,
  currentPartialSuccessRuns: 0,
  currentRun: null,
  failedRunsLast30Days: 0,
  lastApprovalReconciliation: null,
  lastLeaveBalancesSync: null,
  lastLeaveRecordsSync: null,
  lastPeopleSync: null,
  lastRefreshedAt: null,
  lastRun: null,
  payrollRegion: "AU",
  pendingFailedRecords: 0,
  syncPausedAt: null,
  tenantName: "Team Calendar AU",
  totalRunsLast30Days: 0,
  xeroTenantId: tenantId,
};
const run: RunListItem = {
  completedAt: new Date("2026-08-01T00:01:00.000Z"),
  durationSeconds: 60,
  errorSummary: null,
  hasFailedRecords: false,
  id: runId,
  recordsFailed: 0,
  recordsFetched: 2,
  recordsSkipped: 0,
  recordsUpserted: 2,
  runType: "people",
  startedAt: new Date("2026-08-01T00:00:00.000Z"),
  status: "succeeded",
  tenantName: "Team Calendar AU",
  triggeredByUserDisplay: "Admin",
  triggerType: "manual",
  xeroTenantId: tenantId,
};

describe("SyncClient", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers every registered run type through one recommended action", async () => {
    mocks.dispatchManualSyncAction.mockResolvedValueOnce({
      ok: true,
      value: { queued: true },
    });
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[run]}
        summaries={[summary]}
      />
    );

    for (const name of [
      "People (recommended)",
      "Leave records",
      "Leave balances",
      "Approval reconciliation",
    ]) {
      expect(screen.getByRole("option", { name })).toBeDefined();
    }

    fireEvent.change(screen.getByRole("combobox", { name: "Sync type" }), {
      target: { value: "leave_balances" },
    });
    const runButton = screen.getByRole("button", { name: "Run sync" });
    expect((runButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(runButton);

    expect((await screen.findByRole("status")).textContent).toContain(
      "Sync queued."
    );
    expect(mocks.dispatchManualSyncAction).toHaveBeenCalledWith({
      organisationId,
      runType: "leave_balances",
      xeroTenantId: tenantId,
    });
  });

  it("keeps pending state scoped to the selected tenant and operation", async () => {
    const pending = deferred<{
      ok: true;
      value: { queued: true };
    }>();
    mocks.dispatchManualSyncAction.mockReturnValueOnce(pending.promise);
    const secondTenantId = "00000000-0000-4000-8000-000000000012";
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[
          summary,
          {
            ...summary,
            tenantName: "Team Calendar NZ",
            xeroTenantId: secondTenantId,
          },
        ]}
      />
    );

    const firstTenant = screen.getByRole("article", {
      name: "Team Calendar AU",
    });
    const secondTenant = screen.getByRole("article", {
      name: "Team Calendar NZ",
    });
    fireEvent.click(
      within(firstTenant).getByRole("button", { name: "Run sync" })
    );

    const firstAction = within(firstTenant).getByRole("button", {
      name: "Running",
    });
    expect(firstAction.getAttribute("aria-busy")).toBe("true");
    expect((firstAction as HTMLButtonElement).disabled).toBe(true);
    const secondAction = within(secondTenant).getByRole("button", {
      name: "Run sync",
    });
    expect(secondAction.getAttribute("aria-busy")).toBe("false");
    expect((secondAction as HTMLButtonElement).disabled).toBe(false);

    pending.resolve({ ok: true, value: { queued: true } });
    await screen.findByText("Sync queued.");
  });

  it("exposes connection and pause reasons without relying on title text", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[{ ...summary, connectionStatus: "revoked" }]}
      />
    );

    const action = screen.getByRole("button", { name: "Run sync" });
    const descriptionId = action.getAttribute("aria-describedby");
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
      "Reconnect Xero in Settings before running a sync."
    );
    expect(action.getAttribute("title")).toBeNull();
  });

  it("clears active filters while preserving the organisation", () => {
    render(
      <SyncClient
        filters={{ status: ["failed"] }}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[summary]}
      />
    );

    expect(screen.getByText("1 filter active.")).toBeDefined();
    expect(screen.getByText("No matching runs")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mocks.push).toHaveBeenCalledWith(`/sync?org=${organisationId}`);
  });

  it("provides complete mobile history and a focusable wide table", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[{ ...run, recordsFailed: 2 }]}
        summaries={[summary]}
      />
    );

    expect(
      screen
        .getByRole("link", { name: "View run details" })
        .getAttribute("href")
    ).toBe(`/sync/${runId}?org=${organisationId}`);
    expect(
      screen.getByText("Failed records").nextElementSibling?.textContent
    ).toBe("2");
    expect(
      screen
        .getByRole("region", { name: "Sync run history table" })
        .getAttribute("tabindex")
    ).toBe("0");
  });

  it("preserves organisation context in run links", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[run]}
        summaries={[summary]}
      />
    );

    expect(
      screen.getByRole("link", { name: "View" }).getAttribute("href")
    ).toBe(`/sync/${runId}?org=${organisationId}`);
  });

  it("labels resolved failures as history without showing a current failure", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[
          {
            ...summary,
            failedRunsLast30Days: 1,
            lastRun: {
              completedAt: new Date("2026-08-02T00:01:00.000Z"),
              id: runId,
              recordsFailed: 0,
              recordsUpserted: 2,
              runType: "people",
              startedAt: new Date("2026-08-02T00:00:00.000Z"),
              status: "succeeded",
            },
            totalRunsLast30Days: 2,
          },
        ]}
      />
    );

    expect(screen.queryByText("Xero sync failed")).toBeNull();
    expect(
      screen.getByText(
        "Historical context: 1 run failed out of 2 runs in the past 30 days."
      )
    ).toBeDefined();
    expect(screen.getByText("active")).toBeDefined();
  });

  it("shows unresolved failed records even when no sync type is still failing", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[{ ...summary, pendingFailedRecords: 1 }]}
      />
    );

    expect(screen.getByText("Xero sync failed")).toBeDefined();
    expect(
      screen.getByText(
        "1 failed record needs review before downstream data can be trusted."
      )
    ).toBeDefined();
  });

  it("shows a destructive state only for a current failed or unresolved sync", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[
          {
            ...summary,
            currentFailedRuns: 1,
            currentPartialSuccessRuns: 1,
            failedRunsLast30Days: 1,
            lastRun: {
              completedAt: new Date("2026-08-02T00:01:00.000Z"),
              id: runId,
              recordsFailed: 3,
              recordsUpserted: 0,
              runType: "people",
              startedAt: new Date("2026-08-02T00:00:00.000Z"),
              status: "failed",
            },
            pendingFailedRecords: 3,
            totalRunsLast30Days: 1,
          },
        ]}
      />
    );

    expect(screen.getByText("Xero sync failed")).toBeDefined();
    expect(
      screen.getByText(
        "1 sync type is still failing. 1 other sync type completed with issues. 3 failed records need review before downstream data can be trusted."
      )
    ).toBeDefined();
    expect(screen.queryByText("Xero sync partially completed")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Review affected runs" })
        .getAttribute("href")
    ).toBe(
      `/sync?status=failed%2Cpartial_success&xeroTenantId=${tenantId}&org=${organisationId}`
    );
  });

  it("shows partial success as a warning with counts and a review path", () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        runs={[]}
        summaries={[
          {
            ...summary,
            currentPartialSuccessRuns: 1,
            failedRunsLast30Days: 0,
            lastRun: {
              completedAt: new Date("2026-08-02T00:01:00.000Z"),
              id: runId,
              recordsFailed: 2,
              recordsUpserted: 5,
              runType: "people",
              startedAt: new Date("2026-08-02T00:00:00.000Z"),
              status: "partial_success",
            },
            pendingFailedRecords: 2,
            totalRunsLast30Days: 1,
          },
        ]}
      />
    );

    expect(screen.queryByText("Xero sync failed")).toBeNull();
    expect(screen.getByText("Xero sync partially completed")).toBeDefined();
    expect(
      screen.getByText(
        "1 sync type completed with issues. 2 failed records need review before downstream data can be trusted."
      )
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Review affected runs" })
        .getAttribute("href")
    ).toBe(
      `/sync?status=failed%2Cpartial_success&xeroTenantId=${tenantId}&org=${organisationId}`
    );
  });

  it("refreshes only for this organisation's sync events", async () => {
    render(
      <SyncClient
        filters={{}}
        nextCursor={null}
        organisationId={organisationId}
        orgQueryValue={null}
        runs={[]}
        summaries={[]}
      />
    );

    const listener = mocks.subscribe.mock.calls[0]?.[0];
    if (!listener) {
      throw new Error("Expected sync event subscription");
    }

    listener({
      payload: { organisationId: "00000000-0000-4000-8000-000000000999" },
      type: "sync.run_status_changed",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    listener({
      payload: { organisationId },
      type: "sync.run_status_changed",
    });

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = (_value) => undefined;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

import type { RunDetail, TenantSummary } from "@repo/availability";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncRunDetailClient } from "./sync-run-detail-client";

interface TestSyncEvent {
  payload: { organisationId: string; runId: string };
  type: string;
}

const mocks = vi.hoisted(() => ({
  cancelRunAction: vi.fn(),
  dispatchManualSyncAction: vi.fn(),
  exportFailedRecordsCsvAction: vi.fn(),
  refresh: vi.fn(),
  subscribe: vi.fn<
    (listener: (event: TestSyncEvent) => void) => () => undefined
  >(() => () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@repo/notifications/components/provider", () => ({
  useNotificationEvents: () => ({ subscribe: mocks.subscribe }),
}));
vi.mock("../_actions", () => ({
  cancelRunAction: (input: unknown) => mocks.cancelRunAction(input),
  dispatchManualSyncAction: (input: unknown) =>
    mocks.dispatchManualSyncAction(input),
  exportFailedRecordsCsvAction: (input: unknown) =>
    mocks.exportFailedRecordsCsvAction(input),
}));

const organisationId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000011";
const runId = "00000000-0000-4000-8000-000000000021";
const detail: RunDetail = {
  failedRecords: [],
  run: {
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
  },
  timeline: [],
};
const tenantSummary: TenantSummary = {
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

describe("SyncRunDetailClient", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an accessible reason when re-run is unavailable", () => {
    renderDetail({ ...tenantSummary, connectionStatus: "revoked" });

    const action = screen.getByRole("button", { name: "Re-run this sync" });
    const descriptionId = action.getAttribute("aria-describedby");
    expect(action.hasAttribute("disabled")).toBe(true);
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
      "Reconnect Xero in Settings before re-running this sync."
    );
    expect(action.getAttribute("title")).toBeNull();
  });

  it("protects re-run from duplicate submission with specific progress", async () => {
    const pending = deferred<{ ok: true; value: { queued: true } }>();
    mocks.dispatchManualSyncAction.mockReturnValueOnce(pending.promise);
    renderDetail(tenantSummary);

    fireEvent.click(screen.getByRole("button", { name: "Re-run this sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue re-run" }));

    const action = screen.getByRole("button", { name: "Queuing re-run…" });
    expect(action.getAttribute("aria-busy")).toBe("true");
    expect(action.hasAttribute("disabled")).toBe(true);
    fireEvent.click(action);
    expect(mocks.dispatchManualSyncAction).toHaveBeenCalledTimes(1);

    pending.resolve({ ok: true, value: { queued: true } });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Sync queued."
    );
  });

  it("protects cancellation from duplicate submission with specific progress", async () => {
    const pending = deferred<{
      ok: true;
      value: { cancellationRequested: true; eventQueued: true };
    }>();
    mocks.cancelRunAction.mockReturnValueOnce(pending.promise);
    render(
      <SyncRunDetailClient
        detail={{
          ...detail,
          run: {
            ...detail.run,
            completedAt: null,
            durationSeconds: null,
            status: "running",
          },
        }}
        organisationId={organisationId}
        orgQueryValue={organisationId}
        tenantSummary={tenantSummary}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel running sync" })
    );

    const action = screen.getByRole("button", {
      name: "Requesting cancellation…",
    });
    expect(action.getAttribute("aria-busy")).toBe("true");
    expect(action.hasAttribute("disabled")).toBe(true);
    fireEvent.click(action);
    expect(mocks.cancelRunAction).toHaveBeenCalledTimes(1);

    pending.resolve({
      ok: true,
      value: { cancellationRequested: true, eventQueued: true },
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Cancellation requested."
    );
  });
});

function renderDetail(summary: TenantSummary) {
  return render(
    <SyncRunDetailClient
      detail={detail}
      organisationId={organisationId}
      orgQueryValue={organisationId}
      tenantSummary={summary}
    />
  );
}

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

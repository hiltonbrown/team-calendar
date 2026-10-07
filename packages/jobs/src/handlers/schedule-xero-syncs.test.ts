import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  dispatchSyncEvent: vi.fn(),
  listSchedulableXeroConnections: vi.fn(),
  purgeClosedXeroOAuthSessions: vi.fn(),
  recoverXeroImportDispatch: vi.fn(),
  refreshDormantXeroAuthorisations: vi.fn(),
}));
vi.mock("./recover-xero-import-dispatch", () => ({
  recoverXeroImportDispatch: mocks.recoverXeroImportDispatch,
}));
vi.mock("@repo/database", () => ({
  listSchedulableXeroConnections: mocks.listSchedulableXeroConnections,
}));
vi.mock("@repo/xero", () => ({
  purgeClosedXeroOAuthSessions: mocks.purgeClosedXeroOAuthSessions,
  refreshDormantXeroAuthorisations: mocks.refreshDormantXeroAuthorisations,
}));
vi.mock("../events", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../events")>();
  return {
    ...mod,
    dispatchSyncEvent: mocks.dispatchSyncEvent,
  };
});

import type { SchedulableXeroConnection } from "@repo/database";
import { getScheduledSyncEventId, type RegisteredSyncRunType } from "../events";

const { dueRunTypes, scheduleXeroSyncsFunction, scheduleXeroSyncsPage } =
  await import("./schedule-xero-syncs");
const { functions } = await import("../functions");
describe("scheduleXeroSyncs Coordinator", () => {
  const providerTenantId = "00000000-0000-4000-8000-000000000099";
  const baseTenant: SchedulableXeroConnection = {
    clerkOrgId: "org_clerk_1",
    connectionId: "00000000-0000-4000-8000-000000000010",
    connectionStatus: "active",
    disconnectedAt: null,
    lastApprovalStateReconciledAt: null,
    lastLeaveBalancesSyncAt: null,
    lastLeaveRecordsSyncAt: null,
    lastPeopleSyncAt: null,
    organisationId: "00000000-0000-4000-8000-000000000001",
    payrollRegion: "AU",
    syncPausedAt: null,
    timezone: "Australia/Sydney",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.purgeClosedXeroOAuthSessions.mockResolvedValue({
      ok: true,
      value: { scrubbed: 0 },
    });
  });
  describe("dueRunTypes decision function", () => {
    it("treats null last-sync timestamps as immediately due", () => {
      // Wednesday 10:00 AM Sydney (Business hours)
      const now = new Date("2026-08-12T00:00:00.000Z"); // 10:00 AEST
      const due = dueRunTypes(baseTenant, now);
      expect(due).toEqual(["people", "leave_records", "leave_balances"]);
    });
    it("evaluates 15-minute cadence for people & leave records during weekday business hours", () => {
      // Wednesday 10:00 AM Sydney (Business hours)
      const now = new Date("2026-08-12T00:00:00.000Z");
      const fourteenMinAgo = new Date(now.getTime() - 14 * 60 * 1000);
      const sixteenMinAgo = new Date(now.getTime() - 16 * 60 * 1000);
      const tenantNotDue: SchedulableXeroConnection = {
        ...baseTenant,
        lastLeaveBalancesSyncAt: fourteenMinAgo,
        lastLeaveRecordsSyncAt: fourteenMinAgo,
        lastPeopleSyncAt: fourteenMinAgo,
      };
      expect(dueRunTypes(tenantNotDue, now)).toEqual([]);
      const tenantDue: SchedulableXeroConnection = {
        ...baseTenant,
        lastLeaveBalancesSyncAt: fourteenMinAgo,
        lastLeaveRecordsSyncAt: sixteenMinAgo,
        lastPeopleSyncAt: sixteenMinAgo,
      };
      expect(dueRunTypes(tenantDue, now)).toEqual(["people", "leave_records"]);
    });
    it("evaluates 60-minute cadence outside business hours and on weekends", () => {
      // Saturday 12:00 PM Sydney
      const saturday = new Date("2026-08-15T02:00:00.000Z");
      const thirtyMinAgo = new Date(saturday.getTime() - 30 * 60 * 1000);
      const sixtyFiveMinAgo = new Date(saturday.getTime() - 65 * 60 * 1000);
      const tenantNotDue: SchedulableXeroConnection = {
        ...baseTenant,
        lastLeaveBalancesSyncAt: thirtyMinAgo,
        lastLeaveRecordsSyncAt: thirtyMinAgo,
        lastPeopleSyncAt: thirtyMinAgo,
      };
      expect(dueRunTypes(tenantNotDue, saturday)).toEqual([]);
      const tenantDue: SchedulableXeroConnection = {
        ...baseTenant,
        lastLeaveBalancesSyncAt: sixtyFiveMinAgo,
        lastLeaveRecordsSyncAt: sixtyFiveMinAgo,
        lastPeopleSyncAt: sixtyFiveMinAgo,
      };
      expect(dueRunTypes(tenantDue, saturday)).toEqual([
        "people",
        "leave_records",
        "leave_balances",
      ]);
    });
    it("schedules approval reconciliation once per local night (01:00-02:59 local time)", () => {
      // Wednesday 01:30 AM Sydney local time = Tuesday 15:30 UTC
      const wednesdayNight = new Date("2026-08-11T15:30:00.000Z");
      const tenant: SchedulableXeroConnection = {
        ...baseTenant,
        lastApprovalStateReconciledAt: null,
        lastLeaveBalancesSyncAt: wednesdayNight,
        lastLeaveRecordsSyncAt: wednesdayNight,
        lastPeopleSyncAt: wednesdayNight,
      };
      const due = dueRunTypes(tenant, wednesdayNight);
      expect(due).toContain("approval_state_reconciliation");
      // If already reconciled today (Wednesday local date 2026-08-12)
      const reconciledToday: SchedulableXeroConnection = {
        ...tenant,
        lastApprovalStateReconciledAt: new Date("2026-08-11T15:05:00.000Z"), // 01:05 AM Wed
      };
      expect(dueRunTypes(reconciledToday, wednesdayNight)).not.toContain(
        "approval_state_reconciliation"
      );
    });
    it("returns empty array for invalid or missing timezone", () => {
      const now = new Date();
      expect(dueRunTypes({ ...baseTenant, timezone: null }, now)).toEqual([]);
      expect(
        dueRunTypes({ ...baseTenant, timezone: "Invalid/TZ" }, now)
      ).toEqual([]);
    });
  });
  describe("scheduleXeroSyncsPage", () => {
    it("dispatches due sync events with deterministic event IDs and updates counts", async () => {
      const now = new Date("2026-08-12T00:00:00.000Z"); // Wed 10:00 AM Sydney
      mocks.listSchedulableXeroConnections.mockResolvedValue({
        ok: true,
        value: {
          connections: [
            baseTenant,
            {
              ...baseTenant,
              connectionId: "00000000-0000-4000-8000-000000000020",
              timezone: "Invalid/Timezone",
            },
          ],
        },
      });
      mocks.dispatchSyncEvent.mockResolvedValue({
        ok: true,
        value: { eventName: "sync-xero-people", ids: ["evt_1"], queued: true },
      });
      const res = await scheduleXeroSyncsPage({ now });
      expect(res.ok).toBe(true);
      if (!res.ok) {
        return;
      }
      expect(res.value.scanned).toBe(2);
      expect(res.value.invalidTimezone).toBe(1);
      expect(res.value.dispatched).toBe(3); // people, leave_records, leave_balances for tenant 1
      const expectedRunTypes = [
        "people",
        "leave_records",
        "leave_balances",
      ] satisfies RegisteredSyncRunType[];
      expect(mocks.dispatchSyncEvent.mock.calls).toEqual(
        expectedRunTypes.map((runType) => [
          {
            clerkOrgId: baseTenant.clerkOrgId,
            connectionId: baseTenant.connectionId,
            organisationId: baseTenant.organisationId,
            runType,
            ...(runType === "people" || runType === "leave_records"
              ? { mode: "incremental" }
              : {}),
            triggerType: "scheduled",
          },
          {
            eventId: getScheduledSyncEventId(
              baseTenant.connectionId,
              runType,
              now
            ),
          },
        ])
      );
      for (const [event] of mocks.dispatchSyncEvent.mock.calls) {
        expect(event.connectionId).not.toBe(providerTenantId);
      }
    });
    it("isolates dispatch failures so one failing tenant/event does not drop the rest", async () => {
      const now = new Date("2026-08-12T00:00:00.000Z");
      mocks.listSchedulableXeroConnections.mockResolvedValue({
        ok: true,
        value: {
          connections: [baseTenant],
        },
      });
      // Fail first dispatch, succeed second
      mocks.dispatchSyncEvent
        .mockResolvedValueOnce({
          error: { code: "dispatch_failed", message: "Network error" },
          ok: false,
        })
        .mockResolvedValue({
          ok: true,
          value: {
            eventName: "sync-xero-leave-records",
            ids: ["evt_2"],
            queued: true,
          },
        });
      const res = await scheduleXeroSyncsPage({ now });
      expect(res.ok).toBe(true);
      if (!res.ok) {
        return;
      }
      expect(res.value.scanned).toBe(1);
      expect(res.value.dispatched).toBe(2); // 2 of 3 succeeded
      expect(mocks.dispatchSyncEvent).toHaveBeenCalledTimes(3);
    });
    it("returns failure when listing schedulable Xero tenants fails", async () => {
      mocks.listSchedulableXeroConnections.mockResolvedValue({
        error: { code: "internal", message: "Database failure" },
        ok: false,
      });
      const res = await scheduleXeroSyncsPage();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toEqual({
          code: "internal",
          message: "Database failure",
        });
      }
    });
  });
  describe("scheduleXeroSyncsFunction registration", () => {
    it("runs canonical grant maintenance once after cleanup and recovery before sync dispatch", async () => {
      mocks.refreshDormantXeroAuthorisations.mockResolvedValue({
        ok: true,
        value: { failed: 1, refreshed: 1, scanned: 3, skipped: 1 },
      });
      mocks.listSchedulableXeroConnections.mockResolvedValue({
        ok: true,
        value: { connections: [] },
      });
      const steps: string[] = [];
      const handler: unknown = Reflect.get(scheduleXeroSyncsFunction, "fn");
      if (typeof handler !== "function") {
        throw new Error("Expected registered Inngest handler");
      }
      const result = await handler({
        step: {
          run: (id: string, operation: () => Promise<unknown>) => {
            steps.push(id);
            return operation();
          },
        },
      });
      expect(mocks.purgeClosedXeroOAuthSessions).toHaveBeenCalledTimes(1);
      expect(mocks.recoverXeroImportDispatch).toHaveBeenCalledExactlyOnceWith({
        now: expect.any(Date),
      });
      expect(
        mocks.refreshDormantXeroAuthorisations
      ).toHaveBeenCalledExactlyOnceWith(expect.any(Date));
      expect(steps).toEqual([
        "cleanup-xero-oauth-sessions",
        "recover-xero-import-dispatch",
        "refresh-dormant-authorisations",
        "process-page-0",
      ]);
      expect(result).toEqual({
        authorisations: { failed: 1, refreshed: 1, scanned: 3, skipped: 1 },
        dispatched: 0,
        invalidTimezone: 0,
        scanned: 0,
        skipped: 0,
      });
      expect(JSON.stringify(result)).not.toContain("token");
    });
    it("retries failed grant enumeration instead of reporting maintenance success", async () => {
      mocks.refreshDormantXeroAuthorisations.mockResolvedValue({
        error: { code: "internal", message: "Could not list due grants." },
        ok: false,
      });
      const handler: unknown = Reflect.get(scheduleXeroSyncsFunction, "fn");
      if (typeof handler !== "function") {
        throw new Error("Expected registered Inngest handler");
      }
      await expect(
        handler({
          step: {
            run: (_: string, operation: () => Promise<unknown>) => operation(),
          },
        })
      ).rejects.toThrow("Could not list due grants.");
      expect(mocks.listSchedulableXeroConnections).not.toHaveBeenCalled();
    });
    it("registers scheduleXeroSyncsFunction with id schedule-xero-syncs and 15-min cron", () => {
      expect(functions).toContain(scheduleXeroSyncsFunction);
      const fnOpts = scheduleXeroSyncsFunction.opts;
      expect(fnOpts.id).toBe("schedule-xero-syncs");
      expect(fnOpts.triggers).toEqual([{ cron: "*/15 * * * *" }]);
      const coordinators = functions.filter(
        (fn) => fn.opts.id === "schedule-xero-syncs"
      );
      expect(coordinators).toHaveLength(1);
    });
  });
});

it("dispatches distinct nightly full traversal and normal incremental modes", async () => {
  const tenant = {
    clerkOrgId: "org_1",
    connectionId: "connection",
    connectionStatus: "active",
    disconnectedAt: null,
    lastApprovalStateReconciledAt: new Date("2026-10-07T01:00:00Z"),
    lastFullLeaveRecordsSyncAt: new Date("2026-10-06T01:00:00Z"),
    lastFullPeopleSyncAt: new Date("2026-10-06T01:00:00Z"),
    lastLeaveBalancesSyncAt: new Date("2026-10-07T01:00:00Z"),
    lastLeaveRecordsSyncAt: null,
    lastPeopleSyncAt: null,
    organisationId: "organisation",
    payrollRegion: "AU" as const,
    syncPausedAt: null,
    timezone: "UTC",
  };
  mocks.listSchedulableXeroConnections.mockResolvedValue({
    ok: true,
    value: { connections: [tenant] },
  });
  mocks.dispatchSyncEvent.mockResolvedValue({
    ok: true,
    value: { queued: true },
  });
  await scheduleXeroSyncsPage({ now: new Date("2026-10-07T01:15:00Z") });
  expect(mocks.dispatchSyncEvent).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "full", runType: "people" }),
    expect.anything()
  );
  mocks.dispatchSyncEvent.mockClear();
  await scheduleXeroSyncsPage({ now: new Date("2026-10-07T12:00:00Z") });
  expect(mocks.dispatchSyncEvent).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "incremental", runType: "people" }),
    expect.anything()
  );
});

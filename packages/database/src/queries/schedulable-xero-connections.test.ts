import { beforeEach, expect, test, vi } from "vitest";

const findMany = vi.fn();
vi.mock("../client", () => ({ database: { xeroConnection: { findMany } } }));
const { listSchedulableXeroConnections, findConnectionsNeedingTokenRotation } =
  await import("./schedulable-xero-connections");
beforeEach(() => {
  findMany.mockReset();
});
test("scheduler selects safe routing and health for active unpaused AU connections", async () => {
  findMany.mockResolvedValue([]);
  expect(await listSchedulableXeroConnections()).toEqual({
    ok: true,
    value: { connections: [] },
  });
  const args = findMany.mock.calls[0]?.[0];
  expect(args.where).toEqual({
    authorisation: { status: "active" },
    organisation: { archived_at: null, is_active: true },
    payroll_region: "AU",
    status: "active",
    sync_paused_at: null,
  });
  expect(JSON.stringify(args.select)).not.toContain("token");
});
test("scheduler returns a bounded continuation without provider data", async () => {
  const row = {
    clerk_org_id: "account",
    disconnected_at: null,
    id: "first",
    last_approval_state_reconciled_at: null,
    last_leave_balances_sync_at: null,
    last_leave_records_sync_at: null,
    last_people_sync_at: null,
    organisation: { timezone: "Australia/Sydney" },
    organisation_id: "payroll",
    payroll_region: "AU",
    status: "active",
    sync_paused_at: null,
  };
  findMany.mockResolvedValue([row, { ...row, id: "second" }]);
  const result = await listSchedulableXeroConnections({ limit: 1 });
  expect(result.ok && result.value.nextCursor).toBe("first");
  expect(result.ok && result.value.connections).toHaveLength(1);
});
test("dormant grant maintenance includes paused connections and does not select ciphertext", async () => {
  findMany.mockResolvedValue([]);
  await findConnectionsNeedingTokenRotation({
    now: new Date("2026-10-07T00:00:00Z"),
  });
  const args = findMany.mock.calls[0]?.[0];
  expect(args.where).not.toHaveProperty("sync_paused_at");
  expect(JSON.stringify(args.select)).not.toContain("token");
});

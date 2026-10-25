import { describe, expect, it, vi } from "vitest";
import { dispatchCancelSyncRun, dispatchSyncEvent } from "./sync-events";

const mocks = vi.hoisted(() => ({
  send: vi.fn(
    async (_payload: { name: string; data: Record<string, unknown> }) => ({
      ids: ["event"],
    })
  ),
}));
vi.mock("inngest", () => ({
  Inngest: class {
    send = mocks.send;
  },
}));
vi.mock("@repo/database/tenant-guard", () => ({
  assertNoTenantTransaction: vi.fn(),
}));
const company = "00000000-0000-4000-8000-000000000001";
describe("domain sync event tenancy", () => {
  it("sends account and company in the explicit wire envelope", async () => {
    const result = await dispatchSyncEvent({
      accountId: "account",
      connectionId: "00000000-0000-4000-8000-000000000002",
      organisationId: company,
      runType: "people",
    });
    expect(result.ok).toBe(true);
    expect(mocks.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          account_id: "account",
          organisation_id: company,
        }),
      })
    );
    const data = mocks.send.mock.calls.at(-1)?.[0]?.data;
    expect(data).not.toHaveProperty("accountId");
    expect(data).not.toHaveProperty("organisationId");
  });
  it("includes the same explicit context in cancellation events", async () => {
    await dispatchCancelSyncRun({
      accountId: "account",
      organisationId: company,
      runId: "00000000-0000-4000-8000-000000000003",
    });
    expect(mocks.send).toHaveBeenLastCalledWith({
      data: {
        account_id: "account",
        organisation_id: company,
        runId: "00000000-0000-4000-8000-000000000003",
      },
      name: "cancel-sync-run",
    });
  });
});

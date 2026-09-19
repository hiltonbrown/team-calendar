import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("../client", () => ({
  database: { $queryRaw: mocks.queryRaw },
}));

const { getActivationDashboardSummary } = await import(
  "./activation-dashboard"
);

describe("getActivationDashboardSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([
      {
        feed_accessed: true,
        first_leave_approved: true,
        first_leave_submitted: true,
        initial_sync_completed: true,
        stripe_delivery_failures: 0n,
        sync_failures: 0n,
        xero_connected: true,
        xero_write_failures: 0n,
      },
    ]);
  });

  it("requires all three succeeded sync types and the durable feed milestone", async () => {
    await getActivationDashboardSummary({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    const [strings] = mocks.queryRaw.mock.calls[0] ?? [];
    const sql = Array.from(strings as TemplateStringsArray).join("?");
    expect(sql).toContain("COUNT(DISTINCT run_type) = 3");
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain(
      "run_type IN ('people', 'leave_records', 'leave_balances')"
    );
    expect(sql).toContain("action = 'activation.first_feed_accessed'");
    expect(sql).not.toContain("status = 'completed'");
  });
});

import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  limits: vi.fn(),
  queryRaw: vi.fn(),
  subscription: vi.fn(),
  unhealthy: vi.fn(),
}));
vi.mock("./billing", () => ({
  getPlanLimits: mocks.limits,
  hasUnresolvedStripeEventForOrg: mocks.unhealthy,
}));

import { checkPayrollEntityEntitlement } from "./payroll-entitlements";

const tx = {
  $queryRaw: mocks.queryRaw,
  clerkOrgSubscription: { findFirst: mocks.subscription },
  organisation: { count: mocks.count },
  planLimit: { findFirst: mocks.limits },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.unhealthy.mockResolvedValue(false);
});
test.each([
  ["premium", 4, 5, true],
  ["premium", 5, 5, false],
  ["basic", 1, 1, false],
  ["enterprise", 500, -1, true],
])(
  "%s payroll entitlement at %i companies uses the authoritative count",
  async (plan, current, limit, allowed) => {
    mocks.subscription.mockResolvedValue({ plan_key: plan, status: "active" });
    mocks.count.mockResolvedValue(current);
    mocks.limits.mockResolvedValue({ limit_value: limit });
    await expect(checkPayrollEntityEntitlement("account", tx)).resolves.toEqual(
      { ok: true, value: { allowed, current, limit } }
    );
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.count.mock.invocationCallOrder[0]
    );
  }
);

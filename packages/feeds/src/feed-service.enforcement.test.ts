import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  withinLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/entitlements", () => ({
  withinLimit: mocks.withinLimit,
}));
vi.mock("@repo/database", () => ({
  database: { $transaction: mocks.transaction },
}));

const { createFeed } = await import("./feed-service");

const ORGANISATION = "33333333-3333-4333-8333-333333333333";

function createInput() {
  return {
    actingRole: "org:admin",
    actingUserId: "user_1",
    clerkOrgId: "org_feeds",
    name: "Team feed",
    organisationId: ORGANISATION,
    privacyMode: "named",
    scopes: [{ scopeType: "org" }],
  };
}

describe("createFeed feed limit enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks creation with a validation_error when over the feed limit", async () => {
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: false, current: 2, limit: 2 },
    });

    const result = await createFeed(createInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
    expect(mocks.withinLimit).toHaveBeenCalledWith(
      "org_feeds",
      ORGANISATION,
      "feeds"
    );
    // The over-limit guard returns before opening the write transaction.
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("proceeds to the write path when within the feed limit", async () => {
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: true, current: 1, limit: 2 },
    });
    mocks.transaction.mockRejectedValue(new Error("tx reached"));

    const result = await createFeed(createInput());

    // The guard passed, so the service moved on to the transaction (which we
    // force to fail to keep the test focused on the gate, not feed writes).
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
});

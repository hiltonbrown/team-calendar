import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  list: vi.fn(),
  process: vi.fn(),
}));
vi.mock("@repo/database/queries/xero-cleanup", () => ({
  listDueXeroCleanupAttempts: mocks.list,
}));
vi.mock("@repo/xero", () => ({ processXeroCleanupAttempt: mocks.process }));
vi.mock("@repo/observability/log", () => ({ log: { error: mocks.error } }));

import { reconcileXeroConnections } from "./reconcile-xero-connections";

describe("cleanup sweep", () => {
  beforeEach(() => vi.clearAllMocks());
  it("isolates record failures and passes only scoped routing identifiers", async () => {
    const first = {
      attemptId: "a",
      clerkOrgId: "org",
      organisationId: "entity",
    };
    const second = { ...first, attemptId: "b" };
    mocks.list.mockResolvedValue([first, second]);
    mocks.process
      .mockRejectedValueOnce(new Error("failure"))
      .mockResolvedValueOnce(undefined);
    expect(await reconcileXeroConnections()).toEqual({
      failed: 1,
      processed: 1,
    });
    expect(mocks.process).toHaveBeenNthCalledWith(2, second);
    expect(mocks.list).toHaveBeenCalledWith({
      limit: 50,
      now: expect.any(Date),
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/queries/xero-connection-state", () => ({
  getXeroConnectionState: mocks.query,
}));
const { getXeroConnectionStateForScope } = await import(
  "./xero-connection-state"
);
const scope = {
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};
describe("getXeroConnectionStateForScope", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["connected", "not_connected", "reauthorisation_required"])(
    "preserves %s without credentials",
    async (state) => {
      const result = { ok: true, value: { state } };
      mocks.query.mockResolvedValue(result);
      await expect(getXeroConnectionStateForScope(scope)).resolves.toEqual(
        result
      );
      expect(mocks.query).toHaveBeenCalledWith(scope);
    }
  );
  it("preserves query unavailability", async () => {
    mocks.query.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    await expect(getXeroConnectionStateForScope(scope)).resolves.toEqual({
      error: { code: "state_unavailable" },
      ok: false,
    });
  });
  it("preserves an unavailable state on lookup errors", async () => {
    mocks.query.mockRejectedValue(new Error("database unavailable"));
    await expect(getXeroConnectionStateForScope(scope)).resolves.toEqual({
      error: { code: "state_unavailable" },
      ok: false,
    });
  });
});

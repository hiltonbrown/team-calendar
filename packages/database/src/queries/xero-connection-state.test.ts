import { beforeEach, expect, test, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("../client", () => ({ database: { xeroConnection: { findFirst } } }));
const { getXeroConnectionState } = await import("./xero-connection-state");
const scope = { clerkOrgId: "account", organisationId: "payroll" };
beforeEach(() => {
  findFirst.mockReset();
});
test.each([
  [null, "not_connected"],
  [{ authorisation: null, status: "active" }, "reauthorisation_required"],
  [{ authorisation: null, status: "disconnected" }, "not_connected"],
  [{ authorisation: { status: "active" }, status: "active" }, "connected"],
  [
    { authorisation: { status: "reconnect_required" }, status: "active" },
    "reauthorisation_required",
  ],
  [
    { authorisation: { status: "active" }, status: "reconnect_required" },
    "reauthorisation_required",
  ],
])(
  "derives safe connection state from persisted grant and selected connection",
  async (row, expected) => {
    findFirst.mockResolvedValue(row);
    expect(await getXeroConnectionState(scope)).toEqual({
      ok: true,
      value: { state: expected },
    });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      clerk_org_id: "account",
      organisation_id: "payroll",
    });
  }
);
test("database failures remain unavailable rather than suggesting no connection", async () => {
  findFirst.mockRejectedValue(new Error("database unavailable"));
  expect(await getXeroConnectionState(scope)).toEqual({
    error: { code: "state_unavailable" },
    ok: false,
  });
});

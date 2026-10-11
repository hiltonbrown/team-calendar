import { beforeEach, expect, test, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("../tenant-client", () => ({
  tenantDatabase: () => ({ xeroConnection: { findFirst } }),
}));
const { getXeroConnectionState } = await import("./xero-connection-state");
vi.mock("../system-client", () => ({
  systemDatabase: {
    xeroAuthorisation: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        status:
          where.id === "reconnect-grant" ? "reconnect_required" : "active",
      }),
    },
  },
}));
const scope = { clerkOrgId: "account", organisationId: "payroll" };
beforeEach(() => {
  findFirst.mockReset();
});
test.each([
  [null, "not_connected"],
  [
    { status: "active", xero_authorisation_id: null },
    "reauthorisation_required",
  ],
  [{ status: "disconnected", xero_authorisation_id: null }, "not_connected"],
  [{ status: "active", xero_authorisation_id: "grant" }, "connected"],
  [
    { status: "active", xero_authorisation_id: "reconnect-grant" },
    "reauthorisation_required",
  ],
  [
    { status: "reconnect_required", xero_authorisation_id: "grant" },
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

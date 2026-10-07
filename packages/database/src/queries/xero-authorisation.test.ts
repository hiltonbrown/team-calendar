import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../client", () => ({
  database: { xeroAuthorisation: { findMany: mocks.findMany } },
}));
const queries = await import("./xero-authorisation");
beforeEach(() => {
  mocks.findMany.mockReset();
});

test("due grant selection returns only canonical identity and successful rotation time", async () => {
  const row = {
    id: "grant",
    last_refreshed_at: new Date("2026-08-01T00:00:00Z"),
    provider_app_id: "app",
    xero_user_id: "user",
  };
  expect(queries.listDueXeroAuthorisations).toBeTypeOf("function");
  mocks.findMany.mockResolvedValue([row]);
  expect(
    await queries.listDueXeroAuthorisations(new Date("2026-10-07T00:00:00Z"))
  ).toEqual({
    ok: true,
    value: [row],
  });
  expect(mocks.findMany.mock.calls[0]?.[0].select).toEqual({
    id: true,
    last_refreshed_at: true,
    provider_app_id: true,
    xero_user_id: true,
  });
});

test("due grant selection returns a safe failure when database enumeration fails", async () => {
  expect(queries.listDueXeroAuthorisations).toBeTypeOf("function");
  mocks.findMany.mockRejectedValue(new Error("token-secret-database-details"));
  const result = await queries.listDueXeroAuthorisations(new Date());
  expect(result).toMatchObject({
    error: {
      code: "internal",
      message: "Failed to list due Xero authorisations",
    },
    ok: false,
  });
  expect(JSON.stringify(result)).not.toContain("token-secret");
});

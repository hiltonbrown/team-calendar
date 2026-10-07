import { describe, expect, test, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("../client", () => ({ database: { xeroConnection: { findFirst } } }));
const module = await import("./xero-connections").catch(() => null);
describe("canonical scoped connections", () => {
  test("does not reveal sibling account metadata", async () => {
    expect(module?.getScopedXeroConnection).toBeTypeOf("function");
    findFirst.mockResolvedValue(null);
    const result = await module?.getScopedXeroConnection({
      clerkOrgId: "account",
      connectionId: "connection",
      organisationId: "payroll",
    });
    expect(findFirst).toHaveBeenCalledWith({
      include: { authorisation: true },
      where: {
        clerk_org_id: "account",
        id: "connection",
        organisation_id: "payroll",
      },
    });
    expect(result).toEqual({
      error: { code: "not_connected", message: "Xero is not connected." },
      ok: false,
    });
  });
});

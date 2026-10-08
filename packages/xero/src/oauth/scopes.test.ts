import { describe, expect, it } from "vitest";
import { hasXeroCapability, XERO_SCOPES } from "./scopes";

describe("minimal Xero consent and actual granted capabilities", () => {
  it("requests exactly the four product scopes", () => {
    expect(XERO_SCOPES).toBe(
      "offline_access accounting.settings.read payroll.employees payroll.settings.read"
    );
  });
  it("accepts a write grant for its corresponding read", () => {
    expect(
      hasXeroCapability(["payroll.employees"], "payroll.employees.read")
    ).toBe(true);
    expect(
      hasXeroCapability(["payroll.settings"], "payroll.settings.read")
    ).toBe(true);
  });
  it("requires every requested capability and never treats read as write", () => {
    expect(
      hasXeroCapability(
        ["payroll.employees"],
        ["payroll.employees.read", "payroll.settings.read"]
      )
    ).toBe(false);
    expect(
      hasXeroCapability(
        ["payroll.employees", "payroll.settings.read"],
        ["payroll.employees.read", "payroll.settings.read"]
      )
    ).toBe(true);
    expect(
      hasXeroCapability(["payroll.employees.read"], "payroll.employees")
    ).toBe(false);
  });
});

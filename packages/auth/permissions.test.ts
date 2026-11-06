import { describe, expect, it } from "vitest";
import { hasPermission, isAuthRole } from "./permissions";

describe("static role permissions", () => {
  it("requires every requested action and rejects unknown or empty statements", () => {
    expect(
      hasPermission("manager", {
        approvals: ["approve"],
        plans: ["manageReports"],
      })
    ).toBe(true);
    expect(
      hasPermission("manager", { plans: ["manageReports", "manageAll"] })
    ).toBe(false);
    expect(hasPermission(null, { calendar: ["read"] })).toBe(false);
    expect(hasPermission("viewer", {})).toBe(false);
    expect(hasPermission("viewer", { calendar: [] })).toBe(false);
    expect(hasPermission("viewer", JSON.parse('{"invented":["read"]}'))).toBe(
      false
    );
    expect(
      hasPermission("viewer", JSON.parse('{"calendar":["invented"]}'))
    ).toBe(false);
  });
  it("preserves least privilege and the documented direct-report grant", () => {
    expect(
      hasPermission("viewer", { manualAvailability: ["manageDirectReports"] })
    ).toBe(true);
    expect(hasPermission("viewer", { people: ["manage"] })).toBe(false);
    expect(hasPermission("manager", { settings: ["update"] })).toBe(false);
    expect(hasPermission("admin", { ownership: ["manage"] })).toBe(false);
    expect(hasPermission("owner", { ownership: ["manage"] })).toBe(true);
    for (const role of ["owner", "admin", "manager", "viewer"] as const) {
      expect(hasPermission(role, { organization: ["delete"] })).toBe(false);
    }
    expect(isAuthRole("owner,admin")).toBe(false);
    expect(isAuthRole("future")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  isNavItemVisible,
  navGroups,
  quickActions,
  settingsNavItem,
} from "./nav-items";

describe("isNavItemVisible", () => {
  it("shows items without a roles list to everyone", () => {
    expect(isNavItemVisible(undefined, "viewer")).toBe(true);
    expect(isNavItemVisible(undefined, null)).toBe(true);
    expect(isNavItemVisible(undefined, undefined)).toBe(true);
  });

  it("shows a role-scoped item only to matching roles", () => {
    const permission = { people: ["manage"] } as const;
    expect(isNavItemVisible(permission, "admin")).toBe(true);
    expect(isNavItemVisible(permission, "owner")).toBe(true);
    expect(isNavItemVisible(permission, "manager")).toBe(false);
    expect(isNavItemVisible(permission, "viewer")).toBe(false);
    expect(isNavItemVisible(permission, null)).toBe(false);
  });
});

describe("navigation registry", () => {
  it("hides analytics reports from viewers but shows them to managers", () => {
    const teamGroup = navGroups.find((group) => group.label === "Team");
    const leaveReports = teamGroup?.items.find(
      (item) => item.href === "/analytics/leave-reports"
    );
    expect(leaveReports).toBeDefined();
    expect(isNavItemVisible(leaveReports?.permission, "viewer")).toBe(false);
    expect(isNavItemVisible(leaveReports?.permission, "manager")).toBe(true);
  });

  it("keeps every nav href absolute", () => {
    const allHrefs = [
      ...navGroups.flatMap((group) => group.items.map((item) => item.href)),
      settingsNavItem.href,
      ...quickActions.map((action) => action.href),
    ];
    for (const href of allHrefs) {
      expect(href.startsWith("/")).toBe(true);
    }
  });

  it("restricts admin quick actions to admins and owners", () => {
    const addPerson = quickActions.find(
      (action) => action.href === "/people/new"
    );
    expect(addPerson?.permission).toBeDefined();
    expect(isNavItemVisible(addPerson?.permission, "manager")).toBe(false);
    expect(isNavItemVisible(addPerson?.permission, "admin")).toBe(true);
  });

  it("lets any role reach the everyday create actions", () => {
    const newPlan = quickActions.find((action) => action.href === "/plans/new");
    expect(newPlan?.permission).toBeUndefined();
    expect(newPlan?.keywords).toContain("leave");
    expect(isNavItemVisible(newPlan?.permission, "viewer")).toBe(true);
  });

  it("uses one canonical plan action for leave and availability", () => {
    const planActions = quickActions.filter((action) =>
      ["/availability/new", "/plans/new"].includes(action.href)
    );
    expect(planActions).toHaveLength(1);
    expect(planActions[0]?.href).toBe("/plans/new");
    expect(planActions[0]?.title).toBe("New plan");
  });
});

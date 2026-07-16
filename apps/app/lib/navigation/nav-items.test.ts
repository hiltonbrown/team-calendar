import { describe, expect, it } from "vitest";
import {
  isNavItemVisible,
  navGroups,
  quickActions,
  settingsNavItem,
} from "./nav-items";

describe("isNavItemVisible", () => {
  it("shows items without a roles list to everyone", () => {
    expect(isNavItemVisible(undefined, "org:viewer")).toBe(true);
    expect(isNavItemVisible(undefined, null)).toBe(true);
    expect(isNavItemVisible(undefined, undefined)).toBe(true);
  });

  it("shows a role-scoped item only to matching roles", () => {
    const roles = ["org:admin", "org:owner"];
    expect(isNavItemVisible(roles, "org:admin")).toBe(true);
    expect(isNavItemVisible(roles, "org:owner")).toBe(true);
    expect(isNavItemVisible(roles, "org:manager")).toBe(false);
    expect(isNavItemVisible(roles, "org:viewer")).toBe(false);
    expect(isNavItemVisible(roles, null)).toBe(false);
  });
});

describe("navigation registry", () => {
  it("hides analytics reports from viewers but shows them to managers", () => {
    const teamGroup = navGroups.find((group) => group.label === "Team");
    const leaveReports = teamGroup?.items.find(
      (item) => item.href === "/analytics/leave-reports"
    );
    expect(leaveReports).toBeDefined();
    expect(isNavItemVisible(leaveReports?.roles, "org:viewer")).toBe(false);
    expect(isNavItemVisible(leaveReports?.roles, "org:manager")).toBe(true);
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
    expect(addPerson?.roles).toBeDefined();
    expect(isNavItemVisible(addPerson?.roles, "org:manager")).toBe(false);
    expect(isNavItemVisible(addPerson?.roles, "org:admin")).toBe(true);
  });

  it("lets any role reach the everyday create actions", () => {
    const newLeave = quickActions.find(
      (action) => action.href === "/availability/new"
    );
    expect(newLeave?.roles).toBeUndefined();
    expect(isNavItemVisible(newLeave?.roles, "org:viewer")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { accessControl, organizationRoles } from "./better-auth-permissions";
import { hasPermission, statement } from "./permissions";

// Expected business grants are independent of the implementation's role tables.
const matrix = [
  ["approvals", "review", "owner admin manager"],
  ["approvals", "approve", "owner admin manager"],
  ["approvals", "decline", "owner admin manager"],
  ["approvals", "requestInfo", "owner admin manager"],
  ["approvals", "recoverProviderOutcome", "owner admin"],
  ["audit", "read", "owner admin"],
  ["balances", "read", "owner admin manager viewer"],
  ["balances", "manage", "owner admin"],
  ["billing", "read", "owner admin"],
  ["billing", "checkout", "owner admin"],
  ["billing", "portal", "owner admin"],
  ["calendar", "read", "owner admin manager viewer"],
  ["feeds", "read", "owner admin manager viewer"],
  ["feeds", "subscribe", "owner admin manager viewer"],
  ["feeds", "manageOwn", "owner admin manager viewer"],
  ["feeds", "manageAll", "owner admin"],
  ["invitation", "create", "owner admin"],
  ["invitation", "cancel", "owner admin"],
  ["manualAvailability", "manageOwn", "owner admin manager viewer"],
  ["manualAvailability", "manageDirectReports", "owner admin manager viewer"],
  ["manualAvailability", "manageAll", "owner admin"],
  ["member", "create", "owner admin"],
  ["member", "update", "owner admin"],
  ["member", "delete", "owner admin"],
  ["notifications", "read", "owner admin manager viewer"],
  ["notifications", "manageOwn", "owner admin manager viewer"],
  ["organization", "update", "owner admin"],
  ["organization", "delete", ""],
  ["ownership", "manage", "owner"],
  ["people", "read", "owner admin manager viewer"],
  ["people", "manage", "owner admin"],
  ["people", "readArchived", "owner admin"],
  ["plans", "readOwn", "owner admin manager viewer"],
  ["plans", "submitOwn", "owner admin manager viewer"],
  ["plans", "withdrawOwn", "owner admin manager viewer"],
  ["plans", "manageAll", "owner admin"],
  ["plans", "manageReports", "owner admin manager"],
  ["reports", "read", "owner admin manager"],
  ["settings", "update", "owner admin"],
  ["xero", "connect", "owner admin"],
  ["xero", "sync", "owner admin"],
  ["xero", "manage", "owner admin"],
  ["xero", "removeCompany", "owner"],
] as const;

describe("Better Auth role and permission matrix", () => {
  it("covers every action in the fixed statement", () => {
    expect(
      matrix.map(([resource, action]) => `${resource}:${action}`).sort()
    ).toEqual(
      Object.entries(statement)
        .flatMap(([resource, actions]) =>
          actions.map((action) => `${resource}:${action}`)
        )
        .sort()
    );
    expect(accessControl.statements).toEqual(statement);
  });
  for (const role of ["owner", "admin", "manager", "viewer"] as const) {
    it.each(matrix)(`${role}: %s:%s`, (resource, action, grantedRoles) => {
      const request = { [resource]: [action] };
      const expected = grantedRoles.split(" ").includes(role);
      expect(hasPermission(role, request)).toBe(expected);
      expect(organizationRoles[role].authorize(request).success).toBe(expected);
    });
  }
});

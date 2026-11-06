export const statement = {
  approvals: [
    "review",
    "approve",
    "decline",
    "requestInfo",
    "recoverProviderOutcome",
  ],
  audit: ["read"],
  balances: ["read", "manage"],
  billing: ["read", "checkout", "portal"],
  calendar: ["read"],
  feeds: ["read", "subscribe", "manageOwn", "manageAll"],
  invitation: ["create", "cancel"],
  manualAvailability: ["manageOwn", "manageDirectReports", "manageAll"],
  member: ["create", "update", "delete"],
  notifications: ["read", "manageOwn"],
  organization: ["update", "delete"],
  ownership: ["manage"],
  people: ["read", "manage", "readArchived"],
  plans: ["readOwn", "submitOwn", "withdrawOwn", "manageAll", "manageReports"],
  reports: ["read"],
  settings: ["update"],
  xero: ["connect", "sync", "manage", "removeCompany"],
} as const;

export type AuthRole = "owner" | "admin" | "manager" | "viewer";
export type PermissionRequest = {
  [Resource in keyof typeof statement]?: readonly (typeof statement)[Resource][number][];
};

export const isAuthRole = (role: unknown): role is AuthRole =>
  role === "owner" ||
  role === "admin" ||
  role === "manager" ||
  role === "viewer";

const viewer = {
  balances: ["read"],
  calendar: ["read"],
  feeds: ["read", "subscribe", "manageOwn"],
  manualAvailability: ["manageOwn", "manageDirectReports"],
  notifications: ["read", "manageOwn"],
  people: ["read"],
  plans: ["readOwn", "submitOwn", "withdrawOwn"],
} as const satisfies PermissionRequest;
const manager = {
  ...viewer,
  approvals: ["review", "approve", "decline", "requestInfo"],
  plans: [...viewer.plans, "manageReports"],
  reports: ["read"],
} as const satisfies PermissionRequest;
const admin = {
  ...manager,
  approvals: statement.approvals,
  audit: statement.audit,
  balances: statement.balances,
  billing: statement.billing,
  feeds: statement.feeds,
  invitation: statement.invitation,
  manualAvailability: statement.manualAvailability,
  member: statement.member,
  organization: ["update"],
  people: statement.people,
  plans: statement.plans,
  settings: statement.settings,
  xero: ["connect", "sync", "manage"],
} as const satisfies PermissionRequest;

export const rolePermissions: Record<AuthRole, PermissionRequest> = {
  admin,
  manager,
  owner: { ...admin, ownership: statement.ownership, xero: statement.xero },
  viewer,
};

/** Grants never replace company, ownership, reporting or record-state checks. */
export const hasPermission = (
  role: unknown,
  request: PermissionRequest
): boolean => {
  if (!(isAuthRole(role) && request) || typeof request !== "object") {
    return false;
  }
  const entries = Object.entries(request);
  if (entries.length === 0) {
    return false;
  }
  return entries.every(([resource, actions]) => {
    if (
      !(Object.hasOwn(statement, resource) && Array.isArray(actions)) ||
      actions.length === 0
    ) {
      return false;
    }
    // Object.entries erases the resource key; membership is checked before indexing.
    const key = resource as keyof typeof statement;
    const allowed: readonly string[] = rolePermissions[role][key] ?? [];
    return actions.every(
      (action: unknown) =>
        typeof action === "string" && allowed.includes(action)
    );
  });
};

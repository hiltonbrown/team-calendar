export type XeroMode = "LIVE" | "CONTROLLED";
export type XeroLayer =
  | "provider"
  | "operation"
  | "database"
  | "ui"
  | "worker"
  | "cleanup"
  | "controlled";
export type XeroPrerequisite =
  | "candidate"
  | "owned-fixtures"
  | "approved-contract"
  | "deployed-candidate"
  | "authorised-provider"
  | "isolated-workers"
  | "verified-role-sessions";
export interface XeroScenarioDefinition {
  expected: string;
  id: string;
  name: string;
  prerequisites: readonly XeroPrerequisite[];
  requiredLayers: readonly XeroLayer[];
  requiredMode: XeroMode;
  subcases: readonly string[];
}

export const XERO_SCENARIOS: readonly XeroScenarioDefinition[] = [
  {
    expected:
      "Fresh browser consent and initial connection with exact scoped identities, terminal outcomes and independent observations.",
    id: "X01",
    name: "Fresh browser consent and initial connection",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["primary"],
  },
  {
    expected:
      "Cancelled consent and safe retry with exact scoped identities, terminal outcomes and independent observations.",
    id: "X02",
    name: "Cancelled consent and safe retry",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["primary"],
  },
  {
    expected:
      "OAuth state and intent rejection with exact scoped identities, terminal outcomes and independent observations.",
    id: "X03",
    name: "OAuth state and intent rejection",
    prerequisites: ["candidate", "owned-fixtures", "approved-contract"],
    requiredLayers: ["operation", "database", "controlled"],
    requiredMode: "CONTROLLED",
    subcases: [
      "expired-state",
      "wrong-state",
      "replay",
      "foreign-account",
      "unsafe-return",
    ],
  },
  {
    expected:
      "Initial employee, leave and balance import with exact scoped identities, terminal outcomes and independent observations.",
    id: "X04",
    name: "Initial employee, leave and balance import",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui", "worker"],
    requiredMode: "LIVE",
    subcases: ["employees", "leave-records", "balances", "completion"],
  },
  {
    expected:
      "Empty, paginated and malformed import responses with exact scoped identities, terminal outcomes and independent observations.",
    id: "X05",
    name: "Empty, paginated and malformed import responses",
    prerequisites: ["candidate", "owned-fixtures", "approved-contract"],
    requiredLayers: ["operation", "database", "controlled"],
    requiredMode: "CONTROLLED",
    subcases: [
      "valid-empty",
      "multiple-pages",
      "bad-first-page",
      "bad-middle-page",
      "bad-row",
      "page-cap",
    ],
  },
  {
    expected:
      "Manual identity and calendar preservation with exact scoped identities, terminal outcomes and independent observations.",
    id: "X06",
    name: "Manual identity and calendar preservation",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "retain-person",
      "retain-manual-records",
      "retain-team-feed",
      "personal-calendar",
    ],
  },
  {
    expected:
      "Ambiguous identity review and explicit resolution with exact scoped identities, terminal outcomes and independent observations.",
    id: "X07",
    name: "Ambiguous identity review and explicit resolution",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["review-required", "explicit-resolution"],
  },
  {
    expected:
      "Scheduled discovery of independently created leave with exact scoped identities, terminal outcomes and independent observations.",
    id: "X08",
    name: "Scheduled discovery of independently created leave",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui", "worker"],
    requiredMode: "LIVE",
    subcases: ["primary"],
  },
  {
    expected:
      "Inbound changes preserve canonical and feed identity with exact scoped identities, terminal outcomes and independent observations.",
    id: "X09",
    name: "Inbound changes preserve canonical and feed identity",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["dates", "status", "repeat-import", "stable-uid"],
  },
  {
    expected:
      "Approved Australian draft and submit contract with exact scoped identities, terminal outcomes and independent observations.",
    id: "X10",
    name: "Approved Australian draft and submit contract",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["draft", "submit", "unique-remote-association"],
  },
  {
    expected:
      "Authorised approval and manager isolation with exact scoped identities, terminal outcomes and independent observations.",
    id: "X11",
    name: "Authorised approval and manager isolation",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["authorised-approval", "out-of-scope-manager"],
  },
  {
    expected:
      "Decline reason and subsequent pull with exact scoped identities, terminal outcomes and independent observations.",
    id: "X12",
    name: "Decline reason and subsequent pull",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["primary"],
  },
  {
    expected:
      "Withdrawal before and after approval and processed denial with exact scoped identities, terminal outcomes and independent observations.",
    id: "X13",
    name: "Withdrawal before and after approval and processed denial",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["before-approval", "after-approval", "processed-denial"],
  },
  {
    expected:
      "Uncertain create and duplicate recovery with exact scoped identities, terminal outcomes and independent observations.",
    id: "X14",
    name: "Uncertain create and duplicate recovery",
    prerequisites: ["candidate", "owned-fixtures", "approved-contract"],
    requiredLayers: ["operation", "database", "controlled"],
    requiredMode: "CONTROLLED",
    subcases: [
      "accepted-timeout",
      "duplicate-click",
      "lost-acknowledgement",
      "recovery",
    ],
  },
  {
    expected:
      "Independent Xero leave balance comparison with exact scoped identities, terminal outcomes and independent observations.",
    id: "X15",
    name: "Independent Xero leave balance comparison",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["primary"],
  },
  {
    expected:
      "Shared connection and role boundaries with exact scoped identities, terminal outcomes and independent observations.",
    id: "X16",
    name: "Shared connection and role boundaries",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "member-no-oauth",
      "manager-scope",
      "viewer-scope",
      "admin-denial",
    ],
  },
  {
    expected:
      "Two payroll entities and shared authoriser with exact scoped identities, terminal outcomes and independent observations.",
    id: "X17",
    name: "Two payroll entities and shared authoriser",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "entity-selection",
      "shared-authoriser-refresh",
      "shared-authoriser-reauthorisation",
    ],
  },
  {
    expected:
      "Separate account, entity, record and event isolation with exact scoped identities, terminal outcomes and independent observations.",
    id: "X18",
    name: "Separate account, entity, record and event isolation",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "foreign-account",
      "foreign-entity-id",
      "foreign-record-id",
      "scoped-events",
    ],
  },
  {
    expected:
      "Same-file reconnect, wrong-file rejection and generation fence with exact scoped identities, terminal outcomes and independent observations.",
    id: "X19",
    name: "Same-file reconnect, wrong-file rejection and generation fence",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: ["same-file", "wrong-file", "old-generation"],
  },
  {
    expected:
      "Observed credential refresh and subsequent reads with exact scoped identities, terminal outcomes and independent observations.",
    id: "X20",
    name: "Observed credential refresh and subsequent reads",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "refresh-observed",
      "read-after-refresh",
      "other-mapping-readable",
    ],
  },
  {
    expected:
      "Owned disconnect, history and surviving connection recovery with exact scoped identities, terminal outcomes and independent observations.",
    id: "X21",
    name: "Owned disconnect, history and surviving connection recovery",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "stop-owned-sync",
      "preserve-history",
      "preserve-other-entity",
      "reconnect",
      "shared-reference-detach",
      "last-reference-disconnect",
    ],
  },
  {
    expected:
      "Controlled provider and worker faults with exact scoped identities, terminal outcomes and independent observations.",
    id: "X22",
    name: "Controlled provider and worker faults",
    prerequisites: ["candidate", "owned-fixtures", "approved-contract"],
    requiredLayers: ["operation", "database", "controlled"],
    requiredMode: "CONTROLLED",
    subcases: [
      "auth-refresh",
      "permission-denied",
      "rate-limit",
      "server-error",
      "interrupted-pages",
      "expired-lease",
      "stale-worker",
      "cancellation",
      "cron-bootstrap-race",
    ],
  },
  {
    expected:
      "Open calendar receives background import with exact scoped identities, terminal outcomes and independent observations.",
    id: "X23",
    name: "Open calendar receives background import",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui", "worker"],
    requiredMode: "LIVE",
    subcases: ["primary"],
  },
  {
    expected:
      "ICS content, privacy and publication identity with exact scoped identities, terminal outcomes and independent observations.",
    id: "X24",
    name: "ICS content, privacy and publication identity",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "operation", "database", "ui"],
    requiredMode: "LIVE",
    subcases: [
      "eligible-content",
      "privacy",
      "uid-stability",
      "sequence",
      "withdrawal",
    ],
  },
  {
    expected:
      "Responsive onboarding, progress and recovery accessibility with exact scoped identities, terminal outcomes and independent observations.",
    id: "X25",
    name: "Responsive onboarding, progress and recovery accessibility",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["ui", "database"],
    requiredMode: "LIVE",
    subcases: [
      "390-light",
      "390-dark",
      "768-light",
      "768-dark",
      "1440-light",
      "1440-dark",
      "keyboard-status",
    ],
  },
  {
    expected:
      "Provider, local and worker cleanup and outside-owned invariants with exact scoped identities, terminal outcomes and independent observations.",
    id: "X26",
    name: "Provider, local and worker cleanup and outside-owned invariants",
    prerequisites: [
      "candidate",
      "owned-fixtures",
      "approved-contract",
      "deployed-candidate",
      "authorised-provider",
      "isolated-workers",
      "verified-role-sessions",
    ],
    requiredLayers: ["provider", "database", "worker", "cleanup"],
    requiredMode: "LIVE",
    subcases: [
      "remote-effects",
      "local-residue",
      "queued-retries-drained",
      "settings-restored",
      "outside-owned-unchanged",
    ],
  },
];

export const XERO_SUBCASE_IDS = XERO_SCENARIOS.flatMap((scenario) =>
  scenario.subcases.map((suffix) => `${scenario.id}.${suffix}`)
);
export function scenarioDefinition(id: string): XeroScenarioDefinition {
  const definition = XERO_SCENARIOS.find((entry) => entry.id === id);
  if (!definition) {
    throw new Error("Unknown Xero scenario");
  }
  return definition;
}

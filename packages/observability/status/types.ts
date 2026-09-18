export const publicComponentNames = [
  "App access",
  "Xero connection and synchronisation",
  "Calendar feed delivery",
  "In-app notifications",
  "Email notifications",
] as const;

export type PublicComponentName = (typeof publicComponentNames)[number];
export type PublicComponentState =
  | "operational"
  | "degraded"
  | "outage"
  | "maintenance"
  | "unknown";
export type PublicOverallState =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
  | "unknown";

export interface PublicStatusComponent {
  name: PublicComponentName;
  state: PublicComponentState;
}
export interface PublicStatusUpdate {
  message: string;
  publishedAt: string;
}
export type PublicIncidentState = "active" | "maintenance" | "resolved";
export interface PublicStatusIncident {
  affectedComponents: PublicComponentName[];
  resolvedAt: string | null;
  startedAt: string;
  state: PublicIncidentState;
  title: string;
  updates: PublicStatusUpdate[];
}
export interface PublicStatusSnapshot {
  activeIncidents: PublicStatusIncident[];
  checkedAt: string;
  components: PublicStatusComponent[];
  hostedStatusPageUrl: string;
  incidentAvailability: "available" | "unavailable";
  overallState: PublicOverallState;
  recentIncidents: PublicStatusIncident[];
  subscribable: boolean;
}
export type PublicStatusErrorCode =
  | "configuration"
  | "authentication"
  | "not_found"
  | "rate_limit"
  | "timeout"
  | "network"
  | "provider"
  | "invalid_response"
  | "unknown";
export interface PublicStatusError {
  code: PublicStatusErrorCode;
  hostedStatusPageUrl?: string;
  message: string;
}
